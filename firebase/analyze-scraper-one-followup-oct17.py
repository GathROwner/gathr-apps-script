"""Offline full-source comparison; never publishes or invokes a model."""
import collections, datetime, importlib.util, json, pathlib, sys
from scraper_one_acquisition_checks import assess
ROOT=pathlib.Path(__file__).resolve().parents[1]
D=ROOT/'functions/artifacts/scraper-one-oct17-followup';OLD=D.parent/'scraper-one-oct17'
s=importlib.util.spec_from_file_location('prior_analysis',ROOT/'firebase/analyze-scraper-one-oct17.py')
a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
def read(d,n):return json.loads((d/n).read_text(encoding='utf-8'))
def save(n,x):(D/n).write_text(json.dumps(x,indent=2,ensure_ascii=False),encoding='utf-8')

def main():
    plan=read(D,'full-plan.json');manifest=read(D,'manifest.json');mode=sys.argv[1] if len(sys.argv)>1 else 'native'
    runs=[e for e in manifest['runs'] if e['label'].startswith('daily-full-')]
    if not runs or any(not e.get('collected') for e in runs):raise RuntimeError('Cannot score an active or uncollected acquisition')
    runs=[{**e,**assess(e['input']['pageUrls'],e['depth'],e['status'],'',read(D,e['id']+'-items.json'),(D/(e['id']+'-log.txt')).read_text(encoding='utf-8'))} for e in runs]
    raw=[r for e in runs if e.get('collected') for r in read(D,e['id']+'-items.json')]
    if mode=='enriched':raw=read(D,'enriched-full-posts.json')+[r for r in raw if r.get('error')]
    posts=[r for r in raw if r.get('postId') and not r.get('error')]
    start=datetime.datetime.fromisoformat(plan['windowStart']).replace(tzinfo=datetime.timezone.utc).timestamp()
    cut=datetime.datetime.fromisoformat(plan['comparisonCutoff'].replace('Z','+00:00')).timestamp()
    in_window=[r for r in posts if a.timestamp(r) is not None and start<=a.timestamp(r)<=cut]
    after=[r for r in posts if a.timestamp(r) is not None and a.timestamp(r)>cut]
    outside=[r for r in posts if a.timestamp(r) is None or a.timestamp(r)<start]
    attempted={a.source(u) for e in runs for u in e['input']['pageUrls']}
    all_baseline=[r for r in read(OLD,'official-items.json') if r.get('postId') and not r.get('error')]
    baseline=[r for r in all_baseline if a.key(r)[0] in attempted]
    controls=collections.defaultdict(list);candidate=collections.defaultdict(list)
    for r in baseline:controls[a.key(r)].append(r)
    for r in in_window:candidate[a.key(r)].append(r)
    comparisons=[]
    for k,values in controls.items():
        r=values[0];others=candidate.get(k,[]);c=others[0] if others else None
        sa=a.author(r.get('sharedPost') or {});ca=a.author((c or {}).get('sharedPost') or {})
        x={'source':r.get('inputUrl'),'postId':k[1],'matched':bool(c),'baselineCaption':a.caption(r),'baselineSharedCaption':a.caption(r.get('sharedPost') or {}),'baselineAuthorId':a.author(r).get('id'),'baselineMedia':a.media(r),'baselineSharedMedia':a.media(r.get('sharedPost') or {}),'hasSharedOriginal':bool(r.get('sharedPost'))}
        if c:
            x.update({'candidateCaption':a.caption(c),'candidateSharedCaption':a.caption(c.get('sharedPost') or {}),'captionEqual':a.caption(r)==a.caption(c),'timestampEqual':a.timestamp(r)==a.timestamp(c),'authorIdEqual':str(a.author(r).get('id') or '')==str(a.author(c).get('id') or ''),'candidateAuthorId':a.author(c).get('id'),'authorNameMissing':not a.author(c).get('name'),'candidateMedia':a.media(c),'candidateSharedMedia':a.media(c.get('sharedPost') or {}),'sharedCaptionEqual':a.caption(r.get('sharedPost') or {})==a.caption(c.get('sharedPost') or {}),'sharedAuthorIdEqual':str(sa.get('id') or '')==str(ca.get('id') or ''),'sharedProfilePresent':bool(ca.get('profileUrl')),'sharedPostUrlPresent':bool((c.get('sharedPost') or {}).get('url')),'sharedTimeEqual':a.timestamp(r.get('sharedPost') or {})==a.timestamp(c.get('sharedPost') or {}),'mediaOrderEqual':a.sig(r)['media']==a.sig(c)['media'],'sharedMediaOrderEqual':a.sig(r)['sharedMedia']==a.sig(c)['sharedMedia'],'fewerImageAssets':sum(bool(m['imageUrl']) for m in a.media(c)+a.media(c.get('sharedPost') or {}))<sum(bool(m['imageUrl']) for m in a.media(r)+a.media(r.get('sharedPost') or {}))})
        comparisons.append(x)
    matched=[x for x in comparisons if x['matched']];shared=[x for x in comparisons if x['hasSharedOriginal']]
    complete=(D/'full-completed.json').exists() and len(runs)==4 and all(e.get('operationalStatus') in {'complete','complete_with_source_holds'} and not e.get('sourcesAtDepthLimit') for e in runs)
    original=read(OLD,'comparison-plan.json')['officialRun']
    summary={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':mode,'fullComparisonComplete':complete,'requestedDistinctSources':len(plan['sourceUrls']),'finishedSources':sum(e.get('sourcesFinished',0) for e in runs),'sourcesWithTerminalDiagnostics':sum(e.get('sourcesWithTerminalDiagnostics',0) for e in runs),'sourcesWithoutCompletion':[u for e in runs for u in e.get('sourcesWithoutCompletion',[])],'sourcesAtDepthLimit':[u for e in runs for u in e.get('sourcesAtDepthLimit',[])],'runs':[{k:e.get(k) for k in ['id','label','status','operationalStatus','sourcesFinished','posts','usageTotalUsd','observedDepths','sourcesAtDepthLimit']} for e in runs],'nativeTotalPosts':len(posts),'withinControlWindow':len(in_window),'afterControlCutoffExcluded':len(after),'invalidTimestampsOrBeforeWindow':len(outside),'diagnosticCounts':dict(collections.Counter(r.get('error') for r in raw if r.get('error'))),'baselineSourcePostKeys':len(controls),'matchedBaselineKeys':len(matched),'missingBaselineKeys':len(controls)-len(matched),'additionalWithinWindowKeys':len(set(candidate)-set(controls)),'duplicateSourcePostKeys':sum(len(v)-1 for v in candidate.values()),'exactCaptions':sum(x['captionEqual'] for x in matched),'exactTimestamps':sum(x['timestampEqual'] for x in matched),'exactAuthorIds':sum(x['authorIdEqual'] for x in matched),'missingAuthorNames':sum(x['authorNameMissing'] for x in matched),'orderedMediaIdMatches':sum(x['mediaOrderEqual'] for x in matched),'matchedPostsWithFewerImageAssets':sum(x['fewerImageAssets'] for x in matched),'baselineSharedOriginals':len(shared),'matchedSharedOriginals':sum(x['matched'] for x in shared),'exactSharedCaptions':sum(x.get('sharedCaptionEqual',False) for x in shared),'exactSharedAuthorIds':sum(x.get('sharedAuthorIdEqual',False) for x in shared),'sharedProfilesPresent':sum(x.get('sharedProfilePresent',False) for x in shared),'sharedPostUrlsPresent':sum(x.get('sharedPostUrlPresent',False) for x in shared),'exactSharedTimes':sum(x.get('sharedTimeEqual',False) for x in shared),'orderedSharedMediaIdMatches':sum(x.get('sharedMediaOrderEqual',False) for x in shared),'fullActorChargeUsd':round(sum(e.get('usageTotalUsd') or 0 for e in runs),5),'allFollowupActorChargeUsd':round(sum(e.get('usageTotalUsd') or 0 for e in manifest['runs']),5),'baselineActorChargeUsd':original['charge'],'baselineAcquisitionSeconds':(datetime.datetime.fromisoformat(original['finishedAt'].replace('Z','+00:00'))-datetime.datetime.fromisoformat(original['startedAt'].replace('Z','+00:00'))).total_seconds(),'candidateAcquisitionSeconds':sum((read(D,e['id']+'-run.json').get('stats') or {}).get('durationMillis',0)/1000 for e in runs),'modelCalls':0,'productionWrites':0,'limitations':['Same frozen source list and lower bound; captures are hours apart. Later records are excluded from matching but paid for.','Exact missing or changed records require individual review; not all absences are acquisition errors.','Post discovery and importer validation do not prove current parser decisions, venue binding, deduplication or publication.','Enriched mode uses source-proven metadata and is not native actor coverage.','Quiet sources are counted only with explicit completion; terminal diagnostics remain source holds.']}
    save(mode+'-full-comparison-summary.json',summary);save(mode+'-full-post-comparisons.json',comparisons)
    save(mode+'-full-window-posts.json',in_window);save(mode+'-full-all-posts.json',posts)
    save(mode+'-full-additional-window-posts.json',[v[0] for k,v in candidate.items() if k not in controls])
    summary.update({'attemptedDistinctSources':len(attempted),'baselineAllSourcePostKeys':len({a.key(r) for r in all_baseline}),'comparisonScope':'full frozen source list' if complete else 'terminal captured batches only; unattempted sources are not missing posts'})
    save(mode+'-full-comparison-summary.json',summary)
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
