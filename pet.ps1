param([int]$Port=43527,[string]$DataDir,[string]$Brand='拾光')
$ErrorActionPreference='Stop'
if($Port -lt 1 -or $Port -gt 65535){throw 'Invalid local port'}
if(-not $DataDir){$DataDir=Join-Path $PSScriptRoot 'data'}
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class PetNative {
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr p);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int z,uint f);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int i);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
}
'@
try{[PetNative]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))|Out-Null}catch{}
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Windows.Forms,System.Net.Http
$url="http://127.0.0.1:$Port"
$script:theme='classic'
$script:reduce=$false;$script:dragging=$false;$script:moved=$false;$script:popup=$null;$script:visibleRows=@();$script:filter='today';$script:events=@();$script:pose='rest';$script:tick=0;$script:failures=0;$script:request=$null
$statePath=Join-Path $DataDir 'pet-state.json'
function Write-AtomicJson([string]$path){
 $json=$input|Out-String;if($json -eq $script:lastStateJson){return};$script:lastStateJson=$json;$temp=$path+'.writing'
 [IO.File]::WriteAllText($temp,$json,[Text.UTF8Encoding]::new($true))
 for($attempt=0;$attempt -lt 10;$attempt++){
  try{if([IO.File]::Exists($path)){[IO.File]::Replace($temp,$path,[NullString]::Value)}else{[IO.File]::Move($temp,$path)};return}catch{if($attempt -eq 9){throw};Start-Sleep -Milliseconds 10}
 }
}
function Load-Xaml([string]$text){[Windows.Markup.XamlReader]::Parse($text)}
$assetRoot=Join-Path $PSScriptRoot 'pet-assets'
$script:colorMode='light';$script:fontSize=16;$script:motion='quiet';$script:petSize='medium';$script:character='shijian'
$window=Load-Xaml (Get-Content -LiteralPath (Join-Path $assetRoot 'pet-shell.xaml') -Encoding UTF8 -Raw)
$script:live2d=$false;$script:renderer='static';$script:liveStatus=$null;$script:webview=$null;$script:liveKey=''
function Close-Live2D{
 if($script:webview){$window.FindName('Actor').Children.Remove($script:webview);$script:webview.Dispose();$script:webview=$null}
 $script:liveKey='';$script:liveStatus=$null
}
function Sync-Live2D{
 if(-not $script:live2d -or -not $script:webview -or -not $script:webview.CoreWebView2){return}
 $message=@{character=$script:character;motion=$script:motion;reduceMotion=$script:reduce;pose=$script:pose}|ConvertTo-Json -Compress
 if($message -ne $script:liveKey){$script:webview.CoreWebView2.PostWebMessageAsJson($message);$script:liveKey=$message}
}
function Start-Live2D{
 if($script:webview){Sync-Live2D;return}
 $native=Join-Path $PSScriptRoot 'native'
 [Reflection.Assembly]::LoadFrom((Join-Path $native 'Microsoft.Web.WebView2.Core.dll'))|Out-Null
 [Reflection.Assembly]::LoadFrom((Join-Path $native 'Microsoft.Web.WebView2.Wpf.dll'))|Out-Null
 $env:PATH=$native+';'+$env:PATH
 $script:webview=[Microsoft.Web.WebView2.Wpf.WebView2CompositionControl]::new()
 $script:webview.IsHitTestVisible=$false;$script:webview.Focusable=$false
 if($script:webview.PSObject.Properties.Name -contains 'FpsDivider'){$script:webview.FpsDivider=2}
 $script:webview.DefaultBackgroundColor=[Drawing.Color]::Transparent
 $props=[Microsoft.Web.WebView2.Wpf.CoreWebView2CreationProperties]::new()
 $props.UserDataFolder=Join-Path $DataDir 'pet-webview2';$props.AdditionalBrowserArguments='--autoplay-policy=user-gesture-required'
 $script:webview.CreationProperties=$props
 $script:webview.Add_CoreWebView2InitializationCompleted({
  if(-not $_.IsSuccess){$script:liveStatus=@{type='error';message=$_.InitializationException.Message};Save-State;return}
  $core=$script:webview.CoreWebView2;$core.Settings.AreDefaultContextMenusEnabled=$false;$core.Settings.AreDevToolsEnabled=$false;$core.Settings.IsStatusBarEnabled=$false;$core.Settings.IsZoomControlEnabled=$false
  $core.Add_WebMessageReceived({try{$script:liveStatus=$_.WebMessageAsJson|ConvertFrom-Json;Save-State}catch{}})
  $core.Add_NavigationCompleted({$script:liveKey='';Sync-Live2D})
  $core.Add_NavigationStarting({if(-not $_.Uri.StartsWith($url+'/live2d/')){$_.Cancel=$true}})
  Sync-Live2D
 })
 $window.FindName('Actor').Children.Add($script:webview)|Out-Null
 $script:webview.Source=[Uri]::new($url+'/live2d/index.html?character='+$script:character)
}
# Small, frozen WPF sprite sequence; no WebView2 and no idle animation loop.
$script:gojoFrames=@();$script:gojoFrame=0;$script:gojoFrameCount=0;$script:gojoState='idle';$script:gojoStep=0;$script:gojoLastMove=0L
$script:gojoClock=[Diagnostics.Stopwatch]::StartNew()
$script:gojoTimer=[Windows.Threading.DispatcherTimer]::new();$script:gojoTimer.Interval=[TimeSpan]::FromMilliseconds(110)
function Set-GojoFrame([int]$index){
 if($script:gojoFrames.Count -ne 8){return}
 if($script:gojoFrame -ne $index -or $window.FindName('Sprite').Source -ne $script:gojoFrames[$index]){
  $script:gojoFrame=$index;$script:gojoFrameCount++;$window.FindName('Sprite').Source=$script:gojoFrames[$index]
 }
}
function Stop-Gojo{
 $wasActive=$script:gojoTimer.IsEnabled;$script:gojoTimer.Stop();$script:gojoState='idle';$script:gojoStep=0
 if($script:character -eq 'gojo'){Set-GojoFrame 0}
 if($wasActive -and $script:hwnd){Save-State}
}
function Load-Gojo{
 if($script:gojoFrames.Count -ne 8){
  $sheet=[Windows.Media.Imaging.BitmapImage]::new();$sheet.BeginInit();$sheet.UriSource=[Uri]::new((Join-Path $PSScriptRoot 'public/pet-assets/gojo-sheet.png'));$sheet.CacheOption='OnLoad';$sheet.EndInit();$sheet.Freeze()
  for($row=0;$row -lt 2;$row++){for($col=0;$col -lt 4;$col++){
   $x=[int][Math]::Floor($col*$sheet.PixelWidth/4);$y=[int][Math]::Floor($row*$sheet.PixelHeight/2)
   $right=[int][Math]::Floor(($col+1)*$sheet.PixelWidth/4);$bottom=[int][Math]::Floor(($row+1)*$sheet.PixelHeight/2)
   $frame=[Windows.Media.Imaging.CroppedBitmap]::new($sheet,[Windows.Int32Rect]::new($x,$y,$right-$x,$bottom-$y));$frame.Freeze();$script:gojoFrames+=,$frame
  }}
 }
 Set-GojoFrame 0
}
function Gojo-Pose([string]$state){
 if($script:character -ne 'gojo'){return}
 if($script:reduce){Stop-Gojo;return}
 if($state -in @('left','right','up','down')){
  $script:gojoLastMove=$script:gojoClock.ElapsedMilliseconds
  if($state -in @('left','right')){$window.FindName('Sprite').RenderTransform=[Windows.Media.ScaleTransform]::new($(if($state -eq 'left'){-1}else{1}),1)}
  if($script:gojoState -ne 'walk'){$script:gojoState='walk';$script:gojoStep=0;Set-GojoFrame 4}
  $script:gojoTimer.Start();return
 }
 if($state -eq 'hover'){
  $script:gojoTimer.Stop();$script:gojoState='wave';$script:gojoStep=0;Set-GojoFrame 1;$script:gojoTimer.Start()
 }else{Stop-Gojo}
}
$script:gojoTimer.Add_Tick({
 try{
  if($script:character -ne 'gojo' -or $script:reduce){Stop-Gojo;return}
  if($script:gojoState -eq 'wave'){
   $frames=@(1,2,1,2,1,2,3,0);$script:gojoStep++
   if($script:gojoStep -ge $frames.Count-1){Stop-Gojo}else{Set-GojoFrame $frames[$script:gojoStep]}
  }elseif($script:gojoState -eq 'walk'){
   if(-not $script:dragging -or $script:gojoClock.ElapsedMilliseconds-$script:gojoLastMove -gt 190){Stop-Gojo}else{$script:gojoStep=($script:gojoStep+1)%4;Set-GojoFrame (4+$script:gojoStep)}
  }else{$script:gojoTimer.Stop()}
 }catch{Stop-Gojo;$_|Out-String|Add-Content -LiteralPath (Join-Path $DataDir 'runtime-error.log')}
})

