param([string]$Payload)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
function New-ReminderForm([object]$Notice,[string]$Root){
 if(-not ('ShiguangReminderWindow' -as [type])){Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ShiguangReminderWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window,int command);
}
'@}
 $form=New-Object System.Windows.Forms.Form
 $form.Text='拾光 · 日程提醒';$form.TopMost=$true;$form.StartPosition='Manual';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.AutoScaleMode='Dpi'
 $form.ClientSize=New-Object System.Drawing.Size(520,340);$form.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',11);$form.BackColor=[Drawing.Color]::FromArgb(247,249,252)
 $area=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea;$form.Location=New-Object System.Drawing.Point(($area.Right-$form.Width-20),($area.Bottom-$form.Height-20))
 $iconPath=Join-Path $Root 'public/icon.ico';if(Test-Path -LiteralPath $iconPath){$form.Icon=New-Object Drawing.Icon($iconPath)}
 $accent=[Drawing.Color]::FromArgb(49,92,75);if($Notice.pack -eq 'lanxi'){$accent=[Drawing.Color]::FromArgb(9,86,193)}elseif($Notice.pack -eq 'folio'){$accent=[Drawing.Color]::FromArgb(128,84,55)}
 $brand=New-Object Windows.Forms.Label;$brand.Name='ReminderBrand';$brand.Text='拾光  /  日程提醒';$brand.Dock='Top';$brand.Height=48;$brand.Padding=New-Object Windows.Forms.Padding(22,12,22,8);$brand.BackColor=$accent;$brand.ForeColor=[Drawing.Color]::White
 $title=New-Object Windows.Forms.Label;$title.Name='ReminderTitle';$title.Text=[string]$Notice.title;$title.Location=New-Object Drawing.Point(22,64);$title.Size=New-Object Drawing.Size(476,52);$title.Font=New-Object Drawing.Font('Microsoft YaHei UI',15,[Drawing.FontStyle]::Bold);$title.ForeColor=[Drawing.Color]::FromArgb(28,40,54)
 $body=New-Object Windows.Forms.TextBox;$body.Name='ReminderBody';$body.Text=([string]$Notice.body).Replace("`n","`r`n");$body.Multiline=$true;$body.ReadOnly=$true;$body.BorderStyle='None';$body.ScrollBars='Vertical';$body.Location=New-Object Drawing.Point(22,124);$body.Size=New-Object Drawing.Size(476,138);$body.BackColor=$form.BackColor;$body.ForeColor=[Drawing.Color]::FromArgb(57,71,88)
 $hint=New-Object Windows.Forms.Label;$hint.Text='提醒已保留在提醒中心';$hint.Location=New-Object Drawing.Point(22,286);$hint.Size=New-Object Drawing.Size(210,36);$hint.Font=New-Object Drawing.Font('Microsoft YaHei UI',9);$hint.ForeColor=[Drawing.Color]::FromArgb(99,113,128)
 $close=New-Object Windows.Forms.Button;$close.Name='ReminderDismiss';$close.Text='知道了';$close.Location=New-Object Drawing.Point(274,280);$close.Size=New-Object Drawing.Size(98,42);$close.FlatStyle='Flat';$close.Add_Click({$form.Close()}.GetNewClosure())
 $open=New-Object Windows.Forms.Button;$open.Name='ReminderOpen';$open.Text='打开拾光';$open.Location=New-Object Drawing.Point(382,280);$open.Size=New-Object Drawing.Size(116,42);$open.FlatStyle='Flat';$open.BackColor=$accent;$open.ForeColor=[Drawing.Color]::White;$open.Add_Click({Start-Process -FilePath (Join-Path $Root 'native/Shiguang.exe') -WindowStyle Normal;$form.Close()}.GetNewClosure())
 $form.Controls.AddRange(@($brand,$title,$body,$hint,$close,$open));$form.AcceptButton=$open;$form.CancelButton=$close
 # The background process starts with SW_HIDE; explicitly show the reminder without taking focus.
 $form.Add_Shown({[void][ShiguangReminderWindow]::ShowWindowAsync($form.Handle,4)}.GetNewClosure())
 return $form
}
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
$icon=New-Object System.Windows.Forms.NotifyIcon
try{
 $iconPath=Join-Path $PSScriptRoot 'public/icon.ico';$icon.Icon=if(Test-Path -LiteralPath $iconPath){New-Object Drawing.Icon($iconPath)}else{[Drawing.SystemIcons]::Information};$icon.Visible=$true;$icon.Text='拾光'
 $icon.BalloonTipTitle=([string]$data.title).Substring(0,[Math]::Min(60,([string]$data.title).Length));$icon.BalloonTipText=([string]$data.body).Substring(0,[Math]::Min(240,([string]$data.body).Length))
 $player=$null;if($data.sound -ne $false){if($data.soundFile -and (Test-Path -LiteralPath $data.soundFile)){$player=New-Object System.Media.SoundPlayer([string]$data.soundFile);$player.Play()}else{[System.Media.SystemSounds]::Asterisk.Play()}}
 $icon.ShowBalloonTip(8000)
 if($data.popup -ne $false){$form=New-ReminderForm $data $PSScriptRoot;$timer=New-Object Windows.Forms.Timer;$timer.Interval=20000;$timer.Add_Tick({$form.Close()});$timer.Start();try{[void]$form.ShowDialog()}finally{$timer.Stop();$timer.Dispose();$form.Dispose()}}else{Start-Sleep -Seconds 8}
}finally{$icon.Dispose();if($player){$player.Dispose()}}
