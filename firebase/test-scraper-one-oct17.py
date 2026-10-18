"""Authorized acquisition comparison only; no parser/webhook/Firestore writes."""
import datetime, hashlib, json, pathlib, subprocess, sys, urllib.request, urllib.parse, urllib.error, re, zipfile, io

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'functions/artifacts/scraper-one-oct17'
OUT.mkdir(parents=True, exist_ok=True)
GC = r'C:\Users\craig\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
CANDIDATE = 'scraper_one~facebook-posts-scraper'
OFFICIAL = 'KoJrdxJCTtpon81KY'
TERMINAL = {'SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'}

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
def read(name): return json.loads((OUT / name).read_text(encoding='utf-8'))
def credential():
    p = subprocess.run([GC, 'secrets', 'versions', 'access', 'latest', '--secret=APIFY_TOKEN', '--project=gathr-migrated'], capture_output=True, text=True)
    if p.returncode: raise RuntimeError('Google Cloud sign-in or secret access unavailable; no actor launched')
    return p.stdout.strip()
TOKEN = credential()
def api(path, body=None):
    req = urllib.request.Request('https://api.apify.com/v2/' + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError('Apify HTTP ' + str(e.code) + ' for ' + path.split('?')[0]) from None

def safe_hooks():
    hooks = api('webhooks?limit=1000')['data']['items']
    return [{'id': h['id'], 'isEnabled': h.get('isEnabled'), 'condition': h.get('condition'), 'eventTypes': h.get('eventTypes')} for h in hooks]

def preflight():
    account = api('users/me')['data']
    if account['id'] != 'n2roZf9gnccp8qN83': raise RuntimeError('Unexpected account')
    actor = api('acts/' + CANDIDATE)['data']
    build = api('acts/' + CANDIDATE + '/builds/default')['data']
    save('candidate-actor.json', actor); save('candidate-build.json', build)
    hooks = safe_hooks(); save('webhooks-before.json', hooks)
    for h in hooks:
        c = h.get('condition') or {}
        if h.get('isEnabled') and (c.get('actorId') == actor['id'] or not any(c.get(k) for k in ['actorId','actorTaskId','actorRunId'])):
            raise RuntimeError('Candidate could match enabled webhook')
    runs = api('acts/' + OFFICIAL + '/runs?limit=6&desc=true')['data']['items']
    save('official-recent-runs.json', runs)
    brief=[]
    for r in runs:
        inp=api('key-value-stores/' + r['defaultKeyValueStoreId'] + '/records/INPUT')
        save('official-' + r['id'] + '-input.json', inp)
        brief.append({'id':r['id'],'status':r['status'],'startedAt':r.get('startedAt'),'finishedAt':r.get('finishedAt'),'datasetId':r.get('defaultDatasetId'),'charge':r.get('usageTotalUsd'),'input':inp})
    save('preflight.json', {'at':now(),'candidateId':actor['id'],'build':build.get('buildNumber'),'accountVerified':True,'officialRuns':brief})
    print(json.dumps({'candidateBuild':build.get('buildNumber'),'actorKeys':list(actor),'buildKeys':list(build),'runs':brief},ensure_ascii=True), flush=True)

def prepare():
    p=read('preflight.json'); official=p['officialRuns'][0]
    if official['status'] != 'SUCCEEDED': raise RuntimeError('Latest official scrape is not complete')
    rows=[]; offset=0
    while True:
        part=api('datasets/'+official['datasetId']+'/items?format=json&clean=false&limit=1000&offset='+str(offset))
        rows.extend(part)
        if len(part)<1000: break
        offset+=len(part)
    save('official-items.json',rows)
    sourceUrl=official['input']['startUrls'][0]['requestsFromUrl']
    with urllib.request.urlopen(sourceUrl,timeout=60) as r: source=r.read().decode('utf-8-sig')
    urls=[x.strip().rstrip('/') for x in source.splitlines() if x.strip()]
    if any(not re.fullmatch(r'https?://(?:www\.)?facebook\.com/[^\s]+',u) for u in urls):
        raise RuntimeError('Source list contains unexpected content')
    inputUrls=list(urls)
    duplicateSources={u:urls.count(u) for u in set(urls) if urls.count(u)>1}
    urls=list(dict.fromkeys(urls))
    if not urls: raise RuntimeError('No source URLs')
    # Check source-list consistency using every raw baseline input, including diagnostics.
    observed={str(x.get('inputUrl') or '').rstrip('/') for x in rows}
    unexplained=sorted(observed-set(urls)-{''})
    save('comparison-plan.json',{'createdAt':now(),'officialRun':official,'sourceListUrl':sourceUrl,'sourceListSha256':hashlib.sha256(source.encode()).hexdigest(),'originalSourceEntries':inputUrls,'duplicateSourceEntries':duplicateSources,'sourceUrls':urls,'sourceCount':len(urls),'officialRows':len(rows),'officialPosts':sum(bool(x.get('postId')) and not x.get('error') for x in rows),'unexplainedBaselineSources':unexplained,'candidateBuild':p['build'],'windowStart':official['input']['onlyPostsNewerThan'],'windowEndDay':official['finishedAt'][:10],'comparisonCutoff':official['finishedAt'],'resultsLimit':100,'maximumExperimentActorChargeUsd':3.0,'method':'Same distinct requested sources/lower day bound; three repeated source entries acquired once. Candidate upper bound is UTC day only; offline exclude posts after original finish. Captures hours apart: edited/deleted content and source availability are adjudicated separately. No production actor run, parser ingestion, webhook, Firestore, media upload or model call.'})
    print(json.dumps({'sources':len(urls),'baselineRows':len(rows),'posts':sum(bool(x.get('postId')) and not x.get('error') for x in rows),'unexplainedSources':unexplained,'sampleKeys':list(next(x for x in rows if x.get('postId'))),'sharedPosts':sum(bool(x.get('sharedPost')) for x in rows),'sourceSample':urls[:4]},ensure_ascii=True))

def manifest():
    return read('manifest.json') if (OUT/'manifest.json').exists() else {'createdAt':now(),'maximumActorChargeUsd':3.0,'runs':[]}

def launch(label, urls, lower, upper, limit, budget):
    m=manifest()
    if any(e['label']==label for e in m['runs']): raise RuntimeError('Label already has a launch intent; never retry unknown launch')
    committed=sum((e.get('usageTotalUsd') or 0) if e.get('collected') and e.get('status') in TERMINAL else e['budgetUsd'] for e in m['runs'])
    if committed+budget>m['maximumActorChargeUsd']+1e-9: raise RuntimeError('Experiment budget exceeded')
    actor=read('candidate-actor.json'); hooks=safe_hooks()
    for h in hooks:
        c=h.get('condition') or {}
        if h.get('isEnabled') and (c.get('actorId')==actor['id'] or not any(c.get(k) for k in ['actorId','actorTaskId','actorRunId'])): raise RuntimeError('Webhook isolation failed')
    inp={'pageUrls':urls,'resultsLimit':limit,'onlyPostsNewerThan':lower,'onlyPostsOlderThan':upper}
    schema=read('candidate-build.json')['inputSchema']
    if isinstance(schema,str): schema=json.loads(schema)
    if set(inp)-set(schema['properties']) or len(urls)>schema['properties']['pageUrls']['maxItems']: raise RuntimeError('Unsupported input')
    if not all(re.fullmatch(r'\d{4}-\d{2}-\d{2}',x) for x in [lower,upper]) or lower>upper: raise RuntimeError('Invalid date bounds')
    # Observed actor behavior: a low total cap reduces per-page inspected depth.
    # Reserve requested depth at the verified Starter rate before any new launch.
    if budget+1e-9 < .00025+.0025*limit*len(urls):raise RuntimeError('Spending cap may reduce requested page depth; reduce cohort/depth or raise the bounded reservation')
    e={'label':label,'input':inp,'budgetUsd':budget,'build':read('preflight.json')['build'],'intentAt':now(),'status':'LAUNCHING'}
    m['runs'].append(e);save('manifest.json',m)
    query=urllib.parse.urlencode({'build':e['build'],'timeout':900,'memory':256,'maxTotalChargeUsd':budget,'restartOnError':'false','forcePermissionLevel':'LIMITED_PERMISSIONS'})
    try:
        run=api('acts/'+CANDIDATE+'/runs?'+query,inp)['data']
        e.update({'id':run['id'],'datasetId':run['defaultDatasetId'],'status':run['status']});save(run['id']+'-launch.json',run)
    except Exception:
        e['status']='LAUNCH_OUTCOME_UNKNOWN';save('manifest.json',m);raise
    save('manifest.json',m);print(json.dumps({'label':label,'runId':e['id'],'status':e['status'],'pages':len(urls),'budgetUsd':budget}),flush=True)

def smoke():
    p=read('comparison-plan.json')
    urls=['https://www.facebook.com/PEILibrary','https://www.facebook.com/TrailsideMusicHall','https://www.facebook.com/CityCinemaChtown','https://www.facebook.com/DowntownCharlottetownInc','https://www.facebook.com/hunterspei','https://www.facebook.com/fortunebridgefarms','https://www.facebook.com/evermoorebrewing','https://www.facebook.com/KoolBreezeFarms','https://www.facebook.com/robertmcmillanpottery']
    # Only known exact production URLs. Publisher spelling is not guessed.
    urls=[u for u in urls if u in p['sourceUrls']]
    launch('smoke',urls,'2026-10-09',p['windowEndDay'],30,.40)

def full():
    m=manifest(); smokeRun=next((e for e in m['runs'] if e['label']=='smoke'),None)
    if not smokeRun: raise RuntimeError('Run the smoke first')
    # Completed pages in a partial smoke establish input/schema readiness;
    # the entire smoke is still reported with its eventual terminal status.
    rows=read(smokeRun['id']+('-items.json' if smokeRun.get('collected') else '-partial-items.json'))
    shares=[r for r in rows if (r.get('sharedPost') or {}).get('postText') and (r.get('sharedPost') or {}).get('author')]
    if not any(r.get('inputUrl')=='https://www.facebook.com/PEILibrary' for r in shares) or not any(r.get('postId')=='1559528996193432' for r in shares): raise RuntimeError('Key smoke originals missing; inspect before full comparison')
    save('full-launch-readiness.json',{'at':now(),'smokeStatusAtDecision':smokeRun['status'],'partialRowsInspected':len(rows),'sharedOriginalsWithCaptionAndAuthor':len(shares),'librarySharedGalleryVerified':True,'TrailsideSharedCaptionVerified':True,'partialEvidenceNotTerminalPass':True})
    p=read('comparison-plan.json')
    for i in range(0,len(p['sourceUrls']),80):
        label='full-'+str(i//80+1)
        if any(e['label']==label for e in manifest()['runs']): continue
        launch(label,p['sourceUrls'][i:i+80],p['windowStart'],p['windowEndDay'],p['resultsLimit'],.55)

def verify():
    if any(e.get('status') not in TERMINAL for e in manifest()['runs']):raise RuntimeError('A test actor is still active; collect terminal results before final verification')
    before=read('webhooks-before.json'); after=safe_hooks();save('webhooks-after.json',after)
    # Candidate test must not alter configured webhook routing.
    if before!=after: raise RuntimeError('Webhook configuration drift requires review')
    p=read('comparison-plan.json')
    official=api('actor-runs/'+p['officialRun']['id'])['data']
    account=api('users/me')['data']
    save('account-plan-proof.json',{'at':now(),'accountId':account['id'],'isPaying':account.get('isPaying'),'planId':account.get('plan',{}).get('id'),'planTier':account.get('plan',{}).get('tier'),'monthlyBasePriceUsd':account.get('plan',{}).get('monthlyBasePriceUsd')})
    save('official-run-after.json',official)
    save('safety-verification.json',{'at':now(),'webhooksUnchanged':True,'candidateRuns':[e.get('id') for e in manifest()['runs']],'officialRunUnchangedTerminalIdentity':official['status']=='SUCCEEDED' and official['defaultDatasetId']==p['officialRun']['datasetId'],'launchedOnlyCandidate':True,'productionParserInvocations':0,'FirestoreWrites':0,'managedMediaUploads':0,'modelCalls':0,'actualActorChargesUsd':sum(e.get('usageTotalUsd') or 0 for e in manifest()['runs'])})
    print(json.dumps(read('safety-verification.json')))

def runtime():
    cmd=[GC,'run','services','describe','processdatasetresume','--region=northamerica-northeast1','--project=gathr-migrated','--format=json']
    p=subprocess.run(cmd,capture_output=True,text=True)
    if p.returncode:raise RuntimeError('Live runtime metadata unavailable')
    service=json.loads(p.stdout); uri=service['metadata']['annotations']['run.googleapis.com/build-source-location']
    p=subprocess.run([GC,'storage','cat',uri],capture_output=True)
    if p.returncode:raise RuntimeError('Live runtime archive unavailable')
    z=zipfile.ZipFile(io.BytesIO(p.stdout));names=['lib/services/driveService.js','lib/services/apifyService.js','lib/processing/rowProcessor.js']
    files=[]
    for name in names:
        target=OUT/'runtime'/name;target.parent.mkdir(parents=True,exist_ok=True);blob=z.read(name);target.write_bytes(blob)
        files.append({'name':name,'sha256':hashlib.sha256(blob).hexdigest()})
    save('runtime-provenance.json',{'capturedAt':now(),'revision':service['status']['latestReadyRevisionName'],'traffic':service['status'].get('traffic'),'source':uri,'archiveSha256':hashlib.sha256(p.stdout).hexdigest(),'files':files,'purpose':'Offline importer/row-validation compatibility only; all cloud clients/network blocked in VM'})
    print(json.dumps(read('runtime-provenance.json')))

def retry_blocked_batch(label):
    m=manifest(); previous=next(e for e in m['runs'] if e['label']==label)
    if not previous.get('collected') or previous.get('rows')!=0:raise RuntimeError('Only exact blocked empty batches may be retried here')
    if 'Rate limit reached' not in (OUT/(previous['id']+'-log.txt')).read_text(encoding='utf-8'):raise RuntimeError('Not the reviewed rate limit failure')
    # One bounded retry after the earlier smoke finished changes concurrent load.
    inp=previous['input'];launch(label+'-retry1',inp['pageUrls'],inp['onlyPostsNewerThan'],inp['onlyPostsOlderThan'],inp['resultsLimit'],previous['budgetUsd'])

def collect():
    m=manifest()
    for e in m['runs']:
        if not e.get('id'):continue
        run=api('actor-runs/'+e['id'])['data'];save(e['id']+'-run.json',run)
        e.update({'status':run['status'],'usageTotalUsd':run.get('usageTotalUsd'),'chargedEventCounts':run.get('chargedEventCounts'),'finishedAt':run.get('finishedAt')})
        if run['status'] in TERMINAL and not e.get('collected'):
            rows=[];offset=0
            while True:
                part=api('datasets/'+e['datasetId']+'/items?format=json&clean=false&limit=1000&offset='+str(offset));rows.extend(part)
                if len(part)<1000:break
                offset+=len(part)
            save(e['id']+'-items.json',rows)
            req=urllib.request.Request('https://api.apify.com/v2/actor-runs/'+e['id']+'/log',headers={'Authorization':'Bearer '+TOKEN})
            with urllib.request.urlopen(req,timeout=60) as r:(OUT/(e['id']+'-log.txt')).write_bytes(r.read())
            e.update({'collected':True,'rows':len(rows),'posts':sum(bool(x.get('postId')) and not x.get('error') for x in rows)})
        elif run['status'] not in TERMINAL:
            rows=api('datasets/'+e['datasetId']+'/items?format=json&clean=false&limit=1000')
            save(e['id']+'-partial-items.json',rows)
            e['partialRows']=len(rows)
            req=urllib.request.Request('https://api.apify.com/v2/actor-runs/'+e['id']+'/log',headers={'Authorization':'Bearer '+TOKEN})
            with urllib.request.urlopen(req,timeout=60) as r:(OUT/(e['id']+'-partial-log.txt')).write_bytes(r.read())
        save('manifest.json',m);print(json.dumps({k:e.get(k) for k in ['label','id','status','rows','posts','usageTotalUsd','chargedEventCounts']}),flush=True)

if __name__ == '__main__':
    if sys.argv[1] == 'preflight': preflight()
    elif sys.argv[1] == 'prepare': prepare()
    elif sys.argv[1] == 'smoke': smoke()
    elif sys.argv[1] == 'collect': collect()
    elif sys.argv[1] == 'full': full()
    elif sys.argv[1] == 'verify': verify()
    elif sys.argv[1] == 'runtime': runtime()
    elif sys.argv[1] == 'retry': retry_blocked_batch(sys.argv[2])
