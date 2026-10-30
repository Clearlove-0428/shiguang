$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$apps=@()
foreach($w in $wins){
 try{
  $process=Get-Process -Id $w.Current.ProcessId -ErrorAction SilentlyContinue
  if($process.ProcessName -notin @('Weixin','WeChat','QQ')){continue}
  $elements=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
  $texts=0;$lists=0
  foreach($e in $elements){if($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text){$texts++};if($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::List){$lists++}}
  $apps+=@{app=$process.ProcessName;window=$w.Current.Name;elements=$elements.Count;texts=$texts;lists=$lists;offscreen=$w.Current.IsOffscreen}
 }catch{}
}
if($apps.Count -eq 0){$state='unavailable';$message='没有检测到微信或 QQ 窗口，请先打开客户端。'}
elseif(($apps | Where-Object {$_.texts -gt 3 -and $_.lists -gt 0}).Count -gt 0){$state='needs_adapter';$message='检测到可访问控件，尚需适配消息来源和完整性；自动采集未开启。'}
else{$state='unsupported';$message='当前客户端未暴露可读取的消息列表。自动监控未接通，请使用复制导入；最小化也可能影响检测。'}
@{state=$state;message=$message;apps=$apps;mode='只读检测，不切换聊天、不发送消息'} | ConvertTo-Json -Depth 5 -Compress
