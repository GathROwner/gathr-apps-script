"""Read-only saved-evidence analysis; creates no live provider/parser changes."""
import collections, datetime, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
D = ROOT / 'functions/artifacts/activity-prefilter-oct17'
OLD = ROOT / 'functions/artifacts/scraper-one-oct17'
def load(path): return json.loads(path.read_text(encoding='utf-8'))
def read(name): return load(D / (name + '.json'))
def save(name, value): (D / (name + '.json')).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')
def normalize(url): return str(url).replace('http://', 'https://').replace('https://facebook.com/', 'https://www.facebook.com/').rstrip('/').lower()

m, p = read('manifest'), read('plan')
if any(not e.get('collected') for e in m['runs']): raise RuntimeError('Uncollected/active runs; no final report')
baseline = load(OLD / 'official-items.json')
baseline_posts = [x for x in baseline if x.get('postId') and not x.get('error')]
counts = collections.Counter(normalize(x.get('inputUrl')) for x in baseline_posts)
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'baselineRun': p['baselineRun'], 'baselineCutoff': p['baselineCutoff'], 'baselinePositivePages': len(counts), 'baselinePosts': len(baseline_posts), 'runs': [], 'totalActualActorChargeUsd': round(sum(e.get('usageTotalUsd') or 0 for e in m['runs']), 8), 'productionChanged': False, 'comparisonLimitations': ['Historical frozen window; live captures hours apart, not a simultaneous full-content control.', 'One-post scout tests page activity, not post/media completeness or full importer compatibility.', 'Repeat uses the same frozen window shortly after warm-up; not a next-day missed-activity test.', 'Combined scout plus current-provider full-content speed and cost are not measured.']}
for e in m['runs']:
    s, rows = read(e['id'] + '-summary'), read(e['id'] + '-items')
    pages = {normalize(x['input']): x for x in s['pages']}
    requested = {normalize(u): u for u in e['input']['startUrls']}
    decisions = []
    for key, url in requested.items():
        page = pages.get(key)
        decision = 'full_scrape_activity' if page and page.get('delivered', 0) else 'quiet_candidate' if page and page.get('status') in {'ok', 'empty'} and not page.get('error') else 'fallback_uncertain'
        if page and page.get('status') == 'empty' and page.get('error') == 'no public posts in this date window': decision = 'quiet_candidate'
        decisions.append({'input': url, 'decision': decision, 'actorStatus': page.get('status') if page else 'missing_summary', 'baselinePostCount': counts.get(key, 0), 'error': page.get('error') if page else 'Input absent from per-page result'})
    misses = [x for x in decisions if x['baselinePostCount'] and x['decision'] != 'full_scrape_activity'] if e['label'].endswith('warm') else []
    falsequiet = [x for x in misses if x['decision'] == 'quiet_candidate']
    save(e['id'] + '-decisions', decisions)
    entry = {k: e.get(k) for k in ['label', 'id', 'status', 'elapsedSeconds', 'usageTotalUsd', 'rows']}
    entry.update({'inputCount': len(requested), 'summaryCount': len(pages), 'decisions': dict(collections.Counter(x['decision'] for x in decisions)), 'missedHistoricalPositivePages': misses, 'falseQuietHistoricalPositivePages': falsequiet, 'requests': s.get('requests'), 'wireBytes': s.get('wireBytes'), 'calls': s.get('calls'), 'blocked': s.get('blocked'), 'notFound': s.get('notFound'), 'errors': s.get('errors'), 'budgetReached': s.get('budgetReached'), 'sharedPostRows': [{'input': x.get('input_url'), 'postId': x.get('post_id'), 'outerPublishedAt': x.get('published_at'), 'attachedPostPresent': bool(x.get('attached_post'))} for x in rows if x.get('type') == 'share' or x.get('attached_post')]})
    if e['label'].endswith('repeat'):
        warm = next(x for x in m['runs'] if x['label'] == e['label'].replace('repeat', 'warm'))
        a, b = read(warm['id'] + '-monitor-state'), read(e['id'] + '-monitor-state')
        entry['activityWatermarksStable'] = set(a) == set(b) and all(a[k].get('newestTime') == b[k].get('newestTime') and a[k].get('seenIds') == b[k].get('seenIds') and a[k].get('head', {}).get('id') == b[k].get('head', {}).get('id') for k in a)
    result['runs'].append(entry)
save('analysis', result)
print(json.dumps({k:v for k,v in result.items() if k != 'runs'}))
print(json.dumps([{k:v for k,v in e.items() if k not in {'sharedPostRows','missedHistoricalPositivePages'}} for e in result['runs']], indent=2))
