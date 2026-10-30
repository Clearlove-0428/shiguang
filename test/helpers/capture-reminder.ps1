param([int]$OwnerProcessId,[string]$Root,[string]$OutputPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$TargetProcessId=if($env:SHIGUANG_CAPTURE_PID){[int]$env:SHIGUANG_CAPTURE_PID}else{0}
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ShiguangReminderCapture {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int left,top,right,bottom;}
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent,Callback cb,IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 public static string Text(IntPtr h){var s=new StringBuilder(10000);GetWindowText(h,s,s.Capacity);return s.ToString();}
 public static IntPtr Find(int target){IntPtr found=IntPtr.Zero;EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==target&&IsWindowVisible(h)&&Text(h).Contains("拾光"))found=h;return true;},IntPtr.Zero);return found;}
 public static string[] Children(IntPtr h){var texts=new List<string>();EnumChildWindows(h,(c,p)=>{var text=Text(c);if(text.Length>0)texts.Add(text);return true;},IntPtr.Zero);return texts.ToArray();}
}
'@
$scriptPath=(Join-Path $Root 'notify.ps1').Replace('\','/')
$handle=[IntPtr]::Zero
for($tryIndex=0;$tryIndex -lt 20;$tryIndex++){
 $children=if($TargetProcessId){@(@{ProcessId=$TargetProcessId})}else{@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$OwnerProcessId) | Where-Object {$_.Name -eq 'powershell.exe' -and $_.CommandLine -and $_.CommandLine.Replace('\','/').IndexOf($scriptPath,[StringComparison]::OrdinalIgnoreCase) -ge 0})}
 foreach($child in $children){$handle=[ShiguangReminderCapture]::Find([int]$child.ProcessId);if($handle -ne [IntPtr]::Zero){break}}
 if($handle -ne [IntPtr]::Zero){break};Start-Sleep -Milliseconds 250
}
if($handle -eq [IntPtr]::Zero){throw 'Owned beta reminder window not found.'}
try{
 $texts=[ShiguangReminderCapture]::Children($handle)
 if(-not ($texts -join "`n").Contains('内测后台提醒')){throw 'Specific reminder title missing.'}
 if(-not ($texts -join "`n").Contains('内测提醒来源')){throw 'Specific reminder source missing.'}
 $rect=New-Object ShiguangReminderCapture+Rect
 [void][ShiguangReminderCapture]::GetWindowRect($handle,[ref]$rect)
 $bitmap=New-Object Drawing.Bitmap(($rect.right-$rect.left),($rect.bottom-$rect.top))
 $graphics=[Drawing.Graphics]::FromImage($bitmap);$dc=$graphics.GetHdc()
 try{if(-not [ShiguangReminderCapture]::PrintWindow($handle,$dc,2)){throw 'Reminder PrintWindow failed.'}}finally{$graphics.ReleaseHdc($dc);$graphics.Dispose()}
 try{$bitmap.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}
 @{passed=$true;title=[ShiguangReminderCapture]::Text($handle);texts=$texts;width=($rect.right-$rect.left);height=($rect.bottom-$rect.top);ownedBackend=$OwnerProcessId} | ConvertTo-Json -Depth 4
}finally{[void][ShiguangReminderCapture]::PostMessage($handle,0x10,[IntPtr]::Zero,[IntPtr]::Zero)}
