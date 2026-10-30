function Test-ShiguangService {
 param([string]$Root,[int]$Port=43527)
 try {
  $url='http://127.0.0.1:'+$Port
  $r=Invoke-RestMethod -Uri ($url+'/api/health') -TimeoutSec 2
  if($r.app -ne 'shiguang-local' -or $r.apiVersion -ne 1 -or -not $r.root){return $false}
  $expected=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $actual=[IO.Path]::GetFullPath([string]$r.root).TrimEnd('\','/')
  if(-not [string]::Equals($actual,$expected,[StringComparison]::OrdinalIgnoreCase)){return $false}
  $windows=Invoke-RestMethod -Uri ($url+'/api/windows') -TimeoutSec 2
  return ($null -ne $windows.count -and $windows.count -ge 0)
 } catch { return $false }
}
