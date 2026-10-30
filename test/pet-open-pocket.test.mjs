import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('opening Shiguang closes the native pocket before launch and keeps the pet', {skip: process.platform !== 'win32'}, () => {
  // Exercise the production functions with real WPF Closed events. Only the
  // launcher and path boundary are substituted; no user window is opened.
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:SHIGUANG_PET_SCRIPT, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Production pet script failed PowerShell parsing' }
$names = @('Close-Pocket', 'Open-Main')
$functions = $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $names}, $true)
if ($functions.Count -ne 2) { throw 'Production pocket entry functions not found' }
foreach ($function in $functions) { . ([scriptblock]::Create($function.Extent.Text)) }
$script:trace = [System.Collections.Generic.List[string]]::new()
$script:launches = 0
function Join-Path { param($Path, $ChildPath) [System.IO.Path]::Combine($env:SHIGUANG_PET_ROOT, $ChildPath) }
function Start-Process {
  param($FilePath, $WindowStyle)
  if ($script:popup) { throw 'POCKET_STILL_OPEN: main launch began before the pocket closed' }
  if ($FilePath -ne [System.IO.Path]::Combine($env:SHIGUANG_PET_ROOT, 'native/Shiguang.exe')) { throw 'Wrong main application target' }
  if ($WindowStyle -ne 'Normal') { throw 'Main application should open normally' }
  $script:launches++
  $script:trace.Add('launch')
}
$script:petClosed = $false
$pet = [System.Windows.Window]::new()
$pet.Add_Closed({ $script:petClosed = $true })
$script:popup = [System.Windows.Window]::new()
$script:popup.Add_Closed({ $script:trace.Add('closed'); $script:popup = $null })
Open-Main
if (($script:trace -join ',') -ne 'closed,launch') { throw 'Pocket must close exactly once before launch' }
if ($script:petClosed) { throw 'Opening the main application must not close the pet' }
Open-Main
if ($script:launches -ne 2) { throw 'Opening without a pocket must still launch' }
$script:popup = [System.Windows.Window]::new()
$script:popup.Add_Closed({ $script:trace.Add('closed'); $script:popup = $null })
Open-Main
if (($script:trace -join ',') -ne 'closed,launch,launch,closed,launch') { throw 'A subsequently opened pocket must also close' }
if ($script:petClosed) { throw 'Pet unexpectedly closed' }
$result = @{closedBeforeLaunch = $true; noPocketSupported = $true; reopenedPocketSupported = $true; petPreserved = $true; launches = $script:launches}
$pet.Close()
$result | ConvertTo-Json -Compress
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    windowsHide: true,
    timeout: 15000,
    encoding: 'utf8',
    env: {...process.env, SHIGUANG_PET_SCRIPT: resolve(root, 'pet.ps1'), SHIGUANG_PET_ROOT: root},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const error = result.stderr?.match(/<S S="Error">([^<]*)/)?.[1]?.replaceAll('_x000D__x000A_', '').slice(0,300);
  assert.equal(result.status, 0, result.error?.message || error || 'Native pocket check failed');
  assert.deepEqual(JSON.parse(result.stdout.trim()), {closedBeforeLaunch: true, noPocketSupported: true, reopenedPocketSupported: true, petPreserved: true, launches: 3});
});
