"""Overlay only reviewed source/compiler bytes onto the verified immutable live ZIP."""
import hashlib,json,os,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parent
candidate=Path(r'C:\Users\craig\.codex\worktrees\o24four')
baseline_commit='af5d80435c14dd44cfa588fad1fabb3f8be9d306'
archive=root.parent/'oct23-small-batch/release/parser/serving-source.zip'
release=root/'release/parser'
assembly=root/'release/parser/source-tree'
sha=lambda data:hashlib.sha256(data).hexdigest()
expected=json.loads((root.parent/'oct23-small-batch/release/parser/verified.json').read_text())
assert sha(archive.read_bytes())==expected['archiveSHA256']
assert not (root/'frozen-review-packet.json').exists(),'Frozen assembly cannot be revised without explicit review'
if (release/'assembly-byte-verification.json').exists() and not (release/'assembly-initial-501997e.json').exists():
    (release/'assembly-initial-501997e.json').write_bytes((release/'assembly-byte-verification.json').read_bytes())
sources=subprocess.check_output(['git','-C',str(candidate),'diff','--name-only',baseline_commit,'HEAD'],text=True).splitlines()
assert len(sources)==11 and all(x.startswith('src/') and x.endswith('.ts') for x in sources)
assert subprocess.check_output(['git','-C',str(candidate),'status','--porcelain','--untracked-files=no'],text=True).strip()==''
release.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as z:
    names=[i.filename for i in z.infolist() if not i.is_dir()]
    assert all(not x.startswith(('/','\\')) and '..' not in Path(x).parts for x in names)
    assert not any('service-account' in x.lower() or x.lower().endswith(('.pem','.p12')) for x in names)
    before={n:sha(z.read(n)) for n in names}
    z.extractall(assembly)
allowed=set()
for source in sources:
    names=[source]
    stem='lib/'+source[len('src/'):-len('.ts')]
    names += [stem+ext for ext in ['.js','.js.map','.d.ts','.d.ts.map'] if (candidate/(stem+ext)).exists()]
    assert stem+'.js' in names
    for name in names:
        target=assembly/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((candidate/name).read_bytes());allowed.add(name)
after={}
for current,dirs,files in os.walk(assembly):
    dirs[:]=[x for x in dirs if x not in ['node_modules','.git']]
    for name in files:
        file=Path(current)/name;after[file.relative_to(assembly).as_posix()]=sha(file.read_bytes())
assert not set(before)-set(after)
changed=sorted(n for n,h in after.items() if before.get(n)!=h)
assert set(changed)<=allowed
for name in allowed:assert after[name]==sha((candidate/name).read_bytes())
report={'status':'only_reviewed_source_and_tested_compiler_outputs_changed','candidateCommit':subprocess.check_output(['git','-C',str(candidate),'rev-parse','HEAD'],text=True).strip(),'baselineCommit':baseline_commit,'baselineArchiveSHA256':sha(archive.read_bytes()),'assembly':str(assembly),'sources':sources,'changedFiles':changed,'unchangedBaselineFiles':sum(after.get(n)==h for n,h in before.items()),'files':after,'dotenvHash':after['.env.gathr-migrated'],'packageLockUnchanged':after['package-lock.json']==before['package-lock.json'],'runtimeConfigurationUnchanged':True,'buildAlreadyVerifiedOnExactSourceAndCompilerBytes':True}
(release/'assembly-byte-verification.json').write_text(json.dumps(report,indent=2)+'\n')
(release/'baseline-files.json').write_text(json.dumps(before,indent=2)+'\n')
config=json.loads((candidate/'firebase.json').read_text())
functions=config['functions'];functions=functions if isinstance(functions,list) else [functions]
selected=[f for f in functions if f.get('codebase')=='gathr-functions'];assert len(selected)==1
selected[0]['source']=str(assembly);selected[0]['predeploy']=[]
config['functions']=selected
(release/'firebase.prebuilt.json').write_text(json.dumps(config,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))
