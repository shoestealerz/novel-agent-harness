param(
  [ValidateRange(1, 5)]
  [int]$Trials = 3,
  [ValidateRange(1, 5)]
  [int]$Concurrency = 3,
  [switch]$RetrievalOnly
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
$ValidityDirectory = Join-Path $PackageRoot ".results\retrieval-v2-sealed-validity-$Timestamp"
$RunDirectory = Join-Path $PackageRoot ".results\retrieval-v2-sealed-downstream-$Timestamp"

Push-Location $PackageRoot
try {
  & $Bun src/cli.ts run `
    --suite corpora/glass-orchard/tasks/retrieval.jsonl `
    --targets experiments/retrieval-v2-sealed/targets.retrieval-only.json `
    --out $ValidityDirectory `
    --trials 1 `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Sealed deterministic run failed. Review $ValidityDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $ValidityDirectory "run.json") `
    --baseline sealed-retrieval-v1 `
    --candidate sealed-retrieval-v2 `
    --gates experiments/retrieval-v2-sealed/gates-deterministic.json `
    --out "$ValidityDirectory-comparison"
  $DeterministicPassed = $LASTEXITCODE -eq 0
  Write-Host "Deterministic result: $ValidityDirectory"
  if ($RetrievalOnly) {
    if (-not $DeterministicPassed) { throw "Sealed deterministic gates failed." }
    return
  }

  if (-not $env:DEEPSEEK_API_KEY) {
    $env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
  }
  if (-not $env:DEEPSEEK_API_KEY) { throw "DEEPSEEK_API_KEY is required for the preregistered downstream run." }
  $env:WRITER_BENCH_MODEL = "deepseek-v4-pro"
  $env:WRITER_BENCH_BASE_URL = "https://api.deepseek.com"
  $env:WRITER_BENCH_TEMPERATURE = "0.2"
  $env:WRITER_BENCH_MAX_TOKENS = "4096"

  & $Bun src/cli.ts run `
    --suite corpora/glass-orchard/tasks/retrieval.jsonl `
    --targets experiments/retrieval-v2-sealed/targets.downstream.json `
    --out $RunDirectory `
    --trials $Trials `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Sealed downstream run failed. Review $RunDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline sealed-writer-retrieval-v1 `
    --candidate sealed-writer-retrieval-v2 `
    --gates experiments/retrieval-v2-sealed/gates-downstream.json `
    --out "$RunDirectory-comparison"
  $DownstreamPassed = $LASTEXITCODE -eq 0

  Write-Host "Downstream result: $RunDirectory"
  if (-not $DeterministicPassed -or -not $DownstreamPassed) {
    throw "At least one preregistered sealed-validation gate failed. Record the result unchanged."
  }
}
finally {
  Pop-Location
}
