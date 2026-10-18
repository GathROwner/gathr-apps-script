"""Bounded exact-ID enrichment experiment. Never imported by production.

Native captures are immutable; write enriched copies and evidence sidecars only.
No caption, venue, post identity, media order or shared-original relationship is
inferred from an author lookup, nearby post, requested page, or generic OG image.
"""
import copy, datetime, hashlib, html.parser, io, json, pathlib, re
import urllib.error, urllib.parse, urllib.request

FB_HOSTS={'facebook.com','www.facebook.com','m.facebook.com'}
MAX_BYTES=6*1024*1024

def video_id(url):
    p=urllib.parse.urlsplit(str(url or ''))
    if p.scheme!='https' or p.hostname not in FB_HOSTS or p.username or p.password:return None
    if p.path.rstrip('/')=='/watch':
        v=urllib.parse.parse_qs(p.query).get('v',[])
        return v[0] if len(v)==1 and v[0].isdigit() else None
    m=re.fullmatch(r'/(?:[^/]+/)?(?:videos|reel)/(\d+)/?',p.path)
    return m[1] if m else None

class Meta(html.parser.HTMLParser):
    def __init__(self):super().__init__();self.values={}
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);key=a.get('property')
        if tag=='meta' and key and key.startswith('og:') and a.get('content'):
            self.values.setdefault(key,[]).append(a['content'])

def exact_video_preview(body,final_url,expected_id):
    if not re.fullmatch(r'\d+',str(expected_id)) or video_id(final_url)!=str(expected_id):return None
    p=Meta();p.feed(body)
    canon=p.values.get('og:url',[]);kind=p.values.get('og:type',[])
    if len(canon)!=1 or video_id(canon[0])!=str(expected_id) or kind!=['video.other']:return None
    images=p.values.get('og:image',[])
    if len(images)!=1:return None
    u=urllib.parse.urlsplit(images[0])
    if u.scheme!='https' or not u.hostname or not u.hostname.endswith('.fbcdn.net') or u.username or u.password:return None
    return {'id':str(expected_id),'canonicalUrl':canon[0],'finalUrl':final_url,'imageUrl':images[0],'evidenceKind':'facebook_exact_video_og'}

def author_registry(profile_results,requested_ids):
    """Only exact numeric profile-ID probes may provide a missing display name."""
    registry={};conflicts=set()
    for r in profile_results:
        p=urllib.parse.urlsplit(r.get('inputUrl') or '')
        expected=p.path.strip('/')
        a=r.get('author') or {}
        if p.scheme!='https' or p.hostname not in FB_HOSTS or expected not in requested_ids or str(a.get('id'))!=expected or not a.get('name'):continue
        if expected in registry and registry[expected]['name']!=a['name']:conflicts.add(expected)
        registry[expected]={'id':expected,'name':a['name'],'profileUrl':a.get('profileUrl'),'lookupPostId':r.get('postId'),'evidenceKind':'exact_profile_id_actor_probe'}
    return {k:v for k,v in registry.items() if k not in conflicts}

def relationship_review(record,registry):
    """Different URLs are review evidence, not proof of a new sharing relationship."""
    if record.get('sharedPost'):return None
    a=record.get('author') or {};aid=str(a.get('id') or '')
    canonical=(registry.get(aid) or {}).get('profileUrl') or a.get('profileUrl')
    def identity(url):
        p=urllib.parse.urlsplit(str(url or ''))
        if p.hostname not in FB_HOSTS:return None
        if p.path.rstrip('/')=='/profile.php':return ('id',(urllib.parse.parse_qs(p.query).get('id') or [''])[0])
        path=p.path.rstrip('/').lower()
        if path.strip('/').isdigit():return ('id',path.strip('/'))
        m=re.fullmatch(r'/people/[^/]+/(\d+)',path)
        return ('id',m[1]) if m else ('path',path)
    publisher=identity(record.get('inputUrl'));author=identity(canonical)
    if not publisher or not author or publisher==author or publisher==('id',aid):return None
    return {'reason':'publisher_author_relationship_needs_review','requestedPublisherUrl':record.get('inputUrl'),'contentAuthorId':aid,'contentAuthorProfileUrl':canonical,'nativeIsReshare':record.get('isReshare'),'decision':'Preserve both identities; verify aliases/ownership before venue binding. Do not synthesize sharedPost metadata.'}

