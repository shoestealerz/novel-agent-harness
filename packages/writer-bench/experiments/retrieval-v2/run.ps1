param(
  [ValidateRange(1, 5)]
  [int]$Concurrency = 2
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $Bun) {
  $BundledBun = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $BundledBun) { $Bun = $BundledBun }
}
if (-not $Bun) { throw "Bun is required. Install it or add bun to PATH." }

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$HarborDirectory = Join-Path $PackageRoot ".results\retrieval-v2-harbor-$Timestamp"
$MeridianDirectory = Join-Path $PackageRoot ".results\retrieval-v2-meridian-$Timestamp"

Push-Location $PackageRoot
try {
  & $Bun src/cli.ts run `
    --suite corpora/harbor-light/tasks/retrieval.jsonl `
    --targets experiments/retrieval-v2/targets.harbor.json `
    --out $HarborDirectory `
    --trials 1 `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Harbor Light run failed. Review $HarborDirectory." }

  & $Bun src/cli.ts run `
    --suite corpora/quiet-meridian/tasks/retrieval.jsonl `
    --targets experiments/retrieval-v2/targets.meridian.json `
    --out $MeridianDirectory `
    --trials 1 `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Quiet Meridian run failed. Review $MeridianDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $HarborDirectory "run.json") `
    --baseline retrieval-v1 `
    --candidate retrieval-v2 `
    --gates experiments/retrieval-v2/gates.harbor.json `
    --out "$HarborDirectory-comparison"
  $HarborPassed = $LASTEXITCODE -eq 0

  & $Bun src/cli.ts compare `
    --run (Join-Path $MeridianDirectory "run.json") `
    --baseline retrieval-v1 `
    --candidate retrieval-v2 `
    --gates experiments/retrieval-v2/gates.meridian.json `
    --out "$MeridianDirectory-comparison"
  $MeridianPassed = $LASTEXITCODE -eq 0

  Write-Host "Harbor Light: $HarborDirectory"
  Write-Host "Quiet Meridian: $MeridianDirectory"
  if (-not $HarborPassed -or -not $MeridianPassed) {
    throw "At least one retrieval-v2 development gate failed."
  }
}
finally {
  Pop-Location
}
