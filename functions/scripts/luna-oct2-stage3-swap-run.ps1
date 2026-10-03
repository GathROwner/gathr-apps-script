$ErrorActionPreference = 'Stop'
$functionsDir = Split-Path -Parent $PSScriptRoot
$artifactDir = Join-Path (Split-Path -Parent $functionsDir) 'artifacts/luna-oct2-cohort'
$keyForReplay = (& gcloud secrets versions access latest --secret=OPENAI_API_KEY --project=gathr-migrated).Trim()
if (-not $keyForReplay) { throw 'Existing OpenAI API key was unavailable' }
$env:OPENAI_API_KEY = $keyForReplay
$jobs = @()
try {
  $segments = @(
    @{ Selection = 'first'; Label = 'stage3-swap-first48'; Start = 0; Count = 24 },
    @{ Selection = 'first'; Label = 'stage3-swap-first48'; Start = 24; Count = 24 },
    @{ Selection = 'additional'; Label = 'stage3-swap-additional40'; Start = 0; Count = 20 },
    @{ Selection = 'additional'; Label = 'stage3-swap-additional40'; Start = 20; Count = 20 }
  )
  foreach ($segment in $segments) {
    $jobs += Start-Job -ArgumentList $functionsDir, $artifactDir, $segment.Selection,
      $segment.Label, $segment.Start, $segment.Count -ScriptBlock {
      param($functionsDir, $artifactDir, $selection, $label, $start, $count)
      Set-Location -LiteralPath $functionsDir
      $env:LUNA_COHORT_RUN_LABEL = $label
      $env:LUNA_COHORT_SELECTION = $selection
      $env:LUNA_COHORT_STAGE3_ONLY = 'true'
      $env:LUNA_COHORT_DISABLE_LEGACY_FALLBACK = 'true'
      $logPath = Join-Path $artifactDir ("$label-$start-$count.log")
      node scripts/luna-oct2-cohort-dryrun.mjs $start $count *> $logPath
      [pscustomobject]@{ Label = $label; Start = $start; Count = $count;
        ExitCode = $LASTEXITCODE; LogPath = $logPath }
    }
  }
  while (@($jobs | Where-Object State -eq 'Running').Count -gt 0) {
    Start-Sleep -Seconds 30
    $status = $jobs | ForEach-Object { "$($_.Name):$($_.State)" }
    Write-Output ($status -join ' ')
  }
  $results = $jobs | Receive-Job -Wait
  $results | Format-Table -AutoSize
  if (@($results | Where-Object ExitCode -ne 0).Count -gt 0) {
    throw 'At least one cohort segment failed; inspect its log before scoring.'
  }
} finally {
  Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
}
