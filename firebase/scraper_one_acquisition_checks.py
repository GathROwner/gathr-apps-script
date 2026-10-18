"""Offline source/depth/operational checks for the acquisition-only pilot."""
import re, urllib.parse

def source_identity(url):
    p=urllib.parse.urlsplit(str(url or ''))
    if p.hostname in {'facebook.com','www.facebook.com','m.facebook.com'}:
        return 'facebook.com'+p.path.rstrip('/').lower()+('?' + p.query if p.path.rstrip('/')=='/profile.php' else '')
    return str(url or '').rstrip('/').lower()

def assess(urls,depth,status,message,rows,log):
    norm=source_identity
    requested={norm(u) for u in urls}
    finished=re.findall(r'(https?://[^\s]+) -> finished collecting posts?: (\d+)/(\d+)',log)
    completed={norm(u) for u,n,d in finished}
    diagnostics=[r for r in rows if r.get('error')]
    diagnostic_sources={norm(r.get('inputUrl')) for r in diagnostics if r.get('error') in {'INVALID_URL','PAGE_UNAVAILABLE'}} & requested
    missing=sorted(requested-completed-diagnostic_sources)
    limited='rate limit reached' in (log+' '+str(message or '')).lower()
    clipped=any(int(d)<depth for u,n,d in finished)
    capped=[u for u,n,d in finished if int(n)>=int(d)]
    result='rate_limited' if limited else 'depth_clamped' if clipped else status.lower() if status!='SUCCEEDED' else 'incomplete_sources' if missing else 'complete_with_source_holds' if diagnostic_sources else 'complete'
    return {'operationalStatus':result,'rateLimited':limited,'observedDepths':sorted({int(d) for u,n,d in finished}),'sourcesFinished':len(completed & requested),'sourcesWithTerminalDiagnostics':len(diagnostic_sources),'sourceDiagnostics':diagnostics,'sourcesWithoutCompletion':missing,'sourcesAtDepthLimit':capped}

def budget_usd(source_count,depth):
    if not isinstance(source_count,int) or not isinstance(depth,int) or not 1<=source_count<=100 or depth<1:raise ValueError('invalid source count or depth')
    return round(.00025+.0025*source_count*depth,5)
