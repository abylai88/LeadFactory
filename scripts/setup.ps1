$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
function Check-Exit([string]$step) { if ($LASTEXITCODE -ne 0) { throw "$step failed (exit $LASTEXITCODE)" } }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS first.' }
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw 'Node.js 22.12+ is required; Node.js 24 LTS recommended.' }
if (-not (Test-Path .venv/Scripts/python.exe)) {
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3.12 -m venv .venv }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { python -m venv .venv }
    else { throw 'Install Python 3.12 from python.org, including the py launcher.' }
    Check-Exit 'Create Python environment'
}
& .venv/Scripts/python.exe -m pip install -r requirements-lock.txt
Check-Exit 'Install locked Python dependencies'
& .venv/Scripts/python.exe -m pip install --no-deps -e .
Check-Exit 'Install Python project'
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
npm ci --ignore-scripts
Check-Exit 'Install local PostgreSQL package'
if ($env:OS -eq 'Windows_NT') {
    node node_modules/@embedded-postgres/windows-x64/scripts/hydrate-symlinks.js
    Check-Exit 'Prepare PostgreSQL binaries'
}
Push-Location backend
try {
    npm ci --ignore-scripts
    Check-Exit 'Install backend'
    npx prisma generate
    Check-Exit 'Generate Prisma client'
    npm run build
    Check-Exit 'Build backend'
} finally { Pop-Location }
Push-Location frontend
try {
    npm ci --ignore-scripts
    Check-Exit 'Install frontend'
    npm run build
    Check-Exit 'Build frontend'
} finally { Pop-Location }
Write-Host 'Setup complete. Run: powershell -ExecutionPolicy Bypass -File scripts/start.ps1'
