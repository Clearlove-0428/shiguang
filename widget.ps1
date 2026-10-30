param([int]$Port=43527,[ValidateSet('edge','pinned')][string]$Mode='edge',[ValidateSet('left','right')][string]$Side='right')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$url='http://127.0.0.1:'+ $Port
$form=New-Object System.Windows.Forms.Form
$form.Text='拾光 · 桌面速览'
$form.FormBorderStyle='None';$form.ShowInTaskbar=$false;$form.StartPosition='Manual'
$form.BackColor=[System.Drawing.ColorTranslator]::FromHtml('#202c35')
$form.ForeColor=[System.Drawing.Color]::White
$form.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',10)
$form.TopMost=($Mode -eq 'edge')
$area=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$wide=[Math]::Min(380,$area.Width);$height=[Math]::Min(550,$area.Height-40)
$form.Size=New-Object System.Drawing.Size($wide,$height)
$script:expanded=$true;$script:outside=0;$script:lastRead=[datetime]::MinValue;$script:failures=0
$panel=New-Object System.Windows.Forms.Panel;$panel.Dock='Fill';$panel.Padding=New-Object System.Windows.Forms.Padding(18);$form.Controls.Add($panel)
$title=New-Object System.Windows.Forms.Label;$title.Text='拾光 · 桌面速览';$title.Location=New-Object System.Drawing.Point(18,18);$title.AutoSize=$true;$panel.Controls.Add($title)
$clock=New-Object System.Windows.Forms.Label;$clock.Location=New-Object System.Drawing.Point(18,52);$clock.Size=New-Object System.Drawing.Size(340,28);$clock.ForeColor=[System.Drawing.Color]::LightSteelBlue;$panel.Controls.Add($clock)
$list=New-Object System.Windows.Forms.ListBox;$list.Location=New-Object System.Drawing.Point(18,88);$list.Size=New-Object System.Drawing.Size(($wide-36),($height-154));$list.BackColor=$form.BackColor;$list.ForeColor=$form.ForeColor;$list.BorderStyle='None';$list.HorizontalScrollbar=$true;$list.ItemHeight=36;$panel.Controls.Add($list)
$open=New-Object System.Windows.Forms.Button;$open.Text='打开主页面';$open.Location=New-Object System.Drawing.Point(18,($height-52));$open.Size=New-Object System.Drawing.Size(145,34);$open.FlatStyle='Flat';$panel.Controls.Add($open)
$close=New-Object System.Windows.Forms.Button;$close.Text='关闭速览';$close.Location=New-Object System.Drawing.Point(($wide-150),($height-52));$close.Size=New-Object System.Drawing.Size(130,34);$close.FlatStyle='Flat';$panel.Controls.Add($close)
$launch={ $edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe';if(Test-Path -LiteralPath $edge){Start-Process -FilePath $edge -ArgumentList @('--app='+$url) -WindowStyle Normal}else{Start-Process $url} }
$open.Add_Click($launch);$list.Add_DoubleClick($launch)
$close.Add_Click({try{Invoke-RestMethod -Uri ($url+'/api/settings') -Method Post -ContentType 'application/json' -Headers @{'X-Shiguang'='1'} -Body '{"widgetMode":"off"}' -TimeoutSec 2|Out-Null}catch{};$form.Close()})
function Place-Widget([bool]$expanded){$script:expanded=$expanded;$width=if($expanded){$wide}else{9};$panel.Visible=$expanded;$form.Width=$width;$x=if($Side -eq 'left'){$area.Left}else{$area.Right-$width};$form.Location=New-Object System.Drawing.Point($x,($area.Top+20));$form.BackColor=if($expanded){[System.Drawing.ColorTranslator]::FromHtml('#202c35')}else{[System.Drawing.ColorTranslator]::FromHtml('#71b9b0')}}
Place-Widget ($Mode -eq 'pinned')
$timer=New-Object System.Windows.Forms.Timer;$timer.Interval=100
$timer.Add_Tick({
 $clock.Text=(Get-Date -Format 'MM月dd日 dddd HH:mm:ss')
 if($Mode -eq 'edge'){if($form.Bounds.Contains([System.Windows.Forms.Cursor]::Position)){$script:outside=0;if(-not $script:expanded){Place-Widget $true}}elseif($script:expanded){$script:outside++;if($script:outside -gt 12){Place-Widget $false}}}
 if(((Get-Date)-$script:lastRead).TotalSeconds -ge 10){$script:lastRead=Get-Date;try{$data=Invoke-RestMethod -Uri ($url+'/api/desktop') -TimeoutSec 2;$script:failures=0;if($data.mode -eq 'off'){$form.Close();return};$list.BeginUpdate();$list.Items.Clear();foreach($item in $data.events){$prefix=if($item.focus){'★ '}else{''};$list.Items.Add($prefix+$item.date+' '+$item.time+'  '+$item.title)|Out-Null};if($data.events.Count -eq 0){$list.Items.Add('今天起暂无未完成事项')|Out-Null};$list.EndUpdate()}catch{$script:failures++;if($script:failures -ge 3){$form.Close()}}}
})
$form.Add_FormClosed({$timer.Stop();$timer.Dispose()})
$timer.Start();[System.Windows.Forms.Application]::Run($form)
