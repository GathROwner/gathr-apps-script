"""Read-only crop-derivative detector for managed event gallery images.

It receives newline-delimited JSON events on stdin and writes a JSON report.
Only a near pixel-level match between a smaller image and a subregion of a
larger sibling image is reported. It never mutates Firestore or Cloud Storage.
"""
import json, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from urllib.request import urlopen

import numpy as np
from PIL import Image

THRESHOLD = 0.07
HASH_SIZE = 48
CACHE = {}

def load_image(url):
    if url in CACHE:
        return CACHE[url]
    try:
        with urlopen(url, timeout=15) as response:
            image = Image.open(BytesIO(response.read())).convert('L')
        CACHE[url] = (image, None)
    except Exception as error:
        CACHE[url] = (None, str(error))
    return CACHE[url]

def crop_score(crop, full):
    full_width, full_height = full.size
    crop_width, crop_height = crop.size
    ratio = crop_width / crop_height
    if full_width / full_height >= ratio:
        window_height = full_height
        window_width = round(window_height * ratio)
    else:
        window_width = full_width
        window_height = round(window_width / ratio)
    if window_width < 8 or window_height < 8:
        return None
    target = np.asarray(crop.resize((HASH_SIZE, HASH_SIZE)), dtype=float)
    target = (target - target.mean()) / (target.std() + 1e-6)
    best = (float('inf'), None)
    for y in np.linspace(0, full_height - window_height, 13).round().astype(int):
        for x in np.linspace(0, full_width - window_width, 13).round().astype(int):
            candidate = np.asarray(full.crop((x, y, x + window_width, y + window_height)).resize((HASH_SIZE, HASH_SIZE)), dtype=float)
            candidate = (candidate - candidate.mean()) / (candidate.std() + 1e-6)
            score = float(np.mean(np.abs(candidate - target)))
            if score < best[0]:
                best = (score, [int(x), int(y), int(window_width), int(window_height)])
    return best

def inspect(event):
    urls = event['mediaUrls']
    loaded = {url: load_image(url) for url in urls}
    matches, errors = [], []
    for url, (_, error) in loaded.items():
        if error:
            errors.append({'url': url, 'error': error})
    for crop_url in urls:
        crop, crop_error = loaded[crop_url]
        if crop_error:
            continue
        crop_area = crop.width * crop.height
        for full_url in urls:
            if crop_url == full_url:
                continue
            full, full_error = loaded[full_url]
            if full_error or crop_area >= full.width * full.height * 0.98:
                continue
            result = crop_score(crop, full)
            if result and result[0] <= THRESHOLD:
                matches.append({'cropUrl': crop_url, 'fullUrl': full_url, 'score': round(result[0], 5), 'fullWindow': result[1]})
    return {**event, 'matches': matches, 'errors': errors}

events = [json.loads(line) for line in sys.stdin if line.strip()]
results = []
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = [executor.submit(inspect, event) for event in events]
    for completed, future in enumerate(as_completed(futures), 1):
        result = future.result()
        if result['matches'] or result['errors']:
            results.append(result)
        if completed % 25 == 0 or completed == len(events):
            print(json.dumps({'progress': f'{completed}/{len(events)}', 'matchEvents': sum(bool(item['matches']) for item in results), 'errorEvents': sum(bool(item['errors']) for item in results)}), file=sys.stderr, flush=True)
print(json.dumps({'threshold': THRESHOLD, 'scannedEventCount': len(events), 'findingCount': sum(bool(item['matches']) for item in results), 'decodeErrorEventCount': sum(bool(item['errors']) for item in results), 'findings': results}))
