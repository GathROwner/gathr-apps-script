import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySpatialEvent } from './spatialEventClassifier.js';

test('confirmed parade street sequence is a high-confidence route', () => {
  const result = classifySpatialEvent({
    name: 'Gold Cup Parade',
    description: 'The parade follows the official street sequence below.',
    combinedText: [
      'Start: Queen Charlotte Intermediate School',
      'Route: North River Road -> Brighton Road -> Euston Street -> Great George Street -> Grafton Street -> Pownal Street -> Fitzroy Street',
      'Finish: Fitzroy Street and Terry Fox Drive',
    ].join('\n'),
  });

  assert.equal(result.kind, 'route');
  assert.equal(result.representation, 'route');
  assert.equal(result.confidence, 'high');
  assert.equal(result.routeEvidenceLevel, 'official_full_route');
  assert.equal(result.confirmedStreets.length, 7);
  assert.deepEqual(result.locations.map((entry) => entry.role), ['start', 'finish']);
});

test('stops-only run is a route but cannot claim a confirmed course', () => {
  const result = classifySpatialEvent({
    name: 'Community 5K Fun Run',
    description: 'Route details will be announced later.',
    combinedText: 'Start: Civic Centre\nTurnaround: Highway 1 marker\nFinish: Civic Centre',
  });

  assert.equal(result.kind, 'route');
  assert.equal(result.routeEvidenceLevel, 'stops_only');
  assert.equal(result.confirmedStreets.length, 0);
  assert.ok(result.reviewReasons.includes('route_candidate_requires_geometry_review'));
});

test('a run held inside one venue is not automatically treated as a route', () => {
  const result = classifySpatialEvent({
    name: 'Treadmill Fun Run',
    description: 'A stationary treadmill challenge inside the fitness centre.',
    location: 'Cornwall Fitness Centre',
  });

  assert.equal(result.kind, 'single_location');
  assert.equal(result.representation, 'venue');
});

test('traffic closure alone is not converted into a route event', () => {
  const result = classifySpatialEvent({
    name: 'Traffic Advisory',
    description: 'Road closure and detour for motorists along Queen Street. Expect delays.',
  });

  assert.notEqual(result.kind, 'route');
  assert.ok(result.reviewReasons.includes('traffic_notice_not_event'));
});

test('official festival locations are unordered multi-location points', () => {
  const result = classifySpatialEvent({
    name: 'Charlottetown Busker Festival',
    description: 'Performances at multiple locations downtown.',
    combinedText: "Locations: Victoria Row; Founders Food Hall & Market; Peake's Quay",
  });

  assert.equal(result.kind, 'multi_location');
  assert.equal(result.representation, 'area');
  assert.equal(result.ordered, false);
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.locations.map((entry) => entry.label), [
    'Victoria Row',
    'Founders Food Hall & Market',
    "Peake's Quay",
  ]);
});

test('same physical location repeated by alias collapses to one point', () => {
  const result = classifySpatialEvent({
    name: 'Market Day',
    modelSpatialEvidence: {
      kind: 'multi_location',
      locations: [
        { label: 'Founders Food Hall', address: '6 Prince St', certainty: 'confirmed' },
        { label: 'Founders Food Hall & Market', address: '6 Prince St', certainty: 'confirmed' },
      ],
    },
  });

  assert.equal(result.locations.length, 1);
  assert.ok(result.reviewReasons.includes('multi_location_names_not_fully_extracted'));
});

test('separate dated city occurrences must not become one multi-location event', () => {
  const result = classifySpatialEvent({
    name: 'Remembering The Bog community meetings',
    combinedText: [
      'September 17 - Charlottetown',
      'September 22 - Montague',
      'September 23 - Summerside',
    ].join('\n'),
  });

  assert.equal(result.kind, 'separate_occurrences');
  assert.equal(result.representation, 'none');
  assert.ok(result.reviewReasons.includes('split_location_occurrences_before_publication'));
});

test('rooms and stages inside one host do not become separate map locations', () => {
  const result = classifySpatialEvent({
    name: 'Arts Centre Open House',
    location: 'Confederation Centre of the Arts',
    combinedText: 'Locations: Main Stage; Studio 1; The Mack',
  });

  assert.equal(result.kind, 'single_location');
});

test('online-only event is classified without a venue', () => {
  const result = classifySpatialEvent({
    name: 'Virtual author talk',
    description: 'Join online via Zoom. No in-person gathering.',
  });

  assert.equal(result.kind, 'online');
  assert.equal(result.representation, 'none');
});

test('model-extracted route evidence is normalized and remains review-gated', () => {
  const result = classifySpatialEvent({
    name: 'Harbour Walk',
    modelSpatialEvidence: {
      kind: 'route',
      ordered: true,
      locations: [
        { label: 'Founders Hall', role: 'start', certainty: 'confirmed' },
        { label: 'Victoria Park', role: 'finish', certainty: 'possible' },
      ],
      confirmedStreets: ['Water Street', 'Great George Street'],
      evidenceNotes: 'Street sequence printed on poster',
    },
  });

  assert.equal(result.kind, 'route');
  assert.equal(result.routeEvidenceLevel, 'official_full_route');
  assert.equal(result.locations[1].certainty, 'possible');
  assert.ok(result.reviewReasons.includes('route_candidate_requires_geometry_review'));
});

test('partial official street sequence remains a partial route', () => {
  const result = classifySpatialEvent({
    name: 'Community Parade',
    combinedText: 'Route: Queen Street -> Water Street\nThe remaining route is TBC.',
  });
  assert.equal(result.kind, 'route');
  assert.equal(result.routeEvidenceLevel, 'official_partial_route');
  assert.equal(result.ordered, true);
});

