param([int]$Port=43527,[int]$Owner)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$tray=New-Object Windows.Forms.NotifyIcon
$tray.Icon=New-Object Drawing.Icon((Join-Path $PSScriptRoot 'public/icon.ico'))
$tray.Text='拾光 · 日程提醒后台运行中'
$menu=New-Object Windows.Forms.ContextMenuStrip
$open=$menu.Items.Add('打开拾光');$open.Add_Click({Start-Process -FilePath (Join-Path $PSScriptRoot 'native/Shiguang.exe') -WindowStyle Normal})
$exit=$menu.Items.Add('退出拾光');$exit.Add_Click({try{Invoke-RestMethod -Uri ('http://127.0.0.1:'+$Port+'/api/shutdown') -Method Post -ContentType 'application/json' -Headers @{'X-Shiguang'='1'} -Body '{}' -TimeoutSec 2 | Out-Null}finally{[Windows.Forms.Application]::Exit()}})
$tray.ContextMenuStrip=$menu;$tray.Add_DoubleClick({Start-Process -FilePath (Join-Path $PSScriptRoot 'native/Shiguang.exe') -WindowStyle Normal})
$timer=New-Object Windows.Forms.Timer;$timer.Interval=2000;$timer.Add_Tick({if($Owner -and -not(Get-Process -Id $Owner -ErrorAction SilentlyContinue)){[Windows.Forms.Application]::Exit()}})
try{$tray.Visible=$true;$timer.Start();[Windows.Forms.Application]::Run()}finally{$timer.Stop();$timer.Dispose();$tray.Visible=$false;$tray.Dispose();$menu.Dispose()}
