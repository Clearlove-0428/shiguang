$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$paths=@()
foreach($key in @('HKCU:\Software\Tencent\WeChat','HKCU:\Software\Tencent\QQ','HKCU:\Software\Tencent\QQNT')){
 $entry=Get-ItemProperty -LiteralPath $key
 foreach($name in @('FileSavePath','DataPath','SavePath','UserDataPath')){
  if($entry.$name -is [string]){$paths+=$entry.$name}
 }
}
@{documents=[Environment]::GetFolderPath('MyDocuments');drives=@([IO.DriveInfo]::GetDrives()|Where-Object {$_.DriveType -eq 'Fixed' -and $_.IsReady}|ForEach-Object {$_.RootDirectory.FullName});paths=$paths}|ConvertTo-Json -Compress
