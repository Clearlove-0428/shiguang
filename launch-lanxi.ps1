param([switch]$NoWindow)
$ErrorActionPreference = 'Stop'
if (-not $env:SHIGUANG_PORT) { $env:SHIGUANG_PORT = '43527' }
$env:LANXI_PORT = $env:SHIGUANG_PORT
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'launch.ps1') -NoWindow
if ($LASTEXITCODE -ne 0) { throw 'Shared source service failed to start.' }
if (-not $NoWindow) {
    $nativePath = Join-Path $PSScriptRoot 'native/Lanxi.exe'
    if (Test-Path -LiteralPath $nativePath) { Start-Process -FilePath $nativePath -WindowStyle Normal }
    else { Start-Process ('http://127.0.0.1:' + $env:SHIGUANG_PORT) }
}