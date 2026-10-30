param([string]$SdkDirectory)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Windows .NET Framework C# compiler is required.' }
if (-not $SdkDirectory) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $version = '1.0.3537.50'
    $vendorRoot = Join-Path $sourceRoot ('.local/vendor/webview2-' + $version)
    [void][IO.Directory]::CreateDirectory($vendorRoot)
    $packagePath = Join-Path $vendorRoot 'webview2.nupkg'
    $packageUrl = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/' + $version + '/microsoft.web.webview2.' + $version + '.nupkg'
    # Pinned from the official NuGet catalog for this exact SDK version.
    # https://api.nuget.org/v3/catalog0/data/2025.10.06.15.41.22/microsoft.web.webview2.1.0.3537.50.json
    $expectedHash = 'QWnduPtmvtQjH07KtLRQgyYa857P1/cyM8stgy052d53P6WoN4mngtL0bGhs+0DyivdYVirm0GOfaRSM7bcc6w=='
    if (-not (Test-Path -LiteralPath $packagePath)) { Invoke-WebRequest -UseBasicParsing -Uri $packageUrl -OutFile $packagePath }
    $stream = [IO.File]::OpenRead($packagePath)
    $hasher = [Security.Cryptography.SHA512]::Create()
    try { $actualHash = [Convert]::ToBase64String($hasher.ComputeHash($stream)) } finally { $stream.Dispose(); $hasher.Dispose() }
    if ($actualHash -ne $expectedHash) { throw 'WebView2 package SHA512 mismatch; SDK was not used.' }
    $SdkDirectory = Join-Path $vendorRoot 'sdk'
    if (-not (Test-Path -LiteralPath $SdkDirectory)) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($packagePath)
        try {
            foreach ($entry in $zip.Entries) {
                $resolvedEntry = [IO.Path]::GetFullPath((Join-Path $SdkDirectory $entry.FullName))
                if (-not $resolvedEntry.StartsWith($SdkDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe SDK archive entry' }
            }
        } finally { $zip.Dispose() }
        [IO.Compression.ZipFile]::ExtractToDirectory($packagePath, $SdkDirectory)
    }
}
$sdkRoot = (Resolve-Path -LiteralPath $SdkDirectory).Path
$nativeRoot = Join-Path $sourceRoot 'native'
[void][IO.Directory]::CreateDirectory($nativeRoot)
foreach ($assemblyName in @('Core','WinForms','Wpf')) {
    $assemblyPath = Join-Path $sdkRoot ('lib/net462/Microsoft.Web.WebView2.' + $assemblyName + '.dll')
    Copy-Item -LiteralPath $assemblyPath -Destination $nativeRoot
}
Copy-Item -LiteralPath (Join-Path $sdkRoot 'runtimes/win-x64/native/WebView2Loader.dll') -Destination $nativeRoot
foreach ($brandName in @('Shiguang','Lanxi')) {
    & $compilerPath /nologo /target:winexe /platform:x64 ('/out:' + (Join-Path $nativeRoot ($brandName + '.exe'))) ('/win32icon:' + (Join-Path $sourceRoot 'public/icon.ico')) /r:System.Drawing.dll /r:System.Windows.Forms.dll ('/r:' + (Join-Path $nativeRoot 'Microsoft.Web.WebView2.Core.dll')) ('/r:' + (Join-Path $nativeRoot 'Microsoft.Web.WebView2.WinForms.dll')) (Join-Path $sourceRoot 'DesktopHost.cs') (Join-Path $sourceRoot 'SingleInstance.cs')
    if ($LASTEXITCODE -ne 0) { throw ('Compilation failed: ' + $brandName) }
}
Write-Output 'Built native/Shiguang.exe and native/Lanxi.exe. No application was started.'
