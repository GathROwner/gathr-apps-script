import json, pathlib, zipfile, hashlib
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'functions/artifacts/pool-family-oct18/release'
value=json.loads((out/'verification-pending-code.json').read_text())
def norm(b): return b.replace(b'\r\r\n',b'\n').replace(b'\r\n',b'\n')
proof=[]
for a in value['assemblies']:
    folder=pathlib.Path(a['folder'])
    with zipfile.ZipFile(out/(a['sourceFunction']+'-after-serving.zip')) as z, zipfile.ZipFile(out/(a['sourceFunction']+'-serving.zip')) as before:
        source={n for n in z.namelist() if n.startswith('src/') and not n.endswith('/')}
        local={p.relative_to(folder).as_posix() for p in (folder/'src').rglob('*') if p.is_file()}
        assert source==local, 'Serving source inventory drift'
        for name in source: assert norm(z.read(name))==norm((folder/name).read_bytes()), 'Serving source mismatch '+name
        old={n for n in before.namelist() if n.startswith('src/') and not n.endswith('/')}
        changed=sorted(n for n in source|old if n not in old or n not in source or norm(z.read(n))!=norm(before.read(n)))
        assert changed==['src/utils/familyFriendlyScoring.pool.test.ts','src/utils/familyFriendlyScoring.ts'], changed
        for name in ['package.json','package-lock.json','lib/utils/familyFriendlyScoring.js']:
            assert norm(z.read(name))==norm((folder/name).read_bytes()), name
        assert b'family-friendly-v7' in z.read('lib/utils/familyFriendlyScoring.js')
        assert b'hasRecreationalAquaticActivity' in z.read('lib/utils/familyFriendlyScoring.js')
        proof.append({'function':a['sourceFunction'],'servingSourceFiles':len(source),'changedSourceFiles':changed,'compiledScorerVerified':True,'archiveSha256':a['servingArchiveSha256']})
value.update(status='verified',sourceProof=proof)
(out/'verified.json').write_text(json.dumps(value,indent=2))
print(json.dumps({'status':'verified','functionCount':6,'assemblies':proof,'configurationPreserved':True}))
