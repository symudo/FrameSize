param(
  [string[]]$ExtensionId = @(),
  [string]$InstallDir = "$env:LOCALAPPDATA\FrameSizeHelper"
)

$ErrorActionPreference = "Stop"

$HostName = "dev.framesize.helper"
$FirefoxExtId = "framesize@framesize.dev"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceExe = Join-Path $ScriptDir "framesize-helper.exe"

if (-not (Test-Path $SourceExe)) {
  throw "framesize-helper.exe not found next to install.ps1."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$TargetExe = Join-Path $InstallDir "framesize-helper.exe"
Copy-Item -Force $SourceExe $TargetExe

# 1. Register Firefox (fixed gecko extension ID)
$FirefoxManifestPath = Join-Path $InstallDir "$HostName.firefox.json"
$FirefoxManifest = [ordered]@{
  name               = $HostName
  description        = "FrameSize DevTools Window Pin & Roll-up Helper"
  path               = $TargetExe
  type               = "stdio"
  allowed_extensions = @($FirefoxExtId)
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($FirefoxManifestPath, $FirefoxManifest, (New-Object System.Text.UTF8Encoding($false)))

$FirefoxReg = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
New-Item -Path $FirefoxReg -Force | Out-Null
Set-ItemProperty -Path $FirefoxReg -Name "(default)" -Value $FirefoxManifestPath
Write-Host "[OK] Firefox Native Messaging Host registered." -ForegroundColor Green

# 2. Register Chrome & Edge (merge with existing allowed_origins so multiple browsers coexist)
$ChromiumManifestPath = Join-Path $InstallDir "$HostName.chromium.json"
$OriginSet = New-Object System.Collections.Generic.HashSet[string]

if (Test-Path $ChromiumManifestPath) {
  try {
    $existing = Get-Content -Raw -Path $ChromiumManifestPath | ConvertFrom-Json
    if ($existing.allowed_origins) {
      foreach ($orig in $existing.allowed_origins) {
        if ($orig) { [void]$OriginSet.Add([string]$orig) }
      }
    }
  } catch {
    # ignore malformed legacy manifest
  }
}

$NewIds = @()
foreach ($id in $ExtensionId) {
  foreach ($part in ($id -split ',')) {
    $trimmed = $part.Trim()
    if ($trimmed -match '^[a-p]{32}$') {
      $NewIds += $trimmed
      [void]$OriginSet.Add("chrome-extension://$trimmed/")
    } elseif ($trimmed) {
      Write-Warning "Ignored invalid Chromium extension ID: $trimmed"
    }
  }
}

if ($NewIds.Count -eq 0 -and $OriginSet.Count -eq 0) {
  Write-Host ""
  Write-Host "Tip: Open FrameSize Settings -> DevTools Helper to copy your Chrome/Edge Extension ID." -ForegroundColor Cyan
  $inputIds = Read-Host "Enter Chrome/Edge Extension ID(s), comma-separated (press Enter to skip for Firefox-only)"
  if ($inputIds) {
    foreach ($part in ($inputIds -split ',')) {
      $trimmed = $part.Trim()
      if ($trimmed -match '^[a-p]{32}$') {
        [void]$OriginSet.Add("chrome-extension://$trimmed/")
      } elseif ($trimmed) {
        Write-Warning "Ignored invalid Chromium extension ID: $trimmed"
      }
    }
  }
}

if ($OriginSet.Count -gt 0) {
  $Origins = @($OriginSet)
  $ChromiumManifest = [ordered]@{
    name            = $HostName
    description     = "FrameSize DevTools Window Pin & Roll-up Helper"
    path            = $TargetExe
    type            = "stdio"
    allowed_origins = $Origins
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($ChromiumManifestPath, $ChromiumManifest, (New-Object System.Text.UTF8Encoding($false)))

  foreach ($regPath in @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
  )) {
    New-Item -Path $regPath -Force | Out-Null
    Set-ItemProperty -Path $regPath -Name "(default)" -Value $ChromiumManifestPath
  }
  Write-Host "[OK] Chrome & Edge Native Messaging Host registered ($($Origins.Count) origin(s))." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! Installed at: $InstallDir" -ForegroundColor Cyan
Write-Host "You can now use Always-on-Top Pin and Title-Bar Roll-up in FrameSize." -ForegroundColor Cyan
