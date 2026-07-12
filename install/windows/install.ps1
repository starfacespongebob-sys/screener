# Install Remote Support Agent on Windows (one-time consent, scheduled task at logon)
# Run as Administrator in PowerShell:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\install.ps1 -Server "wss://remotesharing.space"

param(
    [string]$Server = "wss://remotesharing.space"
)

$ErrorActionPreference = "Stop"
$InstallDir = "$env:ProgramFiles\RemoteSupport"
$AgentProject = Join-Path $PSScriptRoot "..\..\agent\RemoteSupport.Agent"

Write-Host "==> Building agent..."
Push-Location $AgentProject
dotnet publish -c Release -r win-x64 --self-contained false -o $InstallDir
Pop-Location

$AgentExe = Join-Path $InstallDir "RemoteSupport.Agent.exe"

Write-Host "==> One-time consent (interactive)..."
Write-Host "    Type 'y' when prompted to grant access for your tech team."
& $AgentExe --grant-consent --server $Server
if ($LASTEXITCODE -ne 0) {
    Write-Error "Consent was not granted. Install aborted."
}

Write-Host "==> Creating scheduled task (runs at user logon)..."
$action = New-ScheduledTaskAction -Execute $AgentExe -Argument "--daemon --server $Server"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "RemoteSupportAgent" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "RemoteSupportAgent"

Write-Host ""
Write-Host "Installed to $InstallDir"
Write-Host "Revoke consent: $AgentExe --revoke-consent"
Write-Host "Uninstall task:  Unregister-ScheduledTask -TaskName RemoteSupportAgent -Confirm:`$false"