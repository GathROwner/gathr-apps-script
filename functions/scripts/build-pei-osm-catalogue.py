"""Offline, pure OSM catalogue importer. Requires workspace-local pyosmium4.3.2.
Usage: PYTHONPATH=<workspace-tools> python build-pei-osm-catalogue.py <source-dir>
No network, credentials, database or proprietary venue input is used.
"""
import collections
import hashlib
import json
import math
import pathlib
import sys
import time
import osmium

SOURCE_URL = 'https://download.geofabrik.de/north-america/canada/prince-edward-island-latest.osm.pbf'
POLY_URL = 'https://download.geofabrik.de/north-america/canada/prince-edward-island.poly'
CATEGORIES = ('amenity', 'shop', 'tourism', 'leisure')
TAG_KEYS = CATEGORIES + ('name', 'area', 'type', 'addr:housenumber', 'addr:street', 'addr:city', 'addr:province', 'addr:state', 'addr:postcode')

def selected(tags):
    return bool(tags.get('name')) and any(tags.get(k) for k in CATEGORIES)

def tags_of(obj):
    return {key: obj.tags.get(key) for key in TAG_KEYS if obj.tags.get(key)}

def bbox(points):
    if not points:
        raise ValueError('Cannot establish conservative geometry bounds')
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]

def union(boxes):
    return bbox([(b[0], b[1]) for b in boxes] + [(b[2], b[3]) for b in boxes])

def supported_ring(points):
    if not 4 <= len(points) <= 256 or points[0] != points[-1]:
        return False
    lat, lon = points[0]
    for a, b in points:
        h = math.sin(math.radians(a-lat)/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(lat))*math.sin(math.radians(b-lon)/2)**2
        if abs(a) > 85 or abs(b-lon) > .1 or 12742000*math.asin(min(1, math.sqrt(h))) > 5000:
            return False
    area = sum((points[i-1][1]-lon)*(points[i][0]-lat)-(points[i][1]-lon)*(points[i-1][0]-lat) for i in range(1,len(points)))
    return abs(area) >= 1e-12

def polygon_file(path):
    lines = iter(path.read_text().splitlines())
    next(lines)
    rings = []
    for line in lines:
        label = line.strip()
        if label == 'END':
            break
        points = []
        for coordinate in lines:
            if coordinate.strip() == 'END':
                break
            lon, lat = map(float, coordinate.split())
            points.append({'lat': lat, 'lon': lon})
        if len(points) < 4 or points[0] != points[-1]:
            raise ValueError('Invalid official extent ring')
        rings.append({'hole': label.startswith('!'), 'points': points})
    if not rings or not any(not ring['hole'] for ring in rings):
        raise ValueError('Official extract extent missing')
    return rings

class Relations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.graph = {}
        self.selected = {}
    def relation(self, obj):
        members = [(member.type, member.ref, member.role) for member in obj.members]
        self.graph[obj.id] = members
        if selected(obj.tags):
            self.selected[obj.id] = tags_of(obj)

