$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
foreach ($case in $manifest.cases) {
  $taskId = "luna-cohort-$($case.key)-20261001-01" -replace '_','-'
  $payload = @{ data = @{ sourceUniqueIds = @($case.postId); parserMode = 'full5stage'; triggeredBy = $taskId; fileId = $case.fileId; dryRun = $true } }
  $payload | ConvertTo-Json -Depth 8 -Compress | Set-Content (Join-Path $root "$($case.key)-task.json") -Encoding utf8NoBOM
}
$manifest.cases | Select-Object key,postId,fileId,row,expectedCount | Format-Table -AutoSize
