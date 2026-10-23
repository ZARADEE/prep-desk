param([string]$ProjectRoot = (Join-Path $PSScriptRoot '..'))

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'environment-common.ps1')
$backend = $null
$ownsBackend = $false
$savedEnvironment = @{}

function Get-PrivateLanIPv4 {
  $configs = @(Get-NetIPConfiguration -ErrorAction Stop | Where-Object { $_.IPv4Address })
  $ordered = @($configs | Where-Object { $_.IPv4DefaultGateway }) + @($configs | Where-Object { -not $_.IPv4DefaultGateway })
  foreach ($config in $ordered) {
    foreach ($address in $config.IPv4Address) {
      $ip = [string]$address.IPAddress
      if ($ip -match '^10\.' -or $ip -match '^192\.168\.' -or $ip -match '^172\.(1[6-9]|2[0-9]|3[01])\.') {
        return $ip
      }
    }
  }
  throw 'No private LAN IPv4 address was found. Connect the computer to the same Wi-Fi as the phone and try again.'
}

function Get-ListeningProcessId([int]$PortNumber) {
  try {
    $connection = Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
  } catch {}
  return $null
}

function Test-MobileService([int]$PortNumber) {
  try {
    $response = Invoke-RestMethod -Uri ('http://127.0.0.1:{0}/api/health' -f $PortNumber) -TimeoutSec 2
    return ($response.ok -eq $true -and $response.service -eq 'paper-helper')
  } catch { return $false }
}

try {
  $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
  $python = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
  $frontend = Join-Path $ProjectRoot 'frontend'
  $webRoot = Join-Path $frontend 'out\web'
  $port = if ($env:PAPER_HELPER_MOBILE_PORT) { $env:PAPER_HELPER_MOBILE_PORT } else { '8765' }
  if ($port -notmatch '^\d+$' -or [long]$port -lt 1 -or [long]$port -gt 65535) { throw 'PAPER_HELPER_MOBILE_PORT must be a port from 1 to 65535.' }
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw 'Python environment missing. Run setup.bat first.' }

  Invoke-CheckedNative $python @('-B', (Join-Path $PSScriptRoot 'verify-backend.py'), $ProjectRoot) 'Checking backend dependencies'
  $tools = Find-ProjectNode
  if (-not $tools -or -not (Test-FrontendEnvironment $tools.Node $frontend)) { throw 'Frontend dependencies are incomplete. Run setup.bat first.' }

  Push-Location -LiteralPath $frontend
  try { Invoke-CheckedNative $tools.Npm @('run', 'build:web') 'Building the phone web app' }
  finally { Pop-Location }

  $portOwner = Get-ListeningProcessId ([int]$port)
  if ($portOwner) {
    $owner = Get-Process -Id $portOwner -ErrorAction SilentlyContinue
    $name = if ($owner) { $owner.ProcessName } else { 'another process' }
    throw "Mobile port $port is already in use by $name (PID $portOwner). Close that service or set PAPER_HELPER_MOBILE_PORT to another port."
  }

  $lanIp = Get-PrivateLanIPv4
  $token = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $url = 'http://{0}:{1}/?access_token={2}' -f $lanIp, $port, $token
  $values = @{
    PAPER_HELPER_MOBILE_TOKEN = $token
    PAPER_HELPER_SYNC_TOKEN = $token
    PAPER_HELPER_WEB_ROOT = $webRoot
    PYTHONUNBUFFERED = '1'
    PYTHONUTF8 = '1'
  }
  foreach ($name in $values.Keys) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
  }

  $logDirectory = Join-Path $ProjectRoot 'logs'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6)
  $stdout = Join-Path $logDirectory "mobile-backend-$runId.out.log"
  $stderr = Join-Path $logDirectory "mobile-backend-$runId.err.log"
  $backend = Start-Process -FilePath $python `
    -ArgumentList @('-B', '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', [string]$port, '--no-access-log') `
    -WorkingDirectory (Join-Path $ProjectRoot 'backend') -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $ownsBackend = $true

  $deadline = (Get-Date).AddSeconds(90)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    $backend.Refresh()
    if ($backend.HasExited) { throw "Mobile service exited during startup. See $stderr" }
    if (Test-MobileService ([int]$port)) { $healthy = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $healthy) { throw "Mobile service startup timed out. See $stderr" }

  Write-Host ''
  Write-Host 'Paper Helper phone access' -ForegroundColor Cyan
  Write-Host 'Connect the phone and computer to the same Wi-Fi, then scan this QR code with a phone camera or QR scanner.' -ForegroundColor Yellow
  Write-Host 'The phone opens the mobile web app in its browser. No WeChat Developer Tools or AppID is required.'
  Write-Host 'Keep this window open while using the phone app; closing it stops the local service.' -ForegroundColor Yellow
  Write-Host ''
  & $tools.Node (Join-Path $PSScriptRoot 'print-mobile-qr.cjs') $url
  if ($LASTEXITCODE -ne 0) { throw 'Could not print the QR code in this terminal.' }
  Write-Host ''
  Write-Host ('Authorized browser URL: {0}' -f $url)
  Write-Host ('Backend logs: {0} / {1}' -f $stdout, $stderr)
  Write-Host 'Press Ctrl+C or close this window to stop the phone service.'
  while ($true) {
    $backend.Refresh()
    if ($backend.HasExited) { throw "Mobile service stopped. See $stderr" }
    Start-Sleep -Seconds 2
  }
} catch {
  [Console]::Error.WriteLine('[paper-helper mobile] ' + $_.Exception.Message)
  exit 1
} finally {
  if ($ownsBackend -and $backend) {
    $backend.Refresh()
    if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
  }
  foreach ($name in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
}
