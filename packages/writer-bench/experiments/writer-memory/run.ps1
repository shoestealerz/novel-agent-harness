param(
  [ValidateRange(1, 5)]
  [int]$Trials = 3,
  [ValidateRange(1, 5)]
  [int]$Concurrency = 5
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $Bun) {
  $BundledBun = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $BundledBun) { $Bun = $BundledBun }
}
if (-not $Bun) { throw "Bun is required. Install it or add bun to PATH." }
if (-not $env:DEEPSEEK_API_KEY) {
  $env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
}
if (-not $env:DEEPSEEK_API_KEY) { throw "DEEPSEEK_API_KEY is required." }
$env:WRITER_BENCH_MODEL = "deepseek-v4-pro"
$env:WRITER_BENCH_BASE_URL = "https://api.deepseek.com"
$env:WRITER_BENCH_TEMPERATURE = "0.2"
$env:WRITER_BENCH_MAX_TOKENS = "4096"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunDirectory = Join-Path $PackageRoot ".results\writer-memory-$Timestamp"

Push-Location $PackageRoot
try {
  & $Bun src/cli.ts run `
    --suite experiments/writer-memory/tasks.jsonl `
    --targets experiments/writer-memory/targets.json `
    --out $RunDirectory `
    --trials $Trials `
    --concurrency $Concurrency
  if ($LASTEXITCODE -ne 0) { throw "Writer memory run failed. Review $RunDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline coding-compaction `
    --candidate writer-memory `
    --gates experiments/writer-memory/gates.json `
    --out "$RunDirectory-comparison"
  if ($LASTEXITCODE -ne 0) { throw "Writer memory gates failed. Record the result unchanged." }
  Write-Host "Run: $RunDirectory"
}
finally {
  Pop-Location
}
