param(
  [ValidateRange(1, 5)]
  [int]$Trials = 1,
  [switch]$ContextOnly
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
$EnvironmentNames = @("DEEPSEEK_API_KEY", "WRITER_BENCH_MODEL", "WRITER_BENCH_BASE_URL", "WRITER_BENCH_TEMPERATURE", "WRITER_BENCH_MAX_TOKENS")
$PreviousEnvironment = @{}
foreach ($Name in $EnvironmentNames) { $PreviousEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process") }

if (-not $Bun) {
  $BundledBun = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $BundledBun) { $Bun = $BundledBun }
}
if (-not $Bun) { throw "Bun is required. Install it or add bun to PATH." }
if (-not $env:DEEPSEEK_API_KEY) {
  $Credential = Get-Credential -UserName "deepseek" -Message "Enter your DeepSeek API key in the password field. It will only be kept for this process."
  $env:DEEPSEEK_API_KEY = $Credential.GetNetworkCredential().Password
}

$env:WRITER_BENCH_MODEL = "deepseek-v4-pro"
$env:WRITER_BENCH_BASE_URL = "https://api.deepseek.com"
$env:WRITER_BENCH_TEMPERATURE = "0.2"
$env:WRITER_BENCH_MAX_TOKENS = "4096"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunDirectory = Join-Path $PackageRoot ".results\context-compiler-$Timestamp"
$Suites = @("--suite", "corpora/harbor-light/tasks/context.jsonl")
if (-not $ContextOnly) { $Suites = @("--suite", "corpora/harbor-light/tasks/pilot.jsonl") + $Suites }
$SuppliedGates = if ($ContextOnly) { "experiments/context-compiler/gates-context-vs-supplied.json" } else { "experiments/context-compiler/gates-vs-supplied.json" }
$MaximumGates = if ($ContextOnly) { "experiments/context-compiler/gates-context-vs-maximum.json" } else { "experiments/context-compiler/gates-vs-maximum.json" }

Push-Location $PackageRoot
try {
  & $Bun src/cli.ts run @Suites --targets experiments/context-compiler/targets.json --out $RunDirectory --trials $Trials
  if ($LASTEXITCODE -ne 0) { throw "One or more benchmark executions failed. Review $RunDirectory." }

  & $Bun src/cli.ts compare --run (Join-Path $RunDirectory "run.json") --baseline writer-context-supplied --candidate writer-context-compiled --gates $SuppliedGates --out "$RunDirectory-vs-supplied"
  $SuppliedPassed = $LASTEXITCODE -eq 0
  & $Bun src/cli.ts compare --run (Join-Path $RunDirectory "run.json") --baseline writer-context-maximum --candidate writer-context-compiled --gates $MaximumGates --out "$RunDirectory-vs-maximum"
  $MaximumPassed = $LASTEXITCODE -eq 0

  Write-Host "Run: $RunDirectory"
  Write-Host "Supplied comparison: $RunDirectory-vs-supplied"
  Write-Host "Maximum comparison: $RunDirectory-vs-maximum"
  if (-not $SuppliedPassed -or -not $MaximumPassed) { Write-Warning "At least one context-compiler gate failed." }
}
finally {
  Pop-Location
  foreach ($Name in $EnvironmentNames) { [Environment]::SetEnvironmentVariable($Name, $PreviousEnvironment[$Name], "Process") }
}