function Set-Theme([string]$name){
 Stop-Gojo;if($script:popup){Close-Pocket};$window.FindName('Sprite').RenderTransform=[Windows.Media.ScaleTransform]::new(1,1);$window.FindName('Sprite').RenderTransformOrigin=[Windows.Point]::new(.5,.5)
 $script:theme=$name
 $script:character=switch($name){'lanxi'{'xibai'}'xibai'{'xibai'}'moli'{'moli'}'miku'{'miku'}'haru'{'haru'}'ren'{'ren'}'gojo'{'gojo'}default{'shijian'}}
 $label=switch($script:character){'xibai'{'汐白'}'moli'{'墨璃'}'miku'{'初音未来'}'haru'{'Haru'}'ren'{'Ren Foster'}'gojo'{'五条悟 · Q版'}default{'拾笺'}}
 $script:live2d=$script:character -in @('miku','haru','ren');$script:renderer=if($script:live2d){'Live2D Cubism'}elseif($script:character -eq 'gojo'){'WPF sprite sequence'}else{'static'}
 if($script:live2d){$window.FindName('Sprite').Visibility='Collapsed';Start-Live2D}else{
  Close-Live2D;$window.FindName('Sprite').Visibility='Visible'
  if($script:character -eq 'gojo'){Load-Gojo}else{
  $script:gojoFrames=@();$bitmap=[Windows.Media.Imaging.BitmapImage]::new();$bitmap.BeginInit();$bitmap.UriSource=[Uri]::new((Join-Path $PSScriptRoot ('public/pet-assets/'+$script:character+'.png')));$bitmap.CacheOption='OnLoad';$bitmap.DecodePixelHeight=768;$bitmap.EndInit();$bitmap.Freeze();$window.FindName('Sprite').Source=$bitmap
  }
 }
 $window.Title='拾光 · '+$label;$window.ToolTip=$label+' · 拖动移动，点击日程口袋，右键设置或关闭'
 Set-Size $script:petSize
}
function Set-Size([string]$name){
 $script:petSize=$name
 $window.Height=if($script:character -eq 'gojo'){switch($name){'small'{208}'large'{312}default{260}}}elseif($script:live2d){switch($name){'small'{250}'large'{420}default{330}}}else{switch($name){'small'{184}'large'{292}default{234}}}
 $window.Width=[Math]::Round($window.Height*$(if($script:character -eq 'gojo'){1}elseif($script:live2d){.70}else{.923}))
 if($script:hwnd){$window.UpdateLayout();$r=Rect $script:hwnd;Place-Visible $script:hwnd $r.Left $r.Top}
}

