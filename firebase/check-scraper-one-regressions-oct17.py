"""Source-grounded share and image regression checks; only public image GETs."""
import concurrent.futures, datetime, hashlib, io, json, pathlib, runpy, urllib.request
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'functions/artifacts/scraper-one-oct17'
helpers=runpy.run_path(str(ROOT/'firebase/analyze-scraper-one-oct17.py'))
media=helpers['media'];caption=helpers['caption'];key=helpers['key'];author=helpers['author']
OLD=pathlib.Path(r'C:/Users/craig/Documents/Codex/2026-10-16/gathr-apify-usage-audit-20261016/work/pilot')
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def save(n,x):(D/n).write_text(json.dumps(x,indent=2,ensure_ascii=False),encoding='utf-8')
m=read(D/'manifest.json');smoke=next(e for e in m['runs'] if e['label']=='smoke')
if not smoke.get('collected'):raise RuntimeError('Smoke not complete')
new=read(D/(smoke['id']+'-items.json'));old=read(OLD/'official-items.json')
by={key(x):x for x in new if x.get('postId')};oldBy={str(x.get('postId')):x for x in old if x.get('postId')}
targetIds=['1777333234400302','1708152184652928','1674702811236207']
checks=[];requests=[]
for pid in targetIds:
    before=oldBy[pid];after=by.get(key(before));bs=before.get('sharedPost') or {};ns=(after or {}).get('sharedPost') or {};bm=media(bs);nm=media(ns)
    checks.append({'postId':pid,'source':before.get('inputUrl'),'found':after is not None,'sharedCaptionExact':caption(bs)==caption(ns),'baselineOriginalCaption':caption(bs),'candidateOriginalCaption':caption(ns),'originalAuthorIdExact':str(author(bs).get('id'))==str(author(ns).get('id')),'originalAuthor':author(ns).get('name'),'originalProfilePresent':bool(author(ns).get('profileUrl')),'originalUrlPresent':bool(ns.get('url')),'originalTimePresent':bool(ns.get('timestamp')),'baselineMediaIds':[x['id'] for x in bm],'candidateMediaIds':[x['id'] for x in nm],'orderedGalleryIdsExact':[x['id'] for x in bm]==[x['id'] for x in nm]})
    for label,items in [('official',bm),('candidate',nm)]:
        for i,item in enumerate(items):
            if item['imageUrl']:requests.append({'provider':label,'postId':pid,'index':i,**item})
# Include the source-sharing family hunt and a dense multi-image gallery.
for pid in ['1434266702222333','1435817872067216']:
    item=next((x for x in new if x.get('postId')==pid),None)
    if item:
        for i,mm in enumerate(media(item)+media(item.get('sharedPost') or {})):
            if mm['imageUrl']:requests.append({'provider':'candidate','postId':pid,'index':i,**mm})

def fetch(item):
    result={k:v for k,v in item.items() if k!='imageUrl'}
    dest=D/'regression-images'/(item['provider']+'-'+item['postId']+'-'+str(item['index'])+'.jpg');dest.parent.mkdir(exist_ok=True)
    try:
        oldResults=read(D/'regression-image-checks.json') if (D/'regression-image-checks.json').exists() else []
        cached=next((x for x in oldResults if x['provider']==item['provider'] and x['postId']==item['postId'] and x['id']==item['id'] and x.get('decoded')),None)
        if cached and (D/cached['file']).exists():
            blob=(D/cached['file']).read_bytes()
            if hashlib.sha256(blob).hexdigest()!=cached['sha256']:raise RuntimeError('Cached image drift')
            return {**cached,'index':item['index'],'reusedSavedBytes':True}
        req=urllib.request.Request(item['imageUrl'],headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=30) as r:blob=r.read(15*1024*1024);result.update({'http':r.status,'contentType':r.headers.get('Content-Type')})
        with Image.open(io.BytesIO(blob)) as im:im.load();result.update({'decoded':True,'format':im.format,'actualWidth':im.width,'actualHeight':im.height})
        dest.write_bytes(blob);result.update({'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'file':str(dest.relative_to(D))})
    except Exception as e:result.update({'decoded':False,'error':type(e).__name__})
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(fetch,requests))
save('shared-regression-checks.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline':'October16 saved official full-source records; not a fresh simultaneous control','smokeRun':smoke['id'],'checks':checks,'paidActorCostUsd':smoke['usageTotalUsd'],'imageCheckCount':len(results),'imageDecoded':sum(x['decoded'] for x in results)})
save('regression-image-checks.json',results)
print(json.dumps({'shares':[{'postId':x['postId'],'found':x['found'],'captionExact':x['sharedCaptionExact'],'authorExact':x['originalAuthorIdExact'],'galleryExact':x['orderedGalleryIdsExact'],'photos':len(x['candidateMediaIds'])} for x in checks],'images':len(results),'decoded':sum(x['decoded'] for x in results),'candidateDimensions':[(x['postId'],x['actualWidth'],x['actualHeight']) for x in results if x['provider']=='candidate' and x['decoded']]},ensure_ascii=True))
