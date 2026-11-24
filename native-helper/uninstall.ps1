param(
  [string]$InstallDir = "$env:LOCALAPPDATA\FrameSizeHelper"
)

$ErrorActionPreference = "Stop"
$HostName = "dev.framesize.helper"

foreach ($regPath in @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)) {
  if (Test-Path $regPath) {
    Remove-Item -Path $regPath -Recurse -Force
    Write-Host "[OK] Removed registry key: $regPath" -ForegroundColor Yellow
  }
}

if (Test-Path $InstallDir) {
  Remove-Item -Path $InstallDir -Recurse -Force
  Write-Host "[OK] Removed install directory: $InstallDir" -ForegroundColor Yellow
}

Write-Host "FrameSize Helper uninstalled." -ForegroundColor Green
