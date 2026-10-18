"""Sequential, budgeted candidate tests; no production parser or public writes."""
import importlib.util, pathlib, json, datetime, urllib.parse, urllib.request, sys, re, hashlib, time
from scraper_one_acquisition_checks import assess, budget_usd

ROOT=pathlib.Path(__file__).resolve().parents[1]
D=ROOT/'functions/artifacts/scraper-one-oct17-followup';D.mkdir(exist_ok=True)
OLD=ROOT/'functions/artifacts/scraper-one-oct17'
spec=importlib.util.spec_from_file_location('scraper_one_prior',ROOT/'firebase/test-scraper-one-oct17.py')
prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
api=prior.api;now=prior.now;TERMINAL=prior.TERMINAL
def save(n,x):(D/n).write_text(json.dumps(x,indent=2,ensure_ascii=False),encoding='utf-8')
def read(n):return json.loads((D/n).read_text(encoding='utf-8'))
def old(n):return json.loads((OLD/n).read_text(encoding='utf-8'))
def manifest():return read('manifest.json') if (D/'manifest.json').exists() else {'createdAt':now(),'maximumActorChargeUsd':5.0,'runs':[]}

def preflight():
    actor=api('acts/'+prior.CANDIDATE)['data'];build=api('acts/'+prior.CANDIDATE+'/builds/default')['data'];account=api('users/me')['data']
    if actor['id']!='zanTWNqB3Poz44qdY' or account['id']!='n2roZf9gnccp8qN83' or not account.get('isPaying'):raise RuntimeError('Unexpected actor/account/tier')
    if build['buildNumber']!='0.0.120':raise RuntimeError('Serving actor build changed; review before testing')
    hooks=prior.safe_hooks()
    for h in hooks:
        c=h.get('condition') or {}
        if h.get('isEnabled') and (c.get('actorId')==actor['id'] or not any(c.get(k) for k in ['actorId','actorRunId','actorTaskId'])):raise RuntimeError('Candidate webhook isolation not established')
    save('actor.json',actor);save('build.json',build);save('webhooks-before.json',hooks)
    save('preflight.json',{'at':now(),'actorId':actor['id'],'build':build['buildNumber'],'accountId':account['id'],'isPaying':True,'plan':account.get('plan',{}).get('id'),'maximumAdditionalActorChargeUsd':5,'sequentialOnly':True,'productionWrites':False})
    print(json.dumps(read('preflight.json')),flush=True)

def launch(label,urls,lower='2026-10-01',upper='2026-10-17',depth=1,timeout=900,memory=512):
    m=manifest()
    if any(e['label']==label for e in m['runs']):raise RuntimeError('Existing launch intent; unknown outcomes must never launch again')
    definition=read('build.json').get('actorDefinition') or {}
    if not definition.get('minMemoryMbytes',128)<=memory<=definition.get('maxMemoryMbytes',32768):raise RuntimeError('Requested memory is outside published actor bounds; do not silently accept clamping')
    active=[r for r in api('acts/'+prior.CANDIDATE+'/runs?limit=100&desc=true')['data']['items'] if r['status'] not in TERMINAL]
    if active:raise RuntimeError('A candidate actor is already active; sequential policy holds this launch')
    if any(e.get('status') not in TERMINAL for e in m['runs']):raise RuntimeError('Previous local launch is not terminal')
    budget=budget_usd(len(urls),depth)
    committed=sum(e.get('usageTotalUsd') or 0 for e in m['runs'])
    if committed+budget>m['maximumActorChargeUsd']:raise RuntimeError('Insufficient remaining budget for full requested depth')
    hooks=prior.safe_hooks()
    if hooks!=read('webhooks-before.json'):raise RuntimeError('Webhook routing drift')
    schema=read('build.json')['inputSchema'];schema=json.loads(schema) if isinstance(schema,str) else schema
    if len(urls)>schema['properties']['pageUrls']['maxItems']:raise RuntimeError('Too many source URLs')
    inp={'pageUrls':urls,'resultsLimit':depth,'onlyPostsNewerThan':lower,'onlyPostsOlderThan':upper}
    if set(inp)-set(schema['properties']):raise RuntimeError('Unknown actor input')
    e={'label':label,'input':inp,'budgetUsd':budget,'depth':depth,'memoryMbytes':memory,'build':'0.0.120','intentAt':now(),'status':'LAUNCHING'}
    m['runs'].append(e);save('manifest.json',m)
    q=urllib.parse.urlencode({'build':e['build'],'timeout':timeout,'memory':memory,'maxTotalChargeUsd':budget,'restartOnError':'false','forcePermissionLevel':'LIMITED_PERMISSIONS'})
    try:
        run=api('acts/'+prior.CANDIDATE+'/runs?'+q,inp)['data'];e.update({'id':run['id'],'datasetId':run['defaultDatasetId'],'status':run['status'],'actualMemoryMbytes':run.get('options',{}).get('memoryMbytes')});save(run['id']+'-launch.json',run)
    except Exception:
        e['status']='LAUNCH_OUTCOME_UNKNOWN';save('manifest.json',m);raise
    save('manifest.json',m);print(json.dumps({'label':label,'id':e['id'],'sources':len(urls),'depth':depth,'reservedUsd':budget}),flush=True)

