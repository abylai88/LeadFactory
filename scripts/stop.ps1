$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pidFile = Join-Path $projectRoot '.runtime/processes.json'
if (-not (Test-Path $pidFile)) { Write-Host 'No managed processes.'; exit 0 }
$processes = @(Get-Content $pidFile -Raw | ConvertFrom-Json)
[array]::Reverse($processes)
foreach ($entry in $processes) {
    $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    # Do not stop an unrelated process if Windows reused a saved PID.
    if ($process.StartTime.ToUniversalTime().Ticks -ne ([datetime]$entry.startedAt).ToUniversalTime().Ticks) { Write-Warning "PID reused; skipped $($entry.pid)"; continue }
    if ($entry.name -eq 'postgres') {
        $pgCtl = Join-Path $projectRoot 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'
        & $pgCtl -D (Join-Path $projectRoot 'data/postgres') -m fast -w stop
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL shutdown failed; process file preserved.' }
    }
    if (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue) {
        # Include the Python venv launcher child and Next.js worker processes.
        & taskkill.exe /PID $entry.pid /T /F | Out-Null
    }
}
Remove-Item -LiteralPath $pidFile
Write-Host 'LeadFactory stopped. Database files retained in data/postgres.'
