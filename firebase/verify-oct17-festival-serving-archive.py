"""Compare the immutable deployed archive with the exact tested release."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
out = root / 'functions/artifacts/oct17-festival-corroboration-release'
assembly = out / 'assembly'
with zipfile.ZipFile(out / 'deployed-function-source.zip') as archive:
    names = set(archive.namelist())
    expected = sorted(p.relative_to(assembly).as_posix() for folder in ('src', 'lib', 'scripts')
                      for p in (assembly / folder).rglob('*') if p.is_file())
    expected += ['package.json', 'package-lock.json', 'tsconfig.json']
    for name in expected:
        assert name in names, f'Missing deployed file {name}'
        assert archive.read(name) == (assembly / name).read_bytes(), f'Deployed file drift {name}'
    for folder in ('src/', 'lib/', 'scripts/'):
        assert {n for n in names if n.startswith(folder) and not n.endswith('/')} == {n for n in expected if n.startswith(folder)}, f'Unexpected deployed files in {folder}'
    result = {'archiveSha256': hashlib.sha256((out / 'deployed-function-source.zip').read_bytes()).hexdigest(),
              'releaseCommit': '15d5c71f012c00a8723df46d035abd4180a117c1',
              'exactTestedFilesMatched': len(expected), 'sourceAndCompiledInventoryMatched': True,
              'liveWrites': 0}
    (out / 'independent-source-archive-verification.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