def targeted():
    a=old('qIcLwVeGmUByinvNH-items.json')+old('C09eoSwklEKQiKxeI-items.json')
    ids=['1648299067307008','1558537279625937','1668892618483893','1118397330940217']
    targets=[{'expectedPostId':i,'url':next(r['url'] for r in a if r.get('postId')==i)} for i in ids]
    targets.extend([{'expectedAuthorId':i,'url':'https://www.facebook.com/'+i} for i in ['100064547837891','100063644676590']])
    save('targeted-plan.json',targets)
    launch('targeted-native',list(dict.fromkeys(x['url'] for x in targets)))

def resource_probe():
    p=old('corrected-daily-20-plan.json')
    launch('resource-4096-daily-20',p['sources'],'2026-10-16','2026-10-17',20,900,4096)

def collect():
    m=manifest()
    for e in m['runs']:
        if not e.get('id') or e.get('collected'):continue
        run=api('actor-runs/'+e['id'])['data'];save(e['id']+'-run.json',run)
        e.update({'status':run['status'],'usageTotalUsd':run.get('usageTotalUsd'),'chargedEventCounts':run.get('chargedEventCounts'),'finishedAt':run.get('finishedAt'),'actualMemoryMbytes':run.get('options',{}).get('memoryMbytes')})
        if run['status'] in TERMINAL:
            rows=[];offset=0
            while True:
                part=api('datasets/'+e['datasetId']+'/items?format=json&clean=false&limit=1000&offset='+str(offset));rows.extend(part)
                if len(part)<1000:break
                offset+=len(part)
            save(e['id']+'-items.json',rows)
            req=urllib.request.Request('https://api.apify.com/v2/actor-runs/'+e['id']+'/log',headers={'Authorization':'Bearer '+prior.TOKEN})
            with urllib.request.urlopen(req,timeout=60) as r:log=r.read().decode('utf-8',errors='replace')
            (D/(e['id']+'-log.txt')).write_text(log,encoding='utf-8')
            e.update({'collected':True,'rows':len(rows),'posts':sum(bool(r.get('postId')) and not r.get('error') for r in rows),**assess(e['input']['pageUrls'],e['depth'],run['status'],run.get('statusMessage'),rows,log)})
        save('manifest.json',m)
    print(json.dumps({'runs':[{k:e.get(k) for k in ['label','id','status','operationalStatus','posts','usageTotalUsd','observedDepths']} for e in m['runs']],'totalUsd':sum(e.get('usageTotalUsd') or 0 for e in m['runs'])}),flush=True)

