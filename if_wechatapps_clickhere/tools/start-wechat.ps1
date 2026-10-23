param([switch]$SkipPreview)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$projectCli = $project.Replace([char]92, [char]47)
$configPath = Join-Path $project 'project.config.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Find-DevtoolCli {
  $paths = @($env:WECHAT_DEVTOOLS_CLI)
  foreach ($path in $paths) { if ($path -and (Test-Path -LiteralPath $path)) { return $path } }
  $links = Get-ChildItem (Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs') -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue
  foreach ($link in $links) {
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($link.FullName)
    if (-not $shortcut.TargetPath) { continue }
    $candidate = Join-Path (Split-Path $shortcut.TargetPath -Parent) 'cli.bat'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  foreach ($drive in @('D:/', 'C:/Program Files/', 'C:/Program Files (x86)/')) {
    foreach ($directory in Get-ChildItem -LiteralPath $drive -Directory -ErrorAction SilentlyContinue) {
      $candidate = Join-Path $directory.FullName 'cli.bat'
      if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
  }
  throw 'WeChat Developer Tools CLI was not found. Set WECHAT_DEVTOOLS_CLI to the full cli.bat path.'
}

try {
  $cli = Find-DevtoolCli
  Write-Host "[WeChat] Developer Tools CLI: $cli"
  if ($config.appid -eq 'touristappid') {
    Write-Host '[WeChat] No registered Mini Program AppID is configured.' -ForegroundColor Yellow
    Write-Host '[WeChat] Opening the project. Set your own AppID in project.config.json before requesting a phone preview QR.'
    Write-Host '[WeChat] A Mini Program test AppID can be requested at https://mp.weixin.qq.com/wxamp/sandbox?doc=1'
    Write-Host '[WeChat] In the IDE, scan the login QR code with the WeChat account that manages that AppID.'
    $ErrorActionPreference = 'Continue'
    $openResult = & $cli open --project $projectCli --lang zh 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { $_.ToString() }
    } | Out-String
    $ErrorActionPreference = 'Stop'
    Write-Host $openResult
    if ($LASTEXITCODE -ne 0 -or $openResult -match '\[error\]' -or $openResult -notmatch 'open') {
      throw 'Developer Tools could not open the project.'
    }
    exit 0
  }
  if ($config.appid -notmatch '^wx[0-9a-fA-F]{16}$') {
    throw 'project.config.json must contain a valid Mini Program AppID (wx plus 16 hexadecimal characters).'
  }
  $qrPath = Join-Path $project 'preview-qr.png'
  $infoPath = Join-Path $project 'preview-info.json'
  if (Test-Path -LiteralPath $qrPath) { Remove-Item -LiteralPath $qrPath -Force }
  if (Test-Path -LiteralPath $infoPath) { Remove-Item -LiteralPath $infoPath -Force }
  Write-Host "[WeChat] Opening project: $project"
  $ErrorActionPreference = 'Continue'
  $openResult = & $cli open --project $projectCli --lang zh 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { $_.ToString() }
  } | Out-String
  $ErrorActionPreference = 'Stop'
  Write-Host $openResult
  if ($LASTEXITCODE -ne 0 -or $openResult -match '\[error\]' -or $openResult -notmatch 'open') {
    throw 'Developer Tools could not open the project.'
  }
  if ($SkipPreview) { exit 0 }
  $ErrorActionPreference = 'Continue'
  $loginResult = & $cli islogin --lang zh 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { $_.ToString() }
  } | Out-String
  $ErrorActionPreference = 'Stop'
  if ($loginResult -match '"login":false') {
    Write-Host '[WeChat] Developer Tools is signed out. Scan its login QR code in the open IDE, then run this launcher again.' -ForegroundColor Yellow
    exit 1
  }
  if ($loginResult -notmatch '"login":true') { throw 'Could not confirm Developer Tools login status.' }
  Write-Host '[WeChat] Requesting a phone preview QR code...'
  $ErrorActionPreference = 'Continue'
  & $cli preview --project $projectCli --qr-format image --qr-output $qrPath --info-output $infoPath --lang zh
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $qrPath)) {
    Write-Host '[WeChat] Preview failed. Check that Developer Tools is logged in and the AppID belongs to this account.' -ForegroundColor Yellow
    Write-Host '[WeChat] You can still click Preview in Developer Tools after logging in.'
    exit 1
  }
  Write-Host "[WeChat] QR code: $qrPath" -ForegroundColor Green
  Start-Process -FilePath $qrPath
} catch {
  [Console]::Error.WriteLine('[WeChat] ' + $_.Exception.Message)
  exit 1
}
