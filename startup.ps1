param([string]$Target,[string]$Destination)
$ErrorActionPreference='Stop'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($Destination)
$shortcut.TargetPath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$Target+'" -NoWindow'
$shortcut.WorkingDirectory=Split-Path -Parent $Target
$shortcut.WindowStyle=7
$shortcut.Description='Shiguang local assistant'
$shortcut.Save()
