param(
  [ValidateRange(1, 5)]
  [int]$Trials = 1,
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
$ValidityDirectory = Join-Path $PackageRoot ".results\retrieval-validity-$Timestamp"
$RunDirectory = Join-Path $PackageRoot ".results\retrieval-downstream-$Timestamp"

Push-Location $PackageRoot
try {
  & $Bun src/cli.ts run `
    --suite corpora/harbor-light/tasks/retrieval.jsonl `
    --targets experiments/retrieval/targets.retrieval-only.json `
    --out $ValidityDirectory `
    --trials 1 `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Retrieval validity run failed. Review $ValidityDirectory." }
  Write-Host "Retrieval validity: $ValidityDirectory"
  if ($RetrievalOnly) { return }

  if (-not $env:DEEPSEEK_API_KEY) {
    $env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
  }
  if (-not $env:DEEPSEEK_API_KEY) {
    $Credential = Get-Credential -UserName "deepseek" -Message "Enter your DeepSeek API key in the password field. It will only be kept for this process."
    $env:DEEPSEEK_API_KEY = $Credential.GetNetworkCredential().Password
  }
  $env:WRITER_BENCH_MODEL = "deepseek-v4-pro"
  $env:WRITER_BENCH_BASE_URL = "https://api.deepseek.com"
  $env:WRITER_BENCH_TEMPERATURE = "0.2"
  $env:WRITER_BENCH_MAX_TOKENS = "4096"

  & $Bun src/cli.ts run `
    --suite corpora/harbor-light/tasks/retrieval.jsonl `
    --targets experiments/retrieval/targets.downstream.json `
    --out $RunDirectory `
    --trials $Trials `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Downstream retrieval run failed. Review $RunDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline writer-retrieval-lexical `
    --candidate writer-retrieval-hierarchical-temporal `
    --gates experiments/retrieval/gates-vs-lexical.json `
    --out "$RunDirectory-vs-lexical"
  $LexicalPassed = $LASTEXITCODE -eq 0

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline writer-retrieval-hierarchical `
    --candidate writer-retrieval-hierarchical-temporal `
    --gates experiments/retrieval/gates-vs-hierarchical.json `
    --out "$RunDirectory-vs-hierarchical"
  $HierarchicalPassed = $LASTEXITCODE -eq 0

  Write-Host "Downstream run: $RunDirectory"
  if (-not $LexicalPassed -or -not $HierarchicalPassed) {
    throw "At least one retrieval regression gate failed. Review the comparison reports."
  }
}
finally {
  Pop-Location
}