test('route-like race title without details is review-gated with inferred evidence', () => {
  const result = classifySpatialEvent({
    name: 'Harbour 10K Race Route',
    description: 'Course details coming soon.',
  });
  assert.equal(result.kind, 'route');
  assert.equal(result.routeEvidenceLevel, 'inferred');
  assert.ok(result.reviewReasons.includes('route_missing_explicit_stops_or_streets'));
});

test('out-and-back can use the same confirmed start and finish point', () => {
  const result = classifySpatialEvent({
    name: 'Just Live Fun Run',
    combinedText: 'Start: Cornwall Civic Centre\nTurnaround: Route 1 marker\nFinish: Cornwall Civic Centre',
  });
  assert.equal(result.kind, 'route');
  assert.equal(result.routeEvidenceLevel, 'stops_only');
  assert.equal(result.locations.length, 2);
  assert.equal(result.locations[0].label, 'Cornwall Civic Centre');
});

test('water parade stays a route without pretending it follows roads', () => {
  const result = classifySpatialEvent({
    name: 'Harbour Boat Parade',
    combinedText: 'Start: Charlottetown Harbour\nFinish: Victoria-by-the-Sea harbour',
  });
  assert.equal(result.kind, 'route');
  assert.equal(result.confirmedStreets.length, 0);
  assert.equal(result.routeEvidenceLevel, 'stops_only');
});

test('inline start and finish labels are preserved as route stops', () => {
  const result = classifySpatialEvent({
    name: 'East Point Lighthouse Run/Relay',
    description: 'Point-to-point race route from East Point Lighthouse to Souris Lighthouse.',
    location: 'East Point Lighthouse (start) / Souris Lighthouse on MacPhee Avenue (finish)',
  });

  assert.equal(result.kind, 'route');
  assert.equal(result.routeEvidenceLevel, 'stops_only');
  assert.deepEqual(result.locations.map((entry) => [entry.label, entry.role]), [
    ['East Point Lighthouse', 'start'],
    ['Souris Lighthouse on MacPhee Avenue', 'finish'],
  ]);
});

test('trail route preserves the named trail as partial evidence', () => {
  const result = classifySpatialEvent({
    name: 'Confederation Trail Run',
    combinedText: 'Route: Confederation Trail',
  });
  assert.equal(result.kind, 'route');
  assert.equal(result.routeEvidenceLevel, 'official_partial_route');
});

test('traffic advisory for a real parade does not create a second route event', () => {
  const result = classifySpatialEvent({
    name: 'Traffic Advisory',
    description: 'Road closure for the Gold Cup Parade route. Motorists should expect delays.',
  });
  assert.notEqual(result.kind, 'route');
  assert.ok(result.reviewReasons.includes('traffic_notice_not_event'));
});

test('multi-location cue without named places remains incomplete review evidence', () => {
  const result = classifySpatialEvent({
    name: 'Island Arts Festival',
    description: 'Events at various locations across PEI.',
  });
  assert.equal(result.kind, 'multi_location');
  assert.equal(result.confidence, 'medium');
  assert.ok(result.reviewReasons.includes('multi_location_names_not_fully_extracted'));
});

test('confirmed and possible festival points preserve different certainty', () => {
  const result = classifySpatialEvent({
    name: 'Downtown Festival',
    modelSpatialEvidence: {
      kind: 'multi_location',
      ordered: false,
      locations: [
        { label: 'Victoria Row', certainty: 'confirmed' },
        { label: 'TBC waterfront stage', certainty: 'possible' },
      ],
    },
  });
  assert.equal(result.kind, 'multi_location');
  assert.deepEqual(result.locations.map((entry) => entry.certainty), ['confirmed', 'possible']);
  assert.equal(result.ordered, false);
});

test('physical plus online access keeps the physical venue representation', () => {
  const result = classifySpatialEvent({
    name: 'Hybrid author talk',
    description: 'Attend inside the library or join by Zoom.',
    location: 'Charlottetown Library Learning Centre',
  });
  assert.equal(result.kind, 'single_location');
  assert.equal(result.representation, 'venue');
});

test('5K price promotion is not enough to invent a route', () => {
  const result = classifySpatialEvent({
    name: 'Save $5K on your next vehicle',
    description: 'Limited-time dealership promotion.',
    location: 'Island Auto',
  });
  assert.equal(result.kind, 'single_location');
});

test('model multi-location claim cannot turn rooms in one host into map points', () => {
  const result = classifySpatialEvent({
    name: 'Theatre Open House',
    location: 'Confederation Centre of the Arts',
    modelSpatialEvidence: {
      kind: 'multi_location',
      locations: ['Main Stage', 'Studio 1', 'Lobby'],
    },
  });
  assert.equal(result.kind, 'single_location');
});

test('different dated cities override a misleading multi-location model claim', () => {
  const result = classifySpatialEvent({
    name: 'Community consultation tour',
    combinedText: 'September 17 - Charlottetown\nSeptember 22 - Montague\nSeptember 23 - Summerside',
    modelSpatialEvidence: { kind: 'multi_location' },
  });
  assert.equal(result.kind, 'separate_occurrences');
});

test('numbered schedule items and times do not become locations', () => {
  const result = classifySpatialEvent({
    name: 'Busker Festival Saturday schedule',
    description: '1. Juggling 10:00\n2. Music 11:30\n3. Magic 13:00',
    location: 'Victoria Row',
  });
  assert.equal(result.kind, 'single_location');
  assert.equal(result.locations.length, 0);
});
