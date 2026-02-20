param(
  [string]$InfName
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $scriptDir "install-virtual-audio-driver.last.log"

Set-Content -Path $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] installer started"

function Write-InstallLog {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $logPath -Value $line
  Write-Output $Message
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  $relaunchArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath
  )

  if ($InfName -and $InfName.Trim().Length -gt 0) {
    $relaunchArgs += @('-InfName', $InfName)
  }

  Write-InstallLog "Relaunching installer with elevation (UAC)."
  $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $relaunchArgs -PassThru -Wait
  Write-InstallLog "Elevated process exit code: $($elevated.ExitCode)"
  exit $elevated.ExitCode
}

$infFiles = Get-ChildItem -Path $scriptDir -Filter *.inf -File -ErrorAction SilentlyContinue | Sort-Object Name
$setupFiles = Get-ChildItem -Path $scriptDir -Filter *.exe -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '(?i)(setup|install|voicemeeter|vbcable)'
  } |
  Sort-Object Name

$selectedName = if ($InfName) { $InfName.Trim() } else { '' }
$targetInf = $null
$targetSetup = $null

if ($selectedName.Length -gt 0) {
  $targetInf = $infFiles | Where-Object { $_.Name -ieq $selectedName } | Select-Object -First 1
  if (-not $targetInf) {
    $targetSetup = $setupFiles | Where-Object { $_.Name -ieq $selectedName } | Select-Object -First 1
  }

  if (-not $targetInf -and -not $targetSetup) {
    $available = @($infFiles + $setupFiles | ForEach-Object { $_.Name }) -join ', '
    throw "Installer target not found: $selectedName. Available: $available"
  }
}
else {
  if ($setupFiles.Count -eq 1 -and $infFiles.Count -eq 0) {
    $targetSetup = $setupFiles[0]
  } elseif ($infFiles.Count -eq 1 -and $setupFiles.Count -eq 0) {
    $targetInf = $infFiles[0]
  } else {
    $available = @($infFiles + $setupFiles | ForEach-Object { $_.Name }) -join ', '
    throw "Multiple installer targets found. Specify one with -InfName. Available: $available"
  }
}

if ($targetSetup) {
  Write-InstallLog "Using setup package: $($targetSetup.Name)"
  $setupProcess = Start-Process -FilePath $targetSetup.FullName -PassThru -Wait
  if ($setupProcess.ExitCode -ne 0) {
    throw "Setup package failed. exit code: $($setupProcess.ExitCode)`nLog: $logPath"
  }
  Write-InstallLog "Setup package finished. Reboot is recommended before device detection."
  Write-InstallLog "Virtual audio driver install command finished."
  return
}

$infPath = $targetInf.FullName
Write-InstallLog "Using driver INF: $($targetInf.Name)"

$isVbCableInf = $targetInf.Name.ToLower().StartsWith('vbmmecable')
$setupExe = if ([Environment]::Is64BitOperatingSystem) {
  Join-Path $scriptDir 'VBCABLE_Setup_x64.exe'
} else {
  Join-Path $scriptDir 'VBCABLE_Setup.exe'
}

if ($isVbCableInf -and (Test-Path $setupExe)) {
  Write-InstallLog "VB-CABLE package detected, launching official setup: $setupExe"
  $setupProcess = Start-Process -FilePath $setupExe -PassThru -Wait

  if ($setupProcess.ExitCode -ne 0) {
    throw "VB-CABLE setup failed. exit code: $($setupProcess.ExitCode)`nLog: $logPath"
  }

  Write-InstallLog "VB-CABLE setup finished. Reboot is recommended before device detection."
  Write-InstallLog "Virtual audio driver install command finished."
  return
}

$pnpOutput = (& pnputil.exe /add-driver $infPath /install 2>&1 | Out-String).Trim()
$pnpExitCode = $LASTEXITCODE

if ($pnpOutput) {
  Add-Content -Path $logPath -Value $pnpOutput
}

if ($pnpExitCode -ne 0) {
  if ($pnpOutput) {
    throw "Driver install failed. pnputil exit code: $pnpExitCode`n$pnpOutput`nLog: $logPath"
  }
  throw "Driver install failed. pnputil exit code: $pnpExitCode`nLog: $logPath"
}

if ($pnpOutput) {
  Write-InstallLog $pnpOutput
}

Write-InstallLog "Virtual audio driver install command finished."