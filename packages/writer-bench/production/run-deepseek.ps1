param(
  [ValidateRange(1, 5)]
  [int]$Trials = 1,
  [string]$Resume
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $PSScriptRoot
$PackagesRoot = Split-Path -Parent $PackageRoot
$OpenCodeIndex = Join-Path $PackagesRoot "opencode\src\index.ts"
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
  "WRITER_BENCH_WRITER_COMMAND",
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
if (-not $OpenCode) { throw "OpenCode is required for the stock baseline. Install it or add it to PATH." }
if (-not (Test-Path $OpenCodeIndex)) { throw "Production Writer entry point was not found: $OpenCodeIndex" }
if ($Resume -and -not (Test-Path $Resume)) { throw "Resume run was not found: $Resume" }
$ResumePath = if ($Resume) { (Resolve-Path $Resume).Path } else { $null }

& $OpenCode --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Stock OpenCode executable failed its readiness check." }
& $Bun run --conditions=browser $OpenCodeIndex --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Production Writer source command failed its readiness check." }

if (-not $env:DEEPSEEK_API_KEY) {
  $Credential = Get-Credential -UserName "deepseek" -Message "Enter your DeepSeek API key in the password field. It will only be kept for this process."
  $env:DEEPSEEK_API_KEY = $Credential.GetNetworkCredential().Password
}

$env:WRITER_BENCH_MODEL = "deepseek-v4-pro"
$env:WRITER_BENCH_OPENCODE_MODEL = "deepseek/deepseek-v4-pro"
$env:WRITER_BENCH_BASE_URL = "https://api.deepseek.com"
$env:WRITER_BENCH_TEMPERATURE = "0.2"
$env:WRITER_BENCH_MAX_TOKENS = "16384"
$env:WRITER_BENCH_OPENCODE_BIN = $OpenCode
$env:WRITER_BENCH_WRITER_COMMAND = ConvertTo-Json -Compress @($Bun, "run", "--conditions=browser", $OpenCodeIndex)
$env:OPENCODE_CONFIG_CONTENT = '{"permission":{"external_directory":"deny","question":"deny"},"agent":{"build":{"temperature":0.2,"steps":12},"writer":{"temperature":0.2,"steps":12}}}'
$env:OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = "16384"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunDirectory = Join-Path $PackageRoot ".results\production-deepseek-$Timestamp"
$RawComparisonDirectory = "$RunDirectory-vs-raw"
$StockComparisonDirectory = "$RunDirectory-vs-stock"
$OpenCodeWorkspaceRoot = Join-Path ([IO.Path]::GetTempPath()) "writer-bench-opencode"
$OpenCodeDirectory = Join-Path $OpenCodeWorkspaceRoot "production-$Timestamp"
New-Item -ItemType Directory -Path $OpenCodeDirectory -Force | Out-Null
$env:WRITER_BENCH_OPENCODE_DIR = $OpenCodeDirectory
$Tasks = @(
  "harbor-explain-001",
  "harbor-explain-002",
  "harbor-diagnose-001",
  "harbor-diagnose-002",
  "harbor-diagnose-003",
  "harbor-plan-001",
  "harbor-plan-002",
  "harbor-revise-001",
  "harbor-revise-002"
)

Push-Location $PackageRoot
try {
  $RunArguments = @(
    "src/cli.ts", "run",
    "--suite", "corpora/harbor-light/tasks/pilot.jsonl",
    "--targets", "production/targets.deepseek.json",
    "--out", $RunDirectory,
    "--trials", $Trials,
    "--concurrency", 3,
    "--target", "raw-model",
    "--target", "stock-opencode",
    "--target", "production-writer"
  )
  foreach ($Task in $Tasks) { $RunArguments += @("--task", $Task) }
  if ($ResumePath) { $RunArguments += @("--resume", $ResumePath) }
  & $Bun @RunArguments
  if ($LASTEXITCODE -ne 0) { throw "One or more production benchmark executions failed. Review $RunDirectory." }

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline raw-model `
    --candidate production-writer `
    --gates production/gates.json `
    --out $RawComparisonDirectory
  $RawComparisonPassed = $LASTEXITCODE -eq 0

  & $Bun src/cli.ts compare `
    --run (Join-Path $RunDirectory "run.json") `
    --baseline stock-opencode `
    --candidate production-writer `
    --gates production/gates.json `
    --out $StockComparisonDirectory
  $StockComparisonPassed = $LASTEXITCODE -eq 0

  Write-Host "Run: $RunDirectory"
  Write-Host "Raw comparison: $RawComparisonDirectory"
  Write-Host "Stock comparison: $StockComparisonDirectory"
  if (-not $RawComparisonPassed -or -not $StockComparisonPassed) {
    Write-Warning "At least one production comparison did not pass all release gates. Inspect the generated reports."
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
