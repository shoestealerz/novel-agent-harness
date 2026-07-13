param(
  [ValidateRange(1, 5)]
  [int]$Trials = 1
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $PSScriptRoot
$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
$OpenCode = (Get-Command opencode -ErrorAction SilentlyContinue).Source
$EnvironmentNames = @(
  "DEEPSEEK_API_KEY",
  "WRITER_BENCH_MODEL",
  "WRITER_BENCH_OPENCODE_MODEL",
  "WRITER_BENCH_BASE_URL",
  "WRITER_BENCH_TEMPERATURE",
  "WRITER_BENCH_MAX_TOKENS",
  "WRITER_BENCH_OPENCODE_BIN",
  "WRITER_BENCH_OPENCODE_DIR",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"
)
$PreviousEnvironment = @{}
foreach ($Name in $EnvironmentNames) {
  $PreviousEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
}

if (-not $Bun) {
  $BundledBun = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $BundledBun) { $Bun = $BundledBun }
}
if (-not $OpenCode) {
  $BundledOpenCode = Join-Path $env:USERPROFILE ".bun\bin\opencode.exe"
  if (Test-Path $BundledOpenCode) { $OpenCode = $BundledOpenCode }
}
if (-not $Bun) { throw "Bun is required. Install it or add bun to PATH." }
if (-not $OpenCode) { throw "OpenCode is required. Install opencode-ai or set WRITER_BENCH_OPENCODE_BIN." }

if (-not $env:DEEPSEEK_API_KEY) {
  $Credential = Get-Credential -UserName "deepseek" -Message "Enter your DeepSeek API key in the password field. It will only be kept for this process."
  $env:DEEPSEEK_API_KEY = $Credential.GetNetworkCredential().Password
}

$env:WRITER_BENCH_MODEL = "deepseek-v4-pro"
$env:WRITER_BENCH_OPENCODE_MODEL = "deepseek/deepseek-v4-pro"
$env:WRITER_BENCH_BASE_URL = "https://api.deepseek.com"
$env:WRITER_BENCH_TEMPERATURE = "0.2"
$env:WRITER_BENCH_MAX_TOKENS = "4096"
$env:WRITER_BENCH_OPENCODE_BIN = $OpenCode
$env:OPENCODE_CONFIG_CONTENT = '{"permission":{"external_directory":"deny","question":"deny"},"agent":{"build":{"temperature":0.2,"steps":12}}}'
$env:OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = "4096"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunDirectory = Join-Path $PackageRoot ".results\deepseek-baseline-$Timestamp"
$ComparisonDirectory = "$RunDirectory-comparison"
$OpenCodeWorkspaceRoot = Join-Path ([IO.Path]::GetTempPath()) "writer-bench-opencode"
$OpenCodeDirectory = Join-Path $OpenCodeWorkspaceRoot $Timestamp
New-Item -ItemType Directory -Path $OpenCodeDirectory -Force | Out-Null
$env:WRITER_BENCH_OPENCODE_DIR = $OpenCodeDirectory

Push-Location $PackageRoot
try {
  & $Bun run baseline:doctor
  if ($LASTEXITCODE -ne 0) { throw "Baseline readiness check failed." }

  & $Bun src/cli.ts run `
    --suite corpora/harbor-light/tasks/pilot.jsonl `
    --targets baseline/targets.deepseek.json `
    --out $RunDirectory `
    --trials $Trials
  if ($LASTEXITCODE -ne 0) { throw "One or more benchmark executions failed. Review $RunDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline raw-model `
    --candidate stock-opencode `
    --gates baseline/gates.json `
    --out $ComparisonDirectory

  Write-Host "Run: $RunDirectory"
  Write-Host "Comparison: $ComparisonDirectory"
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "The comparison did not pass all gates. That is a valid baseline result; inspect comparison.md."
  }
}
finally {
  Pop-Location
  foreach ($Name in $EnvironmentNames) {
    [Environment]::SetEnvironmentVariable($Name, $PreviousEnvironment[$Name], "Process")
  }
  $WorkspaceRoot = [IO.Path]::GetFullPath($OpenCodeWorkspaceRoot).TrimEnd("\") + "\"
  $Workspace = [IO.Path]::GetFullPath($OpenCodeDirectory)
  if ($Workspace.StartsWith($WorkspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $Workspace -Recurse -Force -ErrorAction SilentlyContinue
  }
}