def enrich(record,registry,previews):
    result=copy.deepcopy(record);evidence=[];holds=[]
    for role,r in [('outer',result),('shared_original',result.get('sharedPost') or {})]:
        a=r.get('author') or {};aid=str(a.get('id') or '')
        if a and not a.get('name'):
            proof=registry.get(aid)
            if proof and proof['id']==aid:
                a['name']=proof['name'];evidence.append({'role':role,'field':'author.name',**proof})
            else:holds.append({'role':role,'reason':'author_name_unresolved','authorId':aid})
        for m in r.get('attachments') or []:
            if m.get('type')!='video' or m.get('thumbnailUrl') or m.get('thumbnail') or (m.get('image') or {}).get('uri'):continue
            mid=str(m.get('id') or '');proof=previews.get(mid)
            if proof and proof.get('id')==mid and proof.get('imageVerified'):
                m['thumbnailUrl']=proof['imageUrl'];evidence.append({'role':role,'field':'video.thumbnailUrl',**proof})
            else:holds.append({'role':role,'reason':'video_thumbnail_unresolved','mediaId':mid})
    # Do not make a usable post by inserting a profile portrait or a nearby post.
    def usable(r):
        return bool(r.get('postText') or any(x.get('type')=='photo' and x.get('url') or x.get('thumbnailUrl') or x.get('thumbnail') for x in r.get('attachments') or []))
    if not any(usable(r) for r in [result,result.get('sharedPost') or {}]):
        holds.append({'role':'outer','reason':'caption_and_image_unavailable'})
    if result.get('isReshare') and not result.get('sharedPost'):
        holds.append({'role':'shared_original','reason':'declared_reshare_without_original'})
    return result,{'postId':record.get('postId'),'requestedPublisherUrl':record.get('inputUrl'),'contentAuthorId':(record.get('author') or {}).get('id'),'sharedOriginalAuthorId':((record.get('sharedPost') or {}).get('author') or {}).get('id'),'enrichment':evidence,'holds':holds,'attributionReview':relationship_review(record,registry)}

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36','Accept-Language':'en-US,en;q=0.9'})
    with urllib.request.urlopen(req,timeout=30) as r:
        b=r.read(MAX_BYTES+1)
        if len(b)>MAX_BYTES:raise ValueError('response_too_large')
        return b,r.url

def capture_video(mid,directory):
    """One attempt per exact video ID; cached failures are never retried here."""
    if not re.fullmatch(r'\d+',str(mid)):raise ValueError('invalid_video_id')
    d=pathlib.Path(directory);d.mkdir(exist_ok=True,parents=True);cache=d/(mid+'.json')
    if cache.exists():return json.loads(cache.read_text(encoding='utf-8'))
    proof={'id':mid,'attemptedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'imageVerified':False}
    try:
        body,final=fetch('https://www.facebook.com/watch/?v='+mid)
        (d/(mid+'.html')).write_bytes(body)
        exact=exact_video_preview(body.decode('utf-8',errors='replace'),final,mid)
        if not exact:raise ValueError('exact_video_metadata_unavailable')
        b,final_image=fetch(exact['imageUrl'])
        u=urllib.parse.urlsplit(final_image)
        if u.scheme!='https' or not u.hostname or not u.hostname.endswith('.fbcdn.net'):raise ValueError('image_redirect_host_rejected')
        from PIL import Image
        with Image.open(io.BytesIO(b)) as im:im.load();width,height=im.size;fmt=im.format
        if width<64 or height<64:raise ValueError('preview_too_small')
        image_path=d/(mid+'.image');image_path.write_bytes(b)
        proof.update({**exact,'imageVerified':True,'width':width,'height':height,'format':fmt,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'htmlSha256':hashlib.sha256(body).hexdigest(),'localPath':str(image_path)})
    except urllib.error.HTTPError as e:proof['hold']='http_'+str(e.code)
    except Exception as e:proof['hold']=str(e) if isinstance(e,ValueError) else type(e).__name__
    cache.write_text(json.dumps(proof,indent=2),encoding='utf-8');return proof
