"""Offline matched-source/post acquisition comparison. No credentials or network."""
import collections, datetime, json, pathlib, re, urllib.parse, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
D=ROOT/'functions/artifacts/scraper-one-oct17'
def read(n):return json.loads((D/n).read_text(encoding='utf-8'))
def save(n,x):(D/n).write_text(json.dumps(x,indent=2,ensure_ascii=False),encoding='utf-8')
def source(u):
    p=urllib.parse.urlsplit(str(u or ''))
    return 'facebook.com'+p.path.rstrip('/').lower()+('?' + p.query if p.path.endswith('profile.php') else '')
def key(r):return (source(r.get('inputUrl') or r.get('facebookUrl') or r.get('pageUrl')),str(r.get('postId') or ''))
def text(x):return str(x or '').replace('\r\n','\n').strip()
def timestamp(r):
    n=r.get('timestamp')
    if isinstance(n,(int,float)):return n/1000 if n>1e12 else n
    try:return datetime.datetime.fromisoformat(str(r.get('time') or '').replace('Z','+00:00')).timestamp()
    except (ValueError,TypeError):return None
def author(r):return r.get('author') or r.get('user') or r.get('pageName') if isinstance(r.get('pageName'),dict) else r.get('author') or r.get('user') or {}
def nested(r,path):
    for k in path.split('.'):
        if not isinstance(r,dict):return None
        r=r.get(k)
    return r
def media(r):
    result=[]
    for m in (r.get('attachments') or r.get('media') or []):
        kind=str(m.get('type') or m.get('__typename') or '').lower()
        mid=str(m.get('id') or '')
        url=next((nested(m,p) for p in ['photo_image.uri','flexible_height_image.uri','image.uri','preferred_thumbnail.image.uri','thumbnailImage.uri','thumbnailUrl','thumbnail'] if isinstance(nested(m,p),str)),None)
        if not url and kind=='photo':url=m.get('url')
        # Official output includes empty gallery container objects before photos.
        # They have no asset ID or image URL and are not missing gallery images.
        if not mid and not url:continue
        result.append({'id':mid,'type':kind,'imageUrl':url,'width':nested(m,'photo_image.width') or nested(m,'image.width'),'height':nested(m,'photo_image.height') or nested(m,'image.height')})
    return result
def caption(r):return text(r.get('postText') if 'postText' in r else r.get('text'))
def sig(r):return {'caption':caption(r),'sharedCaption':caption(r.get('sharedPost') or {}),'media':[(x['id'],x['type']) for x in media(r)],'sharedMedia':[(x['id'],x['type']) for x in media(r.get('sharedPost') or {})]}

