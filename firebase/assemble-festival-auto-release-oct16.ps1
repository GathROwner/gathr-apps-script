param([Parameter(Mandatory=$true)][ValidateSet('worker','parser','finalizer','shared')][string]$Group,[string]$CapturedBaseline)
$ErrorActionPreference='Stop'
$coordinator=Split-Path -Parent $PSScriptRoot
$spec=@{
 worker=@{name='scheduledFestivalLinker';root='festival-auto-worker';base='52101944de885b77113ef88a4c9397c48235cd41'}
 parser=@{name='processDataset';root='festival-refresh-parser';base='372be0c40b20c581496759d7f4c66fba770182a4'}
 finalizer=@{name='finalizeCityLevelEventReviewTrigger';root='festival-refresh-finalizer';base='52101944de885b77113ef88a4c9397c48235cd41'}
 shared=@{name='processSharedEventPublicCandidates';root='festival-refresh-shared';base='52101944de885b77113ef88a4c9397c48235cd41'}
}[$Group]
$target=[IO.Path]::GetFullPath("C:\Users\craig\.codex\worktrees\$($spec.root)\gathr-apps-script")
$functions=Join-Path $target 'functions'
if((git -C $target status --porcelain)){throw 'Release checkout cleanliness changed'}
if($CapturedBaseline){if((git -C $target rev-parse HEAD) -ne $CapturedBaseline -or (git -C $target log -1 --format=%s) -ne "Capture immutable $($spec.name) serving source baseline"){throw 'Unexpected captured baseline'}}
elseif((git -C $target rev-parse HEAD) -ne $spec.base){throw 'Release checkout baseline changed'}
$archive=Join-Path $coordinator "functions/artifacts/pumpkin-overview-oct16/serving-archives/$($spec.name)"
$before=(Get-Content -Raw (Join-Path $coordinator 'functions/artifacts/pumpkin-overview-oct16/serving-before.json')|ConvertFrom-Json).rows|Where-Object name -eq $spec.name
$zipHash=(Get-FileHash -LiteralPath "$archive.zip" -Algorithm SHA256).Hash
if(-not $CapturedBaseline){
foreach($relative in @('src','scripts','test')){
 $destination=[IO.Path]::GetFullPath((Join-Path $functions $relative))
 if(-not $destination.StartsWith($functions+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe assembly destination'}
 if(Test-Path -LiteralPath $destination){if((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing source-tree junction removal'};Remove-Item -LiteralPath $destination -Recurse -Force}
 $source=Join-Path $archive $relative
 if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination $destination -Recurse}
}
foreach($file in @('package.json','package-lock.json','tsconfig.json','firebase.json','firestore.indexes.json','firestore.rules')){if(Test-Path -LiteralPath (Join-Path $archive $file)){Copy-Item -LiteralPath (Join-Path $archive $file) -Destination (Join-Path $functions $file)}}
# Runtime env is restored separately from a fresh secret-safe in-memory read.
# Never commit a source archive's environment file or service-account key.
git -C $target add -A -- functions
git -C $target commit --allow-empty -m "Capture immutable $($spec.name) serving source baseline"
if($LASTEXITCODE -ne 0){throw 'Baseline commit failed'}
}
$baselineCommit=(git -C $target rev-parse HEAD)
$files=@('src/services/areaEventPublication.ts')
if($Group -eq 'worker'){
 $files+=@('src/services/festivalLinker.ts','src/services/festivalEditionRegistry.ts','src/services/festivalLinkWorker.ts','src/services/festivalProgrammeHeading.ts','src/services/festivalProgrammeHeading.test.ts','src/services/festivalCaptureSource.ts','src/services/festivalCaptureSource.test.ts','src/services/festivalEditionRegistry.test.ts','scripts/festival-link-worker.test.mjs','scripts/festival-worker-test-db.mjs','scripts/festival-link-shadow-runner.mjs')
}else{
 node (Join-Path $coordinator 'firebase/apply-festival-refresh-overlay-oct16.mjs') $target
 if($LASTEXITCODE -ne 0){throw 'Refresh patch failed'}
 $files+=@('src/services/festivalAreaRefresh.ts','src/services/festivalAreaRefresh.test.ts')
}
foreach($relative in $files){$destination=Join-Path $functions $relative;New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination)|Out-Null;Copy-Item -LiteralPath (Join-Path $coordinator "functions/$relative") -Destination $destination}
$dependencies=Join-Path $functions 'node_modules'
if(-not (Test-Path -LiteralPath $dependencies)){
 $sourceModules=(Resolve-Path (Join-Path $coordinator 'functions/node_modules')).Path
 New-Item -ItemType Junction -Path $dependencies -Target $sourceModules | Out-Null
}
git -C $target diff --check
if($LASTEXITCODE -ne 0){throw 'Assembly whitespace check failed'}
git -C $target add -A -- functions
git -C $target commit -m "Apply reviewed automatic festival $Group guard on serving baseline"
if($LASTEXITCODE -ne 0){throw 'Release commit failed'}
$manifest=@{group=$Group;root=$target;sourceFunction=$spec.name;sourceHash=$before.hash;sourceArchive=$before.source;archiveSha256=$zipHash;baselineCommit=$baselineCommit;releaseCommit=(git -C $target rev-parse HEAD);runtimeFiles=$files;publisherPatch=($Group -ne 'worker');liveWrites=0}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $coordinator "functions/artifacts/pumpkin-overview-oct16/assembly-$Group.json")
$manifest|ConvertTo-Json -Depth 8
