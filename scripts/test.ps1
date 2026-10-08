$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& .venv/Scripts/python.exe -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'Python tests failed' }
Push-Location backend
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
    npm test -- --runInBand
    if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed' }
    npm run test:e2e -- --runInBand
    if ($LASTEXITCODE -ne 0) { throw 'Database integration tests failed' }
} finally { Pop-Location }
Push-Location frontend
try { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' } } finally { Pop-Location }
