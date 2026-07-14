param(
  [ValidateRange(1, 5)]
  [int]$Trials = 3,
  [ValidateRange(1, 5)]
  [int]$Concurrency = 5
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
$OpenCode = (Get-Command opencode -ErrorAction SilentlyContinue).Source
if (-not $Bun) {
  $BundledBun = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $BundledBun) { $Bun = $BundledBun }
}
if (-not $OpenCode) {
  $BundledOpenCode = Join-Path $env:USERPROFILE ".bun\bin\opencode.exe"
  if (Test-Path $BundledOpenCode) { $OpenCode = $BundledOpenCode }
}
if (-not $Bun) { throw "Bun is required." }
if (-not $OpenCode) { throw "OpenCode is required." }
if (-not $env:DEEPSEEK_API_KEY) {
  $env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
}
if (-not $env:DEEPSEEK_API_KEY) { throw "DEEPSEEK_API_KEY is required." }

$env:WRITER_BENCH_MODEL = "deepseek-v4-pro"
$env:WRITER_BENCH_OPENCODE_MODEL = "deepseek/deepseek-v4-pro"
$env:WRITER_BENCH_BASE_URL = "https://api.deepseek.com"
$env:WRITER_BENCH_TEMPERATURE = "0.2"
$env:WRITER_BENCH_MAX_TOKENS = "4096"
$env:WRITER_BENCH_OPENCODE_BIN = $OpenCode
$env:OPENCODE_CONFIG_CONTENT = '{"permission":{"external_directory":"deny","question":"deny"},"agent":{"build":{"temperature":0.2,"steps":12}}}'
$env:OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = "4096"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunDirectory = Join-Path $PackageRoot ".results\integrated-harness-$Timestamp"

Push-Location $PackageRoot
try {
  & $Bun run baseline:doctor
  if ($LASTEXITCODE -ne 0) { throw "Baseline readiness check failed." }

  & $Bun src/cli.ts run `
    --suite experiments/immutable-proposals/tasks.jsonl `
    --targets experiments/integrated-harness/targets.json `
    --out $RunDirectory `
    --trials $Trials `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Integrated harness run failed. Review $RunDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline integrated-raw `
    --candidate integrated-writer-harness `
    --gates experiments/integrated-harness/gates.json `
    --out "$RunDirectory-vs-raw"
  $RawPassed = $LASTEXITCODE -eq 0

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline integrated-stock-opencode `
    --candidate integrated-writer-harness `
    --gates experiments/integrated-harness/gates.json `
    --out "$RunDirectory-vs-stock"
  $StockPassed = $LASTEXITCODE -eq 0

  Write-Host "Run: $RunDirectory"
  if (-not $RawPassed -or -not $StockPassed) { throw "At least one integrated comparison failed." }
}
finally {
  Pop-Location
}