class Objects(osmium.SimpleHandler):
    def __init__(self, relations):
        super().__init__()
        self.relations = relations
        self.required = {'n': set(), 'w': set(), 'r': set()}
        self.node_points = {}
        self.way_boxes = {}
        self.elements = []
        self.limitations = []
        self.counts = collections.Counter()
        self.named = collections.Counter()
        self.matches = collections.Counter()
        self.geometry = collections.Counter()
        for ref in relations.selected:
            self.require('r', ref, set())
    def require(self, kind, ref, ancestry):
        self.required[kind].add(ref)
        if kind == 'r':
            if ref in ancestry or ref not in self.relations.graph:
                raise ValueError('Missing/cyclic selected relation reference: '+str(ref))
            for child_kind, child_ref, _ in self.relations.graph[ref]:
                self.require(child_kind, child_ref, ancestry | {ref})
    def observe(self, obj, kind):
        self.counts[kind] += 1
        if obj.tags.get('name'):
            self.named[kind] += 1
        if selected(obj.tags):
            self.matches[kind] += 1
    def node(self, obj):
        self.observe(obj, 'node')
        if selected(obj.tags) or obj.id in self.required['n']:
            if not obj.location.valid():
                raise ValueError('Missing selected/referenced node location')
            point = (obj.location.lat, obj.location.lon)
            if obj.id in self.required['n']:
                self.node_points[obj.id] = point
            if selected(obj.tags):
                self.elements.append({'type': 'node', 'id': obj.id, 'lat': point[0], 'lon': point[1], 'tags': tags_of(obj)})
    def way(self, obj):
        self.observe(obj, 'way')
        if not selected(obj.tags) and obj.id not in self.required['w']:
            return
        if any(not node.location.valid() for node in obj.nodes):
            raise ValueError('Missing selected/referenced way node: '+str(obj.id))
        points = [(node.location.lat, node.location.lon) for node in obj.nodes]
        bounds = bbox(points)
        if obj.id in self.required['w']:
            self.way_boxes[obj.id] = bounds
        if selected(obj.tags):
            item = {'type': 'way', 'id': obj.id, 'tags': tags_of(obj), 'center': {'lat': (bounds[0]+bounds[2])/2, 'lon': (bounds[1]+bounds[3])/2}, 'geometry': [{'lat': a, 'lon': b} for a,b in points]}
            self.elements.append(item)
            closed_area = obj.is_closed() and obj.tags.get('area') != 'no'
            if closed_area and supported_ring(points):
                self.geometry['supportedClosedWays'] += 1
            elif closed_area:
                self.geometry['unsupportedClosedWays'] += 1
                self.limitations.append({'type': 'way', 'id': obj.id, 'bounds': bounds, 'reason': 'unsupported_closed_way'})
            else:
                self.geometry['openOrNonAreaWaysWithCompleteCoordinates'] += 1
    def relation(self, obj):
        self.observe(obj, 'relation')
    def relation_box(self, ref, ancestry=None):
        ancestry = ancestry or set()
        if ref in ancestry:
            raise ValueError('Cyclic relation geometry')
        boxes = []
        for kind, child, _ in self.relations.graph[ref]:
            if kind == 'n':
                point = self.node_points[child]
                boxes.append([*point, *point])
            elif kind == 'w':
                boxes.append(self.way_boxes[child])
            else:
                boxes.append(self.relation_box(child, ancestry | {ref}))
        return union(boxes)
    def finish(self):
        for ref, tags in self.relations.selected.items():
            bounds = self.relation_box(ref)
            # Match existing Overpass-center policy for relations: a pin at the
            # complete member bounding-box center, never a fabricated footprint.
            self.elements.append({'type': 'relation', 'id': ref, 'tags': tags,
                'center': {'lat': (bounds[0]+bounds[2])/2, 'lon': (bounds[1]+bounds[3])/2},
                'bounds': {'minlat': bounds[0], 'minlon': bounds[1], 'maxlat': bounds[2], 'maxlon': bounds[3]},
                'geometryMode': 'complete_member_bounds_point_only',
                'members': [{'type': {'n':'node','w':'way','r':'relation'}[kind], 'ref': child, 'role': role} for kind,child,role in self.relations.graph[ref]]})
        self.geometry['relationsWithCompleteMemberBoundsPointOnly'] = len(self.relations.selected)

def main():
    started = time.perf_counter()
    source = pathlib.Path(sys.argv[1]).resolve()
    output = pathlib.Path(__file__).resolve().parents[1] / 'src/social/data'
    pbf = source / 'prince-edward-island-latest.osm.pbf'
    raw = pbf.read_bytes()
    md5 = hashlib.md5(raw).hexdigest()
    expected = (source / 'prince-edward-island-latest.osm.pbf.md5').read_text().split()[0]
    if md5 != expected:
        raise ValueError('Published PBF MD5 mismatch')
    with osmium.io.Reader(str(pbf)) as reader:
        source_time = reader.header().get('osmosis_replication_timestamp')
        sequence = reader.header().get('osmosis_replication_sequence_number')
    if not source_time:
        raise ValueError('Missing actual source timestamp')
    relations = Relations(); relations.apply_file(str(pbf))
    objects = Objects(relations); objects.apply_file(str(pbf), locations=True)
    objects.finish() # Missing/unbounded references abort, never publish partial data.
    elements = sorted(objects.elements, key=lambda item: (item['type'], item['id']))
    manifest = {'schemaVersion': 1, 'importerVersion': 1, 'region': 'PEI pilot', 'sourceUrl': SOURCE_URL,
        'sourceTimestamp': source_time, 'sequence': sequence, 'pbfBytes': len(raw),
        'pbfMd5': md5, 'pbfSha256': hashlib.sha256(raw).hexdigest(), 'extentUrl': POLY_URL,
        'extentSha256': hashlib.sha256((source/'prince-edward-island.poly').read_bytes()).hexdigest(),
        'extent': polygon_file(source/'prince-edward-island.poly'), 'categories': list(CATEGORIES),
        'allObjects': dict(objects.counts), 'namedObjects': dict(objects.named), 'namedCategoryObjects': dict(objects.matches),
        'geometry': dict(objects.geometry), 'missingReferences': 0, 'elementCount': len(elements),
        'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0', 'licenseUrl': 'https://www.openstreetmap.org/copyright'}
    payload = {'manifest': manifest, 'limitations': objects.limitations, 'elements': elements}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    output.mkdir(parents=True, exist_ok=True)
    target = output/'pei-osm-catalogue.json'
    temporary = target.with_suffix('.json.tmp'); temporary.write_bytes(encoded); temporary.replace(target)
    (output/'pei-osm-catalogue.sha256').write_text(hashlib.sha256(encoded).hexdigest()+'\n',encoding='ascii')
    receipt = {'catalogueBytes': len(encoded), 'catalogueSha256': hashlib.sha256(encoded).hexdigest(),
        'importSeconds': round(time.perf_counter()-started,3), 'manifest': manifest, 'limitations': len(objects.limitations)}
    (source/'import-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
    print(json.dumps(receipt))

if __name__ == '__main__':
    main()
