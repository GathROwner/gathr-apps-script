"""Authorized isolated activity-scout trial. No production acquisition or ingestion."""
import concurrent.futures, datetime, importlib.util, json, pathlib, sys, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
D = ROOT / 'functions/artifacts/activity-prefilter-oct17'
D.mkdir(exist_ok=True)
spec = importlib.util.spec_from_file_location('prior', ROOT / 'firebase/test-scraper-one-oct17.py')
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
api, now, TERMINAL = prior.api, prior.now, prior.TERMINAL
ACTOR = 'kiZdaJePboSkd43aZ'
BUILD = '0.1.9'

def save(name, value):
    (D / (name + '.json')).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')

def read(name):
    return json.loads((D / (name + '.json')).read_text(encoding='utf-8'))

def manifest():
    return read('manifest') if (D / 'manifest.json').exists() else {'createdAt': now(), 'maximumActorChargeUsd': 1.5, 'runs': []}

def check():
    account = api('users/me')['data']
    if account['id'] != 'n2roZf9gnccp8qN83' or not account.get('isPaying'):
        raise RuntimeError('Account/tier mismatch')
    hooks = prior.safe_hooks()
    if hooks != read('webhooks-before'):
        raise RuntimeError('Webhook routing drift')
    for h in hooks:
        c = h.get('condition') or {}
        if h.get('isEnabled') and (c.get('actorId') == ACTOR or not any(c.get(k) for k in ['actorId', 'actorTaskId', 'actorRunId'])):
            raise RuntimeError('Candidate ingestion isolation failed')
    b = api('actor-builds/' + read('build')['id'])['data']
    if b['id'] != read('build')['id'] or b['buildNumber'] != BUILD:
        raise RuntimeError('Pinned build mismatch')
    a = api('acts/' + ACTOR)['data']
    price = a['pricingInfos'][-1]['pricingPerEvent']['actorChargeEvents']
    if set(price) != {'post-scraped', 'post-details'} or price['post-scraped']['eventPriceUsd'] != .0012:
        raise RuntimeError('Pricing drift')
    active = [r['id'] for r in api('acts/' + ACTOR + '/runs?limit=100&desc=true')['data']['items'] if r['status'] not in TERMINAL]
    if active:
        raise RuntimeError('Candidate already active: ' + str(active))

def prepare():
    old = ROOT / 'functions/artifacts/scraper-one-oct17'
    sample = json.loads((old / 'corrected-daily-20-plan.json').read_text())
    control = json.loads((old / 'comparison-plan.json').read_text())
    bad = ['Mussels', 'Decker', 'Gillis', 'Hungry']
    extra = [u for u in control['sourceUrls'] if any(x.lower() in u.lower() for x in bad)]
    sources = list(dict.fromkeys(sample['sources'] + extra))
    p = {'createdAt': now(), 'sources': sources, 'fullSources': control['sourceUrls'], 'baselineRun': control['officialRun']['id'], 'baselineCutoff': control['comparisonCutoff'], 'baselinePostCounts': sample['baselinePostsBySource'], 'startDate': '2026-10-16', 'endDate': '2026-10-17', 'sampleStoreName': 'gathr-activity-shadow-oct17-' + datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S'), 'fullStoreName': 'gathr-activity-full-shadow-oct17-' + datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S'), 'policy': 'Historical positive pages are recall controls. Empty output alone is never quiet proof. No production actor, webhook, parser, event, review, venue, media, schedule or secret changes. Stateful writes only to dedicated test stores. No repeated retries of source holds.'}
    if (D / 'plan.json').exists():
        raise RuntimeError('Plan already exists; preserve it')
    save('plan', p)
    print(json.dumps({'sources': len(sources), 'positiveControls': sum(v > 0 for v in p['baselinePostCounts'].values()), 'extra': extra}))

