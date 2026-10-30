$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$p=Get-Process Weixin -ErrorAction SilentlyContinue
if(-not $p){
 $exe=Join-Path $env:ProgramFiles 'Tencent/Weixin/Weixin.exe'
 if(-not (Test-Path -LiteralPath $exe)){throw 'WeChat client not found'}
 Start-Process -FilePath $exe -WindowStyle Normal
 Start-Sleep -Seconds 3
}
@{ok=$true;message='Using the existing WeChat login; complete phone confirmation in WeChat if requested.'}|ConvertTo-Json -Compress