def prepare_full():
    p=old('comparison-plan.json')
    urls=p['sourceUrls']
    if len(urls)!=320 or len(set(urls))!=320 or p['unexplainedBaselineSources']:raise RuntimeError('Frozen source baseline changed')
    plan={'createdAt':now(),'baselineRun':p['officialRun']['id'],'baselineDataset':p['officialRun']['datasetId'],'sourceListSha256':p['sourceListSha256'],'sourceUrls':urls,'windowStart':p['windowStart'],'windowEndDay':p['windowEndDay'],'comparisonCutoff':p['comparisonCutoff'],'depth':10,'batchSize':80,'batches':[urls[i:i+80] for i in range(0,len(urls),80)],'policy':'Sequential acquisition only. Maximum additional actor charge USD5. No production parser/webhook/data writes. Native output measured separately from exact-ID metadata enrichment. No claim of native preview readiness. Stop on throttling, clipping, incomplete source processing or changed isolation.'}
    if (D/'full-plan.json').exists() and read('full-plan.json')['sourceUrls']!=urls:raise RuntimeError('Existing plan drift')
    save('full-plan.json',plan);print(json.dumps({k:plan[k] for k in ['baselineRun','depth','batchSize','windowStart','windowEndDay','comparisonCutoff']}))

def full():
    if (D/'qualification-hold.json').exists():raise RuntimeError('Full acquisition qualification is held; read the recorded resource/proxy/source blockers before another launch')
    p=read('full-plan.json')
    for i,urls in enumerate(p['batches'],1):
        label='daily-full-'+str(i);m=manifest();existing=next((e for e in m['runs'] if e['label']==label),None)
        if not existing:
            if any(e.get('operationalStatus') not in {'complete','complete_with_source_holds'} for e in m['runs']):raise RuntimeError('Previous run failed readiness; no subsequent launch')
            launch(label,urls,p['windowStart'],p['windowEndDay'],p['depth'],3600)
        while True:
            collect();e=next(e for e in manifest()['runs'] if e['label']==label)
            if e.get('collected'):break
            time.sleep(30)
        if e['operationalStatus'] not in {'complete','complete_with_source_holds'} or e['sourcesAtDepthLimit']:raise RuntimeError('Full comparison stopped: throttling, depth or source coverage gate')
        if i<len(p['batches']):time.sleep(30)
    save('full-completed.json',{'at':now(),'sources':320,'runs':[e['id'] for e in manifest()['runs'] if e['label'].startswith('daily-full-')]})

def progress():
    m=manifest();finished=0;active=[]
    for e in m['runs']:
        if not e['label'].startswith('daily-full-'):continue
        if e.get('collected'):finished+=e.get('sourcesFinished',0)+e.get('sourcesWithTerminalDiagnostics',0);continue
        req=urllib.request.Request('https://api.apify.com/v2/actor-runs/'+e['id']+'/log',headers={'Authorization':'Bearer '+prior.TOKEN})
        with urllib.request.urlopen(req,timeout=45) as r:log=r.read().decode('utf-8',errors='replace')
        (D/(e['id']+'-progress-log.txt')).write_text(log,encoding='utf-8')
        n=len(set(re.findall(r'(https?://[^\s]+) -> finished collecting posts?:',log)));finished+=n
        active.append({'label':e['label'],'id':e['id'],'completedSources':n,'rateLimited':'rate limit reached' in log.lower(),'latestLog':log.splitlines()[-1] if log else ''})
    print(json.dumps({'at':now(),'accountedSources':finished,'requestedSources':320,'actorChargeUsd':round(sum(e.get('usageTotalUsd') or 0 for e in m['runs']),5),'complete':(D/'full-completed.json').exists(),'active':active}),flush=True)

if __name__=='__main__':
    if sys.argv[1]=='preflight':preflight()
    elif sys.argv[1]=='targeted':targeted()
    elif sys.argv[1]=='collect':collect()
    elif sys.argv[1]=='prepare-full':prepare_full()
    elif sys.argv[1]=='full':full()
    elif sys.argv[1]=='progress':progress()
    elif sys.argv[1]=='resource-probe':resource_probe()
