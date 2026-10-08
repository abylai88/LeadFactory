param([switch]$ExternalDatabase)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
if (-not (Test-Path backend/dist/main.js) -or -not (Test-Path frontend/.next/BUILD_ID)) { throw 'Run scripts/setup.ps1 first.' }
foreach ($port in @(3000,3001,8000)) {
    $probe = [System.Net.Sockets.TcpClient]::new()
    try { $probe.Connect('127.0.0.1',$port); $occupied = $true } catch { $occupied = $false } finally { $probe.Dispose() }
    if ($occupied) { throw "Port $port is occupied. Stop the previous instance first." }
}
New-Item -ItemType Directory -Force .runtime | Out-Null
$pidFile = Join-Path $projectRoot '.runtime/processes.json'
if (Test-Path $pidFile) { throw 'Managed process file already exists. Run scripts/stop.ps1 first.' }
$started = [System.Collections.Generic.List[object]]::new()
function Start-ServiceProcess([string]$name, [string]$file, [string[]]$arguments, [string]$workingDirectory) {
    $process = Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot ".runtime/$name.out.log") -RedirectStandardError (Join-Path $projectRoot ".runtime/$name.err.log")
    $started.Add(@{name=$name; pid=$process.Id; startedAt=$process.StartTime.ToUniversalTime().ToString('o')})
    ConvertTo-Json -InputObject @($started.ToArray()) | Set-Content $pidFile -Encoding UTF8
}
function Wait-Url([string]$url) {
    for ($i=0; $i -lt 45; $i++) {
        try { $null = Invoke-RestMethod $url -TimeoutSec 2; return } catch { Start-Sleep -Seconds 1 }
    }
    throw "Service did not become ready: $url. See .runtime logs."
}
try {
    $node = (Get-Command node).Source
    if (-not $ExternalDatabase) {
        $listener = [System.Net.Sockets.TcpClient]::new()
        try { $listener.Connect('127.0.0.1',5432); $occupied = $true } catch { $occupied = $false } finally { $listener.Dispose() }
        if ($occupied) { throw 'Port 5432 is occupied. Use -ExternalDatabase only if backend/.env targets that database.' }
        Start-ServiceProcess 'postgres' $node @('scripts/local-postgres.mjs') $projectRoot
        $ready = $false
        for ($i=0; $i -lt 45; $i++) {
            if (Test-Path .runtime/postgres.out.log) {
                if (Select-String -Path .runtime/postgres.out.log -Pattern 'LeadFactory PostgreSQL ready' -Quiet) { $ready = $true; break }
            }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw 'PostgreSQL startup failed. See .runtime/postgres logs.' }
    }
    Push-Location backend
    try { npx prisma migrate deploy; if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' } } finally { Pop-Location }
    Start-ServiceProcess 'crawler' (Join-Path $projectRoot '.venv/Scripts/python.exe') @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000','--workers','1') $projectRoot
    Wait-Url 'http://127.0.0.1:8000/health'
    Start-ServiceProcess 'backend' $node @('dist/main.js') (Join-Path $projectRoot 'backend')
    Wait-Url 'http://127.0.0.1:3001/api/health'
    Start-ServiceProcess 'frontend' $node @('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1') (Join-Path $projectRoot 'frontend')
    Wait-Url 'http://127.0.0.1:3000'
    Write-Host 'LeadFactory ready: http://localhost:3000'
    Write-Host 'Stop: powershell -ExecutionPolicy Bypass -File scripts/stop.ps1'
} catch {
    Write-Warning $_
    if (Test-Path $pidFile) { & (Join-Path $PSScriptRoot 'stop.ps1') }
    throw
}

