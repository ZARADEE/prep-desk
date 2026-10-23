param(
  [string]$ProjectRoot = (Join-Path $PSScriptRoot '..'),
  [switch]$StartFrontend,
  [switch]$HealthCheckOnly
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'environment-common.ps1')
$backend=$null
$ownsBackend=$false

function Get-LanIPv4 {
  try {
    $configs=@(Get-NetIPConfiguration -ErrorAction Stop | Where-Object { $_.IPv4Address })
    foreach($config in @($configs | Where-Object { $_.IPv4DefaultGateway }) + $configs){
      foreach($address in $config.IPv4Address){
        $ip=$address.IPAddress
        if($ip -and $ip -notlike '127.*' -and $ip -notlike '169.254.*'){ return $ip }
      }
    }
  } catch { Write-Host '[paper-helper] LAN address unavailable; using localhost.' }
  return '127.0.0.1'
}
function Get-ListeningProcessId([int]$PortNumber){
  try {
    $connection=Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if($connection){ return [int]$connection.OwningProcess }
  } catch {}
  return $null
}
function Test-BackendHealth([int]$PortNumber){
  try {
    $response=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$PortNumber+'/api/health') -TimeoutSec 2
    return ($response.ok -eq $true -and $response.service -eq 'paper-helper')
  } catch { return $false }
}
function Test-FrontendHealth([int]$PortNumber){
  try {
    $response=Invoke-WebRequest -Uri ('http://127.0.0.1:'+$PortNumber+'/') -UseBasicParsing -TimeoutSec 2
    return ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500)
  } catch { return $false }
}
function Format-PortOwner([int]$PortNumber, $ProcessId){
  if($ProcessId){
    $process=Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if($process){ return "Port $PortNumber is already in use by $($process.ProcessName) (PID $ProcessId)." }
    return "Port $PortNumber is already in use by PID $ProcessId."
  }
  return "Port $PortNumber is already in use."
}
try {
  $ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
  $python=Join-Path $ProjectRoot '.venv\Scripts\python.exe'
  $frontend=Join-Path $ProjectRoot 'frontend'
  $backendHost=if($env:PAPER_HELPER_API_HOST){$env:PAPER_HELPER_API_HOST}else{'0.0.0.0'}
  $port=if($env:PAPER_HELPER_API_PORT){$env:PAPER_HELPER_API_PORT}else{'8000'}
  $frontendPort=if($env:PAPER_HELPER_FRONTEND_PORT){$env:PAPER_HELPER_FRONTEND_PORT}else{'5173'}
  foreach($value in @($port,$frontendPort)){
    if($value -notmatch '^\d+$' -or [long]$value -lt 1 -or [long]$value -gt 65535){throw "Invalid port: $value"}
  }
  if($backendHost -notin @('0.0.0.0','127.0.0.1','localhost')){throw 'PAPER_HELPER_API_HOST must be 0.0.0.0, 127.0.0.1 or localhost.'}
  if(-not (Test-Path -LiteralPath $python)){throw 'Python environment missing. Run setup.bat first.'}
  Invoke-CheckedNative $python @('-B',(Join-Path $PSScriptRoot 'verify-backend.py'),$ProjectRoot) 'Checking backend dependencies'
  $backendProcessId=Get-ListeningProcessId ([int]$port)
  $backendReady=$false
  if($backendProcessId){
    $backendReady=Test-BackendHealth ([int]$port)
    if(-not $backendReady){throw ((Format-PortOwner ([int]$port) $backendProcessId)+' The existing service did not pass /api/health.')}
    Write-Host ('[paper-helper] Reusing the healthy backend already running on port '+$port+'.')
  }
  $frontendProcessId=$null
  $frontendReady=$false
  if($StartFrontend){
    $tools=Find-ProjectNode
    if(-not $tools -or -not (Test-FrontendEnvironment $tools.Node $frontend)){throw 'Frontend dependencies are incomplete. Run setup.bat first.'}
    $frontendProcessId=Get-ListeningProcessId ([int]$frontendPort)
    if($frontendProcessId){
      $frontendReady=Test-FrontendHealth ([int]$frontendPort)
      if(-not $frontendReady){throw ((Format-PortOwner ([int]$frontendPort) $frontendProcessId)+' The existing process did not return a usable frontend page.')}
      Write-Host ('[paper-helper] Reusing the healthy frontend already running on port '+$frontendPort+'.')
    }
    if($backendReady -and $frontendReady){
      Write-Host '[paper-helper] Paper Helper is already running; no second instance was started.'
      return
    }
    if($frontendReady -and -not $backendReady){
      throw 'A frontend is already running but the backend is unavailable. Close the existing Paper Helper window and try again.'
    }
  }
  $mobileHost=Get-LanIPv4
  $mobileUrl='http://'+$mobileHost+':'+$frontendPort
  $env:PAPER_HELPER_MOBILE_HOST=$mobileHost
  $env:PAPER_HELPER_MOBILE_URL=$mobileUrl
  $env:PYTHONUNBUFFERED='1'
  $env:PYTHONUTF8='1'
  $logDir=Join-Path $ProjectRoot 'logs'
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $runId=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6)
  $outLog=Join-Path $logDir "backend-$runId.out.log"
  $errLog=Join-Path $logDir "backend-$runId.err.log"
  if(-not $backendReady){
    Write-Host ('[paper-helper] Starting FastAPI on http://127.0.0.1:'+$port)
    Write-Host "[paper-helper] Backend logs: $outLog / $errLog"
    $backend=Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:app','--host',$backendHost,'--port',$port) -WorkingDirectory (Join-Path $ProjectRoot 'backend') -PassThru -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $ownsBackend=$true
    $healthy=$false
    $deadline=(Get-Date).AddSeconds(90)
    while((Get-Date) -lt $deadline){
      $backend.Refresh()
      if($backend.HasExited){throw "FastAPI exited before becoming ready. See $errLog"}
      if(Test-BackendHealth ([int]$port)){$healthy=$true;break}
      Start-Sleep -Milliseconds 500
    }
    if(-not $healthy){throw "FastAPI health check timed out. See $errLog"}
    Write-Host '[paper-helper] Backend health check passed.'
  }
  if($HealthCheckOnly){
    if($ownsBackend){Write-Host '[paper-helper] Health-check-only mode completed; stopping the test backend.'}
    else{Write-Host '[paper-helper] Health-check-only mode completed; the existing backend was left running.'}
  }
  elseif($StartFrontend){
    Write-Host "[paper-helper] Mobile access URL: $mobileUrl"
    Write-Host '[paper-helper] Starting Electron renderer...'
    Push-Location -LiteralPath $frontend
    try{Invoke-CheckedNative $tools.Npm @('run','dev','--','--noSandbox') 'Electron development process'}finally{Pop-Location}
  }else{
    $waitId=if($backend){$backend.Id}else{$backendProcessId}
    if($waitId){Wait-Process -Id $waitId}
  }
}catch{
  [Console]::Error.WriteLine('[paper-helper] '+$_.Exception.Message)
  exit 1
}finally{
  if($ownsBackend -and $backend){$backend.Refresh();if(-not $backend.HasExited){Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue}}
}
exit 0
