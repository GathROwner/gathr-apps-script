$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$tok = gcloud auth print-access-token
$query = @{ structuredQuery = @{ from = @(@{ collectionId = 'parse_snapshots' }); where = @{ fieldFilter = @{ field = @{ fieldPath = 'createdAt' }; op = 'GREATER_THAN_OR_EQUAL'; value = @{ timestampValue = $manifest.frozenAtUtc } } }; limit = 250 } } | ConvertTo-Json -Depth 12 -Compress
$response = Invoke-RestMethod -Method Post -Uri 'https://firestore.googleapis.com/v1/projects/gathr-migrated/databases/(default)/documents:runQuery' -Headers @{ Authorization = "Bearer $tok" } -ContentType 'application/json' -Body $query
$results = @()
foreach ($case in $manifest.cases) {
  $matches = @($response | Where-Object { $_.document -and $_.document.fields.fileId.stringValue -eq $case.fileId -and [int]$_.document.fields.rowIndex.integerValue -eq $case.row } | Sort-Object { $_.document.createTime })
  foreach ($item in $matches) {
    $d = $item.document
    $out = $d.fields.stages.arrayValue.values[0].mapValue.fields.output.mapValue.fields
    $usage = $out.gptUsageSummary.mapValue.fields
    $events = @()
    foreach ($e in @($out.events.arrayValue.values)) {
      if (-not $e) { continue }
      $f = $e.mapValue.fields
      $events += [ordered]@{
        name = $f.name.stringValue; date = $f.startDate.stringValue; start = $f.startTime.stringValue; end = $f.endTime.stringValue
        venue = $f.establishment.stringValue; locationLabel = $f.locationLabel.stringValue; locationScope = $f.locationScope.stringValue
        image = $f.relevantImageUrl.stringValue; ticket = $f.ticketLink.stringValue; recurring = $f.isRecurring.booleanValue
        timeResolution = $f.timeResolution.stringValue
      }
    }
    $inputTokens = [int]$usage.inputTokens.integerValue
    $outputTokens = [int]$usage.outputTokens.integerValue
    $results += [pscustomobject][ordered]@{
      key = $case.key; snapshotId = ($d.name -split '/')[-1]; createdAt = $d.createTime; dryRun = $out.dryRun.booleanValue
      expectedCount = $case.expectedCount; actualCount = $events.Count; inputTokens = $inputTokens; outputTokens = $outputTokens
      cachedInputTokens = [int]$usage.cachedInputTokens.integerValue; totalCalls = [int]$usage.totalCalls.integerValue
      estimatedNoDiscountUsd = [math]::Round(($inputTokens * 0.10 + $outputTokens * 0.50) / 1000000, 6)
      events = $events
    }
  }
}
$results | ConvertTo-Json -Depth 9 | Set-Content (Join-Path $root 'results.json') -Encoding utf8NoBOM
$results | Select-Object key,createdAt,dryRun,expectedCount,actualCount,estimatedNoDiscountUsd,snapshotId | Format-Table -AutoSize
