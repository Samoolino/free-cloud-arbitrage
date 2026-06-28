$ErrorActionPreference = 'Stop'

$serviceName = 'FreeCloudArbitrageWorker'
$scriptPath = Join-Path $PSScriptRoot 'worker.py'
$pythonExe = (Get-Command py -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)

if (-not $pythonExe) {
    throw 'Python launcher (py) was not found on PATH.'
}

$serviceCommand = "\"$pythonExe\" -3 \"$scriptPath\""
$serviceDescription = 'Runs the Free Cloud Arbitrage CCXT worker as a Windows service.'

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
}

$serviceBinary = 'C:\Windows\System32\sc.exe'
$serviceArgs = @('create', $serviceName, 'binPath=', "\"$serviceBinary\" start $serviceName")

# Use NSSM if available; fallback to sc.exe-based service wrapper.
$nssmPath = Get-Command nssm -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if ($nssmPath) {
    & $nssmPath install $serviceName $pythonExe -3 $scriptPath
    & $nssmPath set $serviceName AppDirectory $PSScriptRoot
    & $nssmPath set $serviceName AppExit Default Exit
    & $nssmPath set $serviceName Start SERVICE_DELAYED_AUTO_START
    & $nssmPath set $serviceName Description $serviceDescription
    Start-Service -Name $serviceName
    Write-Host "Installed service using NSSM: $serviceName"
    return
}

Write-Host 'NSSM not found. Install NSSM to manage the service more reliably.'
Write-Host 'You can also run the worker manually with:'
Write-Host "  $serviceCommand"