def launch(label):
    check()
    m, p = manifest(), read('plan')
    if any(e['label'] == label for e in m['runs']):
        raise RuntimeError('Launch intent exists; never retry unknown outcome')
    if any(e.get('status') not in TERMINAL for e in m['runs']):
        raise RuntimeError('Prior launch unresolved')
    if label not in {'sample-warm', 'sample-repeat', 'full-warm', 'full-repeat', 'exact-id-probe'}:
        raise RuntimeError('Unknown label')
    full = label.startswith('full')
    if full and not (D / 'sample-qualified.json').exists():
        raise RuntimeError('Full trial requires recorded sample adjudication')
    if label.endswith('repeat') and not any(e['label'] == label.replace('repeat', 'warm') and e.get('collected') for e in m['runs']):
        raise RuntimeError('Repeat requires collected warm trial')
    urls = p['fullSources'] if full else p['sources']
    if label == 'exact-id-probe':
        urls = read('exact-id-probe-plan')['sourceIds']
    inp = {'startUrls': urls, 'startDate': p['startDate'], 'endDate': p['endDate'], 'postType': 'all', 'minReactions': 0, 'minComments': 0, 'keywordFilter': '', 'includePostDetails': False, 'monitorMode': True, 'monitorStoreName': p['fullStoreName'] if full else p['sampleStoreName'], 'maxPostsPerPage': 1, 'maxItems': 0, 'compact': False, 'proxyConfiguration': {'useApifyProxy': True, 'apifyProxyGroups': ['RESIDENTIAL'], 'apifyProxyCountry': 'US'}, 'maxConcurrency': 8}
    if label == 'exact-id-probe':
        inp.update({'monitorMode': False, 'monitorStoreName': p['sampleStoreName'] + '-exact-id'})
    budget = round(len(urls) * .0012 + .000001, 6)
    committed = sum(e.get('usageTotalUsd', e['reservedUsd']) or 0 for e in m['runs'])
    if committed + budget > m['maximumActorChargeUsd']:
        raise RuntimeError('Budget exhausted')
    e = {'label': label, 'input': inp, 'reservedUsd': budget, 'intentAt': now(), 'status': 'LAUNCHING'}
    m['runs'].append(e)
    save('manifest', m)
    q = urllib.parse.urlencode({'build': BUILD, 'timeout': 600, 'memory': 512, 'maxTotalChargeUsd': budget, 'restartOnError': 'false', 'forcePermissionLevel': 'LIMITED_PERMISSIONS'})
    try:
        r = api('acts/' + ACTOR + '/runs?' + q, inp)['data']
        e.update({'id': r['id'], 'datasetId': r['defaultDatasetId'], 'keyValueStoreId': r['defaultKeyValueStoreId'], 'status': r['status']})
        save(r['id'] + '-launch', r)
    except Exception:
        e['status'] = 'LAUNCH_OUTCOME_UNKNOWN'
        save('manifest', m)
        raise
    save('manifest', m)
    print(json.dumps({'label': label, 'runId': e['id'], 'pages': len(urls), 'reservedUsd': budget}))

def collect():
    m = manifest()
    for e in m['runs']:
        if not e.get('id') or e.get('collected'):
            continue
        r = api('actor-runs/' + e['id'])['data']
        save(e['id'] + '-run', r)
        e.update({'status': r['status'], 'usageTotalUsd': r.get('usageTotalUsd'), 'statusMessage': r.get('statusMessage')})
        req = urllib.request.Request('https://api.apify.com/v2/actor-runs/' + e['id'] + '/log', headers={'Authorization': 'Bearer ' + prior.TOKEN})
        with urllib.request.urlopen(req, timeout=60) as response:
            (D / (e['id'] + '-log.txt')).write_text(response.read().decode('utf-8', errors='replace'), encoding='utf-8')
        if r['status'] in TERMINAL:
            rows = api('datasets/' + e['datasetId'] + '/items?format=json&clean=false&limit=1000')
            if len(rows) >= 1000:
                raise RuntimeError('Unexpected dataset truncation')
            save(e['id'] + '-items', rows)
            summary = api('key-value-stores/' + e['keyValueStoreId'] + '/records/RUN_SUMMARY')
            save(e['id'] + '-summary', summary)
            if not e['input']['monitorMode']:
                e.update({'collected': True, 'rows': len(rows), 'elapsedSeconds': (datetime.datetime.fromisoformat(r['finishedAt'].replace('Z', '+00:00')) - datetime.datetime.fromisoformat(r['startedAt'].replace('Z', '+00:00'))).total_seconds()})
                save('manifest', m)
                continue
            stores = api('key-value-stores?limit=1000&desc=true')['data']
            store = next((s for s in stores['items'] if s.get('name') == e['input']['monitorStoreName']), None)
            if not store:
                raise RuntimeError('Dedicated monitor store not found; do not infer persistence')
            e['monitorStoreId'] = store['id']
            keys = api('key-value-stores/' + store['id'] + '/keys?limit=1000')['data']
            save(e['id'] + '-monitor-keys', keys)
            pagekeys = [k['key'] for k in keys['items'] if k['key'].startswith('page-')]
            def getstate(key):
                return key, api('key-value-stores/' + store['id'] + '/records/' + urllib.parse.quote(key, safe=''))
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                states = dict(pool.map(getstate, pagekeys))
            save(e['id'] + '-monitor-state', states)
            e.update({'collected': True, 'rows': len(rows), 'elapsedSeconds': (datetime.datetime.fromisoformat(r['finishedAt'].replace('Z', '+00:00')) - datetime.datetime.fromisoformat(r['startedAt'].replace('Z', '+00:00'))).total_seconds()})
        save('manifest', m)
    print(json.dumps({'runs': [{k: e.get(k) for k in ['label', 'id', 'status', 'rows', 'elapsedSeconds', 'usageTotalUsd', 'statusMessage']} for e in m['runs']]}))

if __name__ == '__main__':
    if sys.argv[1] == 'prepare': prepare()
    elif sys.argv[1] == 'collect': collect()
    elif sys.argv[1] == 'launch': launch(sys.argv[2])
