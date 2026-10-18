"""Reconstruct exact immutable serving sources and add only the reviewed pool rule."""
import json, zipfile, pathlib, subprocess, hashlib
root = pathlib.Path(__file__).resolve().parents[1]
out = root/'functions/artifacts/pool-family-oct18/release'
candidate = root/'functions/artifacts/pool-family-oct18/reviewed-parser'
names = ['processDatasetResume','finalizeCityLevelEventReviewTrigger','processSharedEventPublicCandidates','scheduledSharedEventPublicCandidateProcessor']
def git(folder,*args):
    return subprocess.check_output(['git','-C',str(folder),*args],text=True).strip()
def normalized(b): return b.decode('utf8').replace('\r\r\n','\n').replace('\r\n','\n')
new = normalized((candidate/'src/utils/familyFriendlyScoring.ts').read_bytes())
rule = new[new.index('  // Public recreational aquatics'):new.index('  const hasFamilyActivity =')]
rows=[]
for name in names:
    folder=out/(name+'-release')
    fresh=not folder.exists()
    if fresh: folder.mkdir()
    with zipfile.ZipFile(out/(name+'-serving.zip')) as z:
        for entry in z.infolist():
            p=pathlib.PurePosixPath(entry.filename)
            assert not p.is_absolute() and '..' not in p.parts and ':' not in entry.filename
            if p.name.startswith('.env'): continue
            if fresh: z.extract(entry,folder)
    assert (folder/'src/index.ts').exists()
    assert (folder/'package-lock.json').read_bytes()==(candidate/'package-lock.json').read_bytes(), 'dependency drift'
    if fresh:
        with (folder/'.gitignore').open('a') as f: f.write('\n.env*\nnode_modules/\nlib/\nartifacts/\n*-tests.log\nfirebase-debug*\n')
        git(folder,'init');git(folder,'config','core.autocrlf','false');git(folder,'add','.');git(folder,'commit','-m','Preserve immutable serving archive before approved pool family patch')
    else: assert not git(folder,'status','--porcelain'), 'existing assembly dirty'
    base=git(folder,'rev-parse','HEAD')
    file=folder/'src/utils/familyFriendlyScoring.ts'
    old=normalized(file.read_bytes())
    if name=='processDatasetResume':
        expected=normalized(subprocess.check_output(['git','-C',str(candidate),'show','fe2aa981034bf37354001ae1b3a7b56431efaec6:src/utils/familyFriendlyScoring.ts']))
        assert old.strip()==expected.strip(), 'parser scorer baseline drift'
        # Check every serving source against the previously tested immutable parser assembly.
        baseline=root/'functions/artifacts/oct17-eight-group-release/parser-release'
        for f in (folder/'src').rglob('*'):
            if f.is_file(): assert normalized(f.read_bytes())==normalized((baseline/f.relative_to(folder)).read_bytes()), str(f)
        updated=new
    else:
        assert "'family-friendly-v5'" in old and 'hasRecreationalAquaticActivity' not in old
        updated=old.replace("'family-friendly-v5'","'family-friendly-v7'",1)
        updated=updated.replace('  const hasFamilyActivity =',rule+'  const hasFamilyActivity =',1)
        needle="/\\btrick[- ]or[- ]treat(?:ing)?\\b/.test(directText) || hasScoped('family_activity');"
        assert updated.count(needle)==1
        updated=updated.replace(needle,needle[:-1]+" ||\n    (hasRecreationalAquaticActivity && !hasExplicitFamilyAudience && !hasExplicitAllAges);",1)
    # Retain each archive's physical line endings to keep the delta narrow.
    ending='\r\r\n' if b'\r\r\n' in file.read_bytes() else '\r\n' if b'\r\n' in file.read_bytes() else '\n'
    file.write_bytes(updated.replace('\n',ending).encode('utf8'))
    (folder/'src/utils/familyFriendlyScoring.pool.test.ts').write_bytes((candidate/'src/utils/familyFriendlyScoring.pool.test.ts').read_bytes())
    config=json.loads((folder/'firebase.json').read_text())
    config['functions']=[{'source':'.','codebase':'gathr-functions','ignore':['node_modules','artifacts','.git','firebase-debug.log','firebase-debug.*.log','*.local'], 'predeploy':['npm --prefix "$RESOURCE_DIR" run build']}]
    (folder/'firebase.json').write_text(json.dumps(config,indent=2)+'\n')
    git(folder,'add','src/utils/familyFriendlyScoring.ts','src/utils/familyFriendlyScoring.pool.test.ts','firebase.json')
    git(folder,'commit','-m','Recognize public recreational aquatics as family suitable; preserve serving baseline')
    rows.append({'sourceFunction':name,'folder':str(folder),'baselineCommit':base,'releaseCommit':git(folder,'rev-parse','HEAD'),'diff':git(folder,'diff','--stat',base,'HEAD'),'scorerSha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(out/'assemblies.json').write_text(json.dumps(rows,indent=2))
print(json.dumps(rows))