def main():
    p=read('comparison-plan.json');m=read('manifest.json');cut=datetime.datetime.fromisoformat(p['comparisonCutoff'].replace('Z','+00:00')).timestamp();start=datetime.datetime.fromisoformat(p['windowStart']).replace(tzinfo=datetime.timezone.utc).timestamp()
    corrected=len(sys.argv)>1 and sys.argv[1]=='corrected'
    prefix='corrected-' if corrected else ''
    if corrected:p['sourceUrls']=read('corrected-daily-20-plan.json')['sources']
    requested={source(u) for u in p['sourceUrls']}
    official=[r for r in read('official-items.json') if r.get('postId') and not r.get('error')]
    if corrected:official=[r for r in official if key(r)[0] in requested]
    raw=[];runProgress=[];handledSources=set();finishedSources=set();blockedRuns=[]
    for e in m['runs']:
        if (e['label']!='corrected-daily-20' if corrected else not e['label'].startswith('full-')):continue
        f=e['id']+('-items.json' if e.get('collected') else '-partial-items.json')
        if (D/f).exists():raw.extend(read(f))
        logFile=D/(e['id']+('-log.txt' if e.get('collected') else '-partial-log.txt'))
        log=logFile.read_text(encoding='utf-8') if logFile.exists() else ''
        limited='Rate limit reached' in log
        if limited:blockedRuns.append(e['id'])
        for url in re.findall(r'Handling: (https?://[^\s]+)',log):handledSources.add(source(url))
        for url in re.findall(r'(https?://[^\s]+) -> finished collecting posts:',log):finishedSources.add(source(url))
        runProgress.append({**{k:e.get(k) for k in ['label','id','status','posts','partialRows','usageTotalUsd']},'rateLimited':limited,'operationalSuccess':e['status']=='SUCCEEDED' and not limited})
    posts=[r for r in raw if r.get('postId') and not r.get('error')]
    eligible=[r for r in posts if timestamp(r) is not None and start<=timestamp(r)<=cut]
    postCutoff=[r for r in posts if timestamp(r) is not None and timestamp(r)>cut]
    b=collections.defaultdict(list);c=collections.defaultdict(list)
    for r in official:b[key(r)].append(r)
    for r in eligible:c[key(r)].append(r)
    snapshots=json.loads((ROOT/'functions/artifacts/luna-oct17-production-audit/snapshots.json').read_text(encoding='utf-8'))
    ss={str(x['data'].get('uniqueId')):x['data'] for x in snapshots}
    comparisons=[]
    for k,rr in b.items():
        r=rr[0];other=c.get(k,[None])[0];s=ss.get(k[1],{});events=next((a.get('output',{}).get('events') or [] for a in s.get('stages',[]) if a.get('stage')=='format'),[])
        row={'source':r.get('inputUrl'),'postId':k[1],'baselineCopies':len(rr),'name':author(r).get('name'),'matched':other is not None,'baselineTimestamp':timestamp(r),'baselineCaption':caption(r),'baselineSharedCaption':caption(r.get('sharedPost') or {}),'baselineMedia':media(r),'baselineSharedMedia':media(r.get('sharedPost') or {}),'baselineHasSharedOriginal':bool(r.get('sharedPost')),'baselineFormattedEvents':[{'name':x.get('eventName') or x.get('name') or x.get('title'),'start':x.get('utcStartDate') or x.get('startTime'),'venue':x.get('venueName') or x.get('location')} for x in events],'snapshotRowIndex':s.get('rowIndex')}
        if other:
            sa=author(r.get('sharedPost') or {});ca=author(other.get('sharedPost') or {})
            row.update({'candidateCaption':caption(other),'candidateSharedCaption':caption(other.get('sharedPost') or {}),'candidateMedia':media(other),'candidateSharedMedia':media(other.get('sharedPost') or {}),'captionEqual':caption(r)==caption(other),'sharedCaptionEqual':caption(r.get('sharedPost') or {})==caption(other.get('sharedPost') or {}),'outerAuthorIdEqual':str(author(r).get('id') or '')==str(author(other).get('id') or ''),'outerAuthorName':author(other).get('name'),'originalAuthorIdEqual':str(sa.get('id') or '')==str(ca.get('id') or ''),'originalAuthorName':ca.get('name'),'originalProfilePresent':bool(ca.get('profileUrl')),'originalPostUrlPresent':bool((other.get('sharedPost') or {}).get('url')),'timestampDeltaSeconds':None if timestamp(other) is None else timestamp(other)-timestamp(r),'mediaIdOrderEqual':sig(r)['media']==sig(other)['media'],'sharedMediaIdOrderEqual':sig(r)['sharedMedia']==sig(other)['sharedMedia'],'baselineSignature':sig(r),'candidateSignature':sig(other)})
            row['baselineImageAssetCount']=sum(bool(x['imageUrl']) for x in media(r)+media(r.get('sharedPost') or {}))
            row['candidateImageAssetCount']=sum(bool(x['imageUrl']) for x in media(other)+media(other.get('sharedPost') or {}))
            row['fewerImageAssets']=row['candidateImageAssetCount']<row['baselineImageAssetCount']
        comparisons.append(row)
    requested={source(u) for u in p['sourceUrls']};observed={source(x.get('inputUrl')) for x in raw};baselineSources={key(x)[0] for x in official}
    diagnostics=[r for r in raw if r.get('error')]
    missing=[x for x in comparisons if not x['matched']];matched=[x for x in comparisons if x['matched']];shares=[x for x in comparisons if x['baselineHasSharedOriginal']]
    completeFamilies={x['label'].split('-retry')[0] for x in runProgress if x['operationalSuccess']}
    summary={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baselineRun':p['officialRun']['id'],'candidateBuild':p['candidateBuild'],'allFullRunsSucceeded':completeFamilies=={'full-1','full-2','full-3','full-4'},'fullRuns':runProgress,'requestedDistinctSources':len(requested),'rateLimitedFullRuns':blockedRuns,'handledSourceCountFromLogs':len(handledSources),'finishedSourceCountFromLogs':len(finishedSources),'baselinePostRows':len(official),'baselineDistinctSourcePostKeys':len(b),'candidatePostRows':len(posts),'candidateMatchedWindowRows':len(eligible),'candidateAfterCutoffRowsExcluded':len(postCutoff),'candidateDiagnosticRows':len(diagnostics),'candidateDiagnosticCodes':dict(collections.Counter(r.get('error') for r in diagnostics)),'candidateSourcesWithoutResultRows':sorted(requested-observed),'baselineKeysInHandledSources':sum(k[0] in handledSources for k in b),'matchedKeysInHandledSources':sum(key({'inputUrl':x['source'],'postId':x['postId']})[0] in handledSources for x in matched),'matchedBaselineKeys':len(matched),'missingBaselineKeys':len(missing),'additionalWithinWindowKeys':len(set(c)-set(b)),'candidateDuplicateSourcePostKeys':sum(len(v)-1 for v in c.values()),'captionExactMatches':sum(x['captionEqual'] for x in matched),'outerAuthorIdMatches':sum(x['outerAuthorIdEqual'] for x in matched),'outerAuthorMissing':sum(not x.get('outerAuthorName') for x in matched),'timestampExactMatches':sum(x['timestampDeltaSeconds']==0 for x in matched),'mediaIdOrderMatches':sum(x['mediaIdOrderEqual'] for x in matched),'sharedOriginalBaselineKeys':len(shares),'sharedOriginalMatchedKeys':sum(x['matched'] for x in shares),'sharedCaptionExactMatches':sum(x.get('sharedCaptionEqual',False) for x in shares),'sharedOriginalAuthorIdMatches':sum(x.get('originalAuthorIdEqual',False) for x in shares),'sharedMediaIdOrderMatches':sum(x.get('sharedMediaIdOrderEqual',False) for x in shares),'fullActorChargeUsd':sum(x.get('usageTotalUsd') or 0 for x in runProgress),'allExperimentActorChargeUsd':sum(e.get('usageTotalUsd') or 0 for e in m['runs']),'baselineActorChargeUsd':p['officialRun']['charge'],'missingFormattedEventItems':sum(len(x['baselineFormattedEvents']) for x in missing),'limitations':['Captures are hours apart, not simultaneous. Exact missing IDs can reflect deletion or availability changes; not every absence proves permanent omission.','Candidate whole-day upper bound is filtered offline to original scrape finish; later captures are excluded from matched coverage but included in actual cost.','Formatted event items are saved baseline parser outputs, not fresh candidate parser results or distinct live events.','Quiet sources can finish without any result row. Sources without result rows are not automatically failed.','No candidate result has been sent to production parser, Firestore or media publication.']}
    summary.update({'comparisonMode':'corrected-20-source-daily' if corrected else 'invalid-full-feed-attempt','allRequestedRunsSucceeded':bool(runProgress) and all(x['operationalSuccess'] for x in runProgress),'recallScoreValid':corrected and bool(runProgress) and all(x['operationalSuccess'] for x in runProgress),'recallScoreCaveat':'Time-separated control; review absence and edits individually.' if corrected else 'Initial spending caps apparently reduced depth to two posts/page; aborted partial data and throttled empty batches are not a valid full-feed recall test.'})
    summary['matchedPostsWithFewerImageAssets']=sum(x['fewerImageAssets'] for x in matched)
    if not corrected:
        summary['unmatchedBaselineKeysInDiscardedAttempt']=summary.pop('missingBaselineKeys')
        summary.pop('missingFormattedEventItems',None)
    save(prefix+'comparison-summary.json',summary);save(prefix+'post-comparisons.json',comparisons);save(prefix+'missing-baseline-posts.json',missing)
    save(prefix+'additional-within-window.json',[rr[0] for k,rr in c.items() if k not in b]);save(prefix+'candidate-diagnostics.json',diagnostics)
    save(prefix+'candidate-window-posts.json',eligible);save(prefix+'candidate-all-posts.json',posts)
    print(json.dumps({k:v for k,v in summary.items() if k!='candidateSourcesWithoutResultRows'},indent=2,ensure_ascii=True))
if __name__=='__main__':main()