function Animate([string]$name,[string]$prop,[double]$value,[int]$ms=160,[bool]$spring=$false){
 $target=$window.FindName($name)
 $dp=switch($prop){'Angle'{[Windows.Media.RotateTransform]::AngleProperty}'ScaleX'{[Windows.Media.ScaleTransform]::ScaleXProperty}'ScaleY'{[Windows.Media.ScaleTransform]::ScaleYProperty}'Y'{[Windows.Media.TranslateTransform]::YProperty}}
 if($script:reduce){$target.BeginAnimation($dp,$null);$target.SetValue($dp,$value);return}
 $a=[Windows.Media.Animation.DoubleAnimation]::new($value,[Windows.Duration]::new([TimeSpan]::FromMilliseconds($ms)))
 if($spring){$ease=[Windows.Media.Animation.BackEase]::new();$ease.Amplitude=.18}else{$ease=[Windows.Media.Animation.CubicEase]::new()}
 $ease.EasingMode='EaseOut';$a.EasingFunction=$ease;$target.BeginAnimation($dp,$a)
}
function Start-Breath{}
function Pose([string]$state){
 if($script:pose -eq $state){if($state -in @('left','right','up','down')){Gojo-Pose $state};return}
 Gojo-Pose $state
 $script:pose=$state;Sync-Live2D;$angle=0;$sx=1;$sy=1;$shift=0
 switch($state){'left'{$angle=4;$shift=-2}'right'{$angle=-4;$shift=-2}'up'{$sx=.99;$sy=1.015;$shift=-3}'down'{$sx=1.01;$sy=.985;$shift=1}'pressed'{$sx=.985;$sy=.985}'hover'{if($script:motion -eq 'responsive'){$angle=-1.5;$shift=-1}}}
 if($script:reduce -or $script:live2d -or $script:character -eq 'gojo'){$angle=0;$sx=1;$sy=1;$shift=0}
 $ms=if($state -eq 'rest'){320}else{140}
 Animate 'ActorLean' 'Angle' $angle $ms ($state -eq 'rest');Animate 'ActorScale' 'ScaleX' $sx $ms ($state -eq 'rest');Animate 'ActorScale' 'ScaleY' $sy $ms ($state -eq 'rest');Animate 'ActorShift' 'Y' $shift $ms ($state -eq 'rest')
 $window.FindName('Badge').Opacity=if($state -in @('hover','pocket')){1}else{0}
}
function Pocket-Brush([string]$name){return $script:popup.Resources[$name]}
function Style-Pocket{
 if(-not $script:popup){return}
 $colors=if($script:character -eq 'gojo'){@{Paper='#101C30';Ink='#F2F6FF';Muted='#A8B9D5';Line='#304B72';Soft='#13243F';Selected='#1A2B44';Accent='#A8D8FF';Hover='#294D7D';Pressed='#3A659C'}}elseif($script:colorMode -eq 'dark'){@{Paper='#222832';Ink='#E9EDF3';Muted='#A3ADBD';Line='#3C4655';Soft='#191F28';Selected='#343F4E';Accent='#A6CBD4';Hover='#3D4C60';Pressed='#506078'}}else{@{Paper='#F9FAFC';Ink='#293549';Muted='#778393';Line='#E4E8EF';Soft='#EFF2F7';Selected='#FFFFFF';Accent='#628998';Hover='#E4EBF3';Pressed='#D5E2EF'}}
 foreach($key in $colors.Keys){$script:popup.Resources[$key]=[Windows.Media.BrushConverter]::new().ConvertFromString($colors[$key])}
 $script:popup.Height=if($script:character -eq 'gojo'){if($script:fontSize -ge 22){460}else{410}}elseif($script:fontSize -ge 22){440}else{370}
}
function Rect([IntPtr]$handle){$r=[PetNative+Rect]::new();[PetNative]::GetWindowRect($handle,[ref]$r)|Out-Null;return $r}
function Clamp-Position([int]$x,[int]$y,[int]$w,[int]$h,$area){
 return @([int][Math]::Max($area.Left,[Math]::Min($x,$area.Right-$w)),[int][Math]::Max($area.Top,[Math]::Min($y,$area.Bottom-$h)))
}
function Place-Visible([IntPtr]$handle,[int]$x,[int]$y){
 $r=Rect $handle;$area=[Windows.Forms.Screen]::FromRectangle([Drawing.Rectangle]::new($x,$y,$r.Right-$r.Left,$r.Bottom-$r.Top)).WorkingArea
 $xy=Clamp-Position $x $y ($r.Right-$r.Left) ($r.Bottom-$r.Top) $area
 if($r.Left -ne $xy[0] -or $r.Top -ne $xy[1]){[PetNative]::SetWindowPos($handle,[IntPtr]::Zero,$xy[0],$xy[1],0,0,0x15)|Out-Null}
}
function Save-State{
 $r=Rect $script:hwnd;$dpi=[Windows.PresentationSource]::FromVisual($window).CompositionTarget.TransformToDevice.M11
 @{screenX=$r.Left;screenY=$r.Top;width=($r.Right-$r.Left);height=($r.Bottom-$r.Top);dpi=$dpi;pid=$PID;hwnd=$script:hwnd.ToInt64();spriteFrame=$script:gojoFrame;spriteFrameCount=$script:gojoFrameCount;spriteState=$script:gojoState;spriteAnimating=$script:gojoTimer.IsEnabled;renderer=$script:renderer;live2dStatus=$script:liveStatus;theme=$script:theme;character=$script:character;petSize=$script:petSize;motion=$script:motion;colorMode=$script:colorMode;fontSize=$script:fontSize;reduceMotion=$script:reduce;pose=$script:pose;popup=[bool]$script:popup;filter=$script:filter;eventIds=@($script:events|ForEach-Object {$_.id});visibleIds=@($script:visibleRows|ForEach-Object {$_.id});topmostNative=([PetNative]::GetWindowLong($script:hwnd,-20) -band 8) -ne 0;parent=[PetNative]::GetParent($script:hwnd).ToInt64()} | ConvertTo-Json | Write-AtomicJson $statePath
}
function Fill-List{
 if(-not $script:popup){return}
 $list=$script:popup.FindName('List');$scroll=$script:popup.FindName('ItemsScroll')
 $script:visibleRows=@($script:events|Where-Object {if($script:filter -eq 'focus'){$_.focus}else{$_.date -eq (Get-Date -Format 'yyyy-MM-dd')}})
 $rowsKey=@{filter=$script:filter;rows=$script:visibleRows;character=$script:character;color=$script:colorMode;font=$script:fontSize}|ConvertTo-Json -Depth 5 -Compress
 if($rowsKey -ne $script:pocketRowsKey){
  $offset=if($script:pocketFilter -eq $script:filter){$scroll.VerticalOffset}else{0}
  Style-Pocket;$list.Children.Clear()
  foreach($row in $script:visibleRows){
   $box=[Windows.Controls.Border]::new();$box.Background=Pocket-Brush 'Selected';$box.BorderBrush=Pocket-Brush 'Line';$box.BorderThickness=1;$box.CornerRadius=10;$box.Padding='12,10';$box.Margin='0,0,0,7';$box.Tag=$row.id
   $stack=[Windows.Controls.StackPanel]::new();$t=[Windows.Controls.TextBlock]::new();$t.Text=$row.title;$t.FontSize=[Math]::Max(13,$script:fontSize-2);$t.LineHeight=$t.FontSize*1.5;$t.TextWrapping='Wrap';$t.Foreground=Pocket-Brush 'Ink';$stack.Children.Add($t)|Out-Null
   $t=[Windows.Controls.TextBlock]::new();$t.Text=$row.date+'  '+$row.time+$(if($row.focus){'  · 特别关注'}else{''});$t.FontSize=11;$t.Margin='0,5,0,0';$t.Foreground=Pocket-Brush 'Muted';$stack.Children.Add($t)|Out-Null
   $box.Child=$stack;$list.Children.Add($box)|Out-Null
  }
  if(-not $script:visibleRows.Count){$t=[Windows.Controls.TextBlock]::new();$t.Text=if($script:filter -eq 'focus'){'还没有特别关注的安排。'}else{'今天暂时没有安排。'};$t.Margin='8,24';$t.FontSize=14;$t.Foreground=Pocket-Brush 'Muted';$list.Children.Add($t)|Out-Null}
  $script:pocketRowsKey=$rowsKey;$script:pocketFilter=$script:filter;$scroll.UpdateLayout();$scroll.ScrollToVerticalOffset($offset)
 }
 $script:popup.FindName('Status').Text=if($script:failures){'连接暂不可用'}else{[string]$script:visibleRows.Count+' 项 · Esc 收起'}
 foreach($name in @('Today','Focus')){$button=$script:popup.FindName($name);$selected=($name -eq 'Today' -and $script:filter -eq 'today') -or ($name -eq 'Focus' -and $script:filter -eq 'focus');$button.FontWeight=if($selected){'SemiBold'}else{'Normal'};$button.Background=Pocket-Brush $(if($selected){'Selected'}else{'Soft'});if($script:character -eq 'gojo'){$button.BorderBrush=Pocket-Brush $(if($selected){'Accent'}else{'Line'});if($selected){$button.Background=Pocket-Brush 'Hover'}}}
}
function Close-Pocket{if($script:popup){$script:popup.Close()}}
function Show-Pocket{
 if($script:popup){Close-Pocket;return};Pose 'pocket'
 $script:popup=Load-Xaml (Get-Content -LiteralPath (Join-Path $assetRoot $(if($script:character -eq 'gojo'){'gojo-pocket.xaml'}else{'pet-pocket.xaml'})) -Encoding UTF8 -Raw)
 $script:popup.FindName('PocketDate').Text=(Get-Date -Format 'M月d日 · dddd')
 $script:popup.FindName('Open').Add_Click({Open-Main})
 $script:popup.Owner=$window
 $script:popup.FindName('Close').Add_Click({Close-Pocket})
 $script:popup.FindName('Today').Add_Click({$script:filter='today';Fill-List})
 $script:popup.FindName('Focus').Add_Click({$script:filter='focus';Fill-List})
 $script:popup.Add_KeyDown({if($_.Key -eq 'Escape'){Close-Pocket}})
 $script:popup.Add_Closed({$script:popup=$null;$script:visibleRows=@();$script:pocketRowsKey=$null;$script:pocketFilter=$null;Pose 'rest'})
 Fill-List;$script:popup.Show();$script:popup.UpdateLayout()
 $h=[Windows.Interop.WindowInteropHelper]::new($script:popup).Handle;$r=Rect $script:hwnd;$pr=Rect $h
 $area=[Windows.Forms.Screen]::FromHandle($script:hwnd).WorkingArea
 $x=if($r.Left-($pr.Right-$pr.Left)-8 -ge $area.Left){$r.Left-($pr.Right-$pr.Left)-8}else{$r.Right+8}
 Place-Visible $h $x ($r.Bottom-($pr.Bottom-$pr.Top))
}
Set-Theme $script:theme
$window.Add_SourceInitialized({$script:hwnd=[Windows.Interop.WindowInteropHelper]::new($window).Handle;[PetNative]::SetWindowPos($script:hwnd,[IntPtr]::new(-1),0,0,0,0,0x13)|Out-Null})
$window.Add_ContentRendered({
 $area=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea;$r=Rect $script:hwnd;$x=$area.Right-($r.Right-$r.Left)-24;$y=$area.Bottom-($r.Bottom-$r.Top)-24
 try{$saved=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json;$x=[int]$saved.screenX;$y=[int]$saved.screenY}catch{}
 Place-Visible $script:hwnd $x $y;Save-State
})
$window.Add_MouseLeftButtonDown({$script:wasPocketOpen=[bool]$script:popup;Close-Pocket;Pose 'pressed';$script:dragging=$true;$script:moved=$false;$p=[PetNative+Point]::new();[PetNative]::GetCursorPos([ref]$p)|Out-Null;$script:start=$p;$script:previous=$p;$script:origin=Rect $script:hwnd;$window.CaptureMouse()|Out-Null; $_.Handled=$true})
$window.Add_MouseMove({
 if(-not $script:dragging){return}
 $p=[PetNative+Point]::new();[PetNative]::GetCursorPos([ref]$p)|Out-Null;$dx=$p.X-$script:start.X;$dy=$p.Y-$script:start.Y
 if([Math]::Abs($dx)+[Math]::Abs($dy) -le 5 -and -not $script:moved){return}
 $script:moved=$true;$vx=$p.X-$script:previous.X;$vy=$p.Y-$script:previous.Y;$script:previous=$p
 if([Math]::Abs($vx)+[Math]::Abs($vy) -gt 1){if([Math]::Abs($vx) -ge [Math]::Abs($vy)){Pose $(if($vx -lt 0){'left'}else{'right'})}else{Pose $(if($vy -lt 0){'up'}else{'down'})}}
 [PetNative]::SetWindowPos($script:hwnd,[IntPtr]::Zero,($script:origin.Left+$dx),($script:origin.Top+$dy),0,0,0x15)|Out-Null
})
function Finish-Drag{
 if(-not $script:dragging){return};$script:dragging=$false;$window.ReleaseMouseCapture();Pose 'rest';$r=Rect $script:hwnd;Place-Visible $script:hwnd $r.Left $r.Top;Save-State
}
$window.Add_MouseLeftButtonUp({$wasDrag=$script:dragging;$moved=$script:moved;Finish-Drag;if($wasDrag -and -not $moved -and -not $script:wasPocketOpen){Show-Pocket}})
$window.Add_LostMouseCapture({if($script:dragging){$script:moved=$true;Finish-Drag}})
$window.Add_MouseEnter({if(-not $script:dragging){Pose 'hover'}})
$window.Add_MouseLeave({if(-not $script:dragging -and -not $script:popup){Pose 'rest'}})
$window.Add_KeyDown({if($_.Key -eq 'Escape'){Close-Pocket}})
function Open-Main{Close-Pocket;Start-Process -FilePath (Join-Path $PSScriptRoot 'native/Shiguang.exe') -WindowStyle Normal}
$menu=[Windows.Controls.ContextMenu]::new();$script:characterMenus=@{}
foreach($label in @('打开拾光','今日口袋','角色 · 拾笺','角色 · 汐白','角色 · 墨璃','角色 · 初音未来','角色 · Haru','角色 · Ren Foster','角色 · 五条悟','减少动效','关闭桌宠')){
 $item=[Windows.Controls.MenuItem]::new();$item.Header=$label
 if($label -eq '减少动效'){$script:motionMenu=$item;$item.IsCheckable=$true}
 if($label.StartsWith('角色')){$item.IsCheckable=$true;$item.Tag=switch($label){'角色 · 拾笺'{'shijian'}'角色 · 汐白'{'xibai'}'角色 · 初音未来'{'miku'}'角色 · Haru'{'haru'}'角色 · Ren Foster'{'ren'}'角色 · 五条悟'{'gojo'}default{'moli'}};$script:characterMenus[$item.Tag]=$item}
 if($item.Tag){$preview=if($item.Tag -eq 'gojo'){'public/pet-assets/gojo-sheet.png'}elseif($item.Tag -in @('miku','haru','ren')){'public/live2d/'+$item.Tag+'.png'}else{'public/pet-assets/'+$item.Tag+'.png'};if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot $preview))){continue}}
 $item.Add_Click({
  if($this.Tag){try{Invoke-RestMethod ($url+'/api/appearance') -Method Post -ContentType 'application/json' -Headers @{'X-Shiguang'='1'} -Body (@{petSkin=$this.Tag}|ConvertTo-Json) -TimeoutSec 2|Out-Null;Set-Theme $this.Tag;Save-State}catch{};return}
  switch($this.Header){'打开拾光'{Open-Main}'今日口袋'{$script:filter='today';if($script:popup){Fill-List}else{Show-Pocket}}'减少动效'{try{$next=-not $script:reduce;Invoke-RestMethod ($url+'/api/appearance') -Method Post -ContentType 'application/json' -Headers @{'X-Shiguang'='1'} -Body (@{reduceMotion=$next}|ConvertTo-Json) -TimeoutSec 2|Out-Null;$script:reduce=$next;$this.IsChecked=$next;$script:pose='';Pose 'rest'}catch{}}'关闭桌宠'{try{Invoke-RestMethod ($url+'/api/settings') -Method Post -ContentType 'application/json' -Headers @{'X-Shiguang'='1'} -Body '{"widgetMode":"off"}' -TimeoutSec 1|Out-Null}catch{};$window.Close()}}
 });$menu.Items.Add($item)|Out-Null
};$window.ContextMenu=$menu
$menu.Add_Opened({$script:motionMenu.IsChecked=$script:reduce;foreach($key in $script:characterMenus.Keys){$script:characterMenus[$key].IsChecked=$key -eq $script:character}})
$script:ownerProcess=$null;if($env:SHIGUANG_OWNER_PID){try{$script:ownerProcess=[Diagnostics.Process]::GetProcessById([int]$env:SHIGUANG_OWNER_PID)}catch{exit}}
$client=[Net.Http.HttpClient]::new();$client.Timeout=[TimeSpan]::FromSeconds(2)
$timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromMilliseconds(250)
$timer.Add_Tick({
 try{
  $script:tick++
  if($script:tick%4 -eq 1 -and $env:SHIGUANG_OWNER_PID){if(-not $script:ownerProcess -or $script:ownerProcess.HasExited){$window.Close();return}}
  if($script:tick%8 -eq 1 -and -not $script:request){$script:request=$client.GetStringAsync($url+'/api/desktop')}
  if($script:request -and $script:request.IsCompleted){
   try{$data=$script:request.GetAwaiter().GetResult()|ConvertFrom-Json;$script:failures=0;if($data.mode -ne 'pet'){$window.Close();return};$nextTheme=if($data.skin -in @('classic','lanxi','shijian','xibai','moli','miku','haru','ren','gojo')){$data.skin}else{'shijian'};if($data.petSize -in @('small','medium','large') -and $data.petSize -ne $script:petSize){Set-Size $data.petSize};$script:motion=if($data.petMotion -eq 'responsive'){'responsive'}else{'quiet'};$script:colorMode=if($data.colorMode -eq 'dark'){'dark'}else{'light'};if($data.fontSize -ge 14 -and $data.fontSize -le 24){$script:fontSize=[int]$data.fontSize};$nextReduce=[bool]$data.reduceMotion;$themeChanged=$script:theme -ne $nextTheme;$motionChanged=$script:reduce -ne $nextReduce;$script:reduce=$nextReduce;if($themeChanged){Set-Theme $nextTheme};if($themeChanged -or $motionChanged){$script:pose='';Pose 'rest'};Sync-Live2D;$script:events=@($data.events);$window.FindName('Count').Text=[string]@($script:events|Select-Object -ExpandProperty id -Unique).Count;Fill-List;Save-State}catch{$script:liveStatus=@{type='error';message=$_.Exception.Message};Save-State;$script:failures++;if($script:failures -ge 3){$window.Close();return}}finally{$script:request=$null}
  }
  if($script:tick%12 -eq 0 -and -not $script:dragging){$r=Rect $script:hwnd;Place-Visible $script:hwnd $r.Left $r.Top}
 }catch{$_|Out-String|Add-Content -LiteralPath (Join-Path $DataDir 'runtime-error.log');$window.Close()}
})
$window.Add_Closed({$timer.Stop();Stop-Gojo;Close-Pocket;Close-Live2D;$client.Dispose();Save-State})
$timer.Start();$window.ShowDialog()|Out-Null
