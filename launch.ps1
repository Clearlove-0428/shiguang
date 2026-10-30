param([switch]$NoWindow)
$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$sourcePort = if ($env:SHIGUANG_PORT) { [int]$env:SHIGUANG_PORT } else { 43527 }
if ($sourcePort -lt 1 -or $sourcePort -gt 65535) { throw 'Invalid source service port' }
$env:SHIGUANG_PORT = [string]$sourcePort
if (-not $env:SHIGUANG_DATA) { $env:SHIGUANG_DATA = Join-Path $sourceRoot '.local/data' }
if (-not $env:SHIGUANG_MOBILE_HOST) { $env:SHIGUANG_MOBILE_HOST = '127.0.0.1' }
[void][IO.Directory]::CreateDirectory($env:SHIGUANG_DATA)
. (Join-Path $sourceRoot 'startup-check.ps1')
$mutexName = 'Local\Shiguang-Source-Launch-' + $sourcePort
$sourceMutex = [Threading.Mutex]::new($false, $mutexName)
$ownsMutex = $false
try {
    try { $ownsMutex = $sourceMutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw 'Another source launch is still in progress.' }
    if (-not (Test-ShiguangService -Root $sourceRoot -Port $sourcePort)) {
        if (Get-NetTCPConnection -State Listen -LocalPort $sourcePort -ErrorAction SilentlyContinue) { throw 'Port is occupied by another service; no process was stopped.' }
        $nodeCommand = Get-Command node.exe -ErrorAction Stop
        Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + (Join-Path $sourceRoot 'server.mjs') + '"') -WorkingDirectory $sourceRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:SHIGUANG_DATA 'server.log') -RedirectStandardError (Join-Path $env:SHIGUANG_DATA 'server-error.log') | Out-Null
        for ($attempt = 0; $attempt -lt 80; $attempt++) {
            Start-Sleep -Milliseconds 250
            if (Test-ShiguangService -Root $sourceRoot -Port $sourcePort) { break }
        }
        if (-not (Test-ShiguangService -Root $sourceRoot -Port $sourcePort)) { throw 'Source service failed to start. Check .local/data/server-error.log.' }
    }
} finally { if ($ownsMutex) { $sourceMutex.ReleaseMutex() }; $sourceMutex.Dispose() }
if (-not $NoWindow) {
    $nativePath = Join-Path $sourceRoot 'native/Shiguang.exe'
    if (Test-Path -LiteralPath $nativePath) { Start-Process -FilePath $nativePath -WindowStyle Normal }
    else { Start-Process ('http://127.0.0.1:' + $sourcePort) }
}