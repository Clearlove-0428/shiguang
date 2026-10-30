using System;
using System.IO;
using System.Net;
using System.Text;
using System.Drawing;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

public class DesktopHost:Form {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern int SetCurrentProcessExplicitAppUserModelID(string id);
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")]static extern bool ShowWindowAsync(IntPtr handle,int command);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr handle);
 [DllImport("user32.dll")]static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 static void OpenCalendar(){int build;int.TryParse(Convert.ToString(Microsoft.Win32.Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion","CurrentBuildNumber","0")),out build);byte key=build>=22000?(byte)0x4E:(byte)0x44;keybd_event(0x5B,0,0,UIntPtr.Zero);if(build<22000)keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(key,0,0,UIntPtr.Zero);keybd_event(key,0,2,UIntPtr.Zero);if(build<22000)keybd_event(0x12,0,2,UIntPtr.Zero);keybd_event(0x5B,0,2,UIntPtr.Zero);}
 sealed class LocalClient:WebClient { protected override WebRequest GetWebRequest(Uri address){var request=base.GetWebRequest(address);request.Timeout=2000;return request;} }
 readonly WebView2 web=new WebView2();
 readonly Timer heartbeat=new Timer();
 readonly bool lanxi;
 readonly string origin,core,folder,windowId=Guid.NewGuid().ToString();
 readonly int pid=Process.GetCurrentProcess().Id;
 bool registered,allowClose,closing,opening,closePending;
 void UpdateWebVisibility(){
  bool hidden=WindowState==FormWindowState.Minimized;
  if(web.CoreWebView2!=null)try{web.CoreWebView2.PostWebMessageAsJson("{\"type\":\"host-visibility\",\"hidden\":"+(hidden?"true":"false")+"}");}catch{}
  web.Visible=!hidden;
 }
 static int Port(string name,int fallback){int value;return int.TryParse(Environment.GetEnvironmentVariable(name),out value)&&value>1024&&value<=65535?value:fallback;}
 Task Register(string action){return Task.Run(()=>{using(var client=new LocalClient()){client.Headers["Content-Type"]="application/json";client.Headers["X-Shiguang"]="1";client.UploadData(core+"/api/window/"+action,"POST",Encoding.UTF8.GetBytes("{\"id\":\""+windowId+"\",\"pid\":"+pid+"}"));}});}
 DesktopHost(bool premium){
  lanxi=premium;core="http://127.0.0.1:"+Port("SHIGUANG_PORT",43527);origin=lanxi?"http://127.0.0.1:"+Port("LANXI_PORT",43527):core;
  var data=Environment.GetEnvironmentVariable("SHIGUANG_DATA")??Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..",".local","data"));
  folder=Path.Combine(data,lanxi?"webview-lanxi":"webview");
  Text="拾光 · 本地日程助手";Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
  StartPosition=FormStartPosition.CenterScreen;Size=new Size(1450,980);MinimumSize=new Size(760,600);BackColor=Color.FromArgb(14,28,52);
  web.Dock=DockStyle.Fill;Controls.Add(web);
  // WebView2 does not automatically report a minimized parent as hidden.
  Resize+=(s,e)=>UpdateWebVisibility();
  heartbeat.Interval=10000;heartbeat.Tick+=async(s,e)=>{if(closing||!registered)return;try{await Register("heartbeat");}catch{}};
  Shown+=async(s,e)=>{
   opening=true;
   try{
    await Register("open");registered=true;opening=false;if(closing){Close();return;}heartbeat.Start();
    var env=await CoreWebView2Environment.CreateAsync(null,folder);if(closing)return;
    await web.EnsureCoreWebView2Async(env);if(closing)return;
    UpdateWebVisibility();
    web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
    web.CoreWebView2.NavigationStarting+=(o,n)=>{if(!n.Uri.StartsWith(origin+"/"))n.Cancel=true;};
    web.CoreWebView2.NewWindowRequested+=(o,n)=>{n.Handled=true;};
    web.CoreWebView2.WebMessageReceived+=(o,m)=>{if(m.Source.StartsWith(origin+"/")&&m.WebMessageAsJson.Contains("\"calendar\""))OpenCalendar();};
    web.CoreWebView2.NavigationCompleted+=(o,n)=>{UpdateWebVisibility();try{File.WriteAllText(Path.Combine(data,lanxi?"native-lanxi-status.txt":"native-shiguang-status.txt"),DateTime.Now.ToString("s")+" loaded="+n.IsSuccess+" status="+n.WebErrorStatus);}catch{}};
    web.Source=new Uri(origin+"/");
   }catch(Exception error){opening=false;if(!closing)MessageBox.Show("界面启动失败，请确认本地服务及 WebView2 可用。\n"+error.Message,Text);Close();}
  };
  FormClosing+=async(s,e)=>{
   if(allowClose)return;e.Cancel=true;
   if(opening){closing=true;return;}
   if(closePending)return;closePending=true;closing=true;heartbeat.Stop();
   if(registered){registered=false;try{await Register("close");}catch{/* Server reaps this PID after exit if a close request fails. */}}
   allowClose=true;Close();
  };
  FormClosed+=(s,e)=>{heartbeat.Dispose();web.Dispose();};
 }
 void ActivateMain(){if(closing||IsDisposed)return;if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Show();Activate();SetForegroundWindow(Handle);}
 [STAThread]public static void Main(string[] args){
  bool premium=Path.GetFileNameWithoutExtension(Application.ExecutablePath).StartsWith("Lanxi",StringComparison.OrdinalIgnoreCase);
  string install=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,".."));
  string data=Path.GetFullPath(Environment.GetEnvironmentVariable("SHIGUANG_DATA")??Path.Combine(install,"data"));
  string identity=install.ToUpperInvariant()+"|"+data.ToUpperInvariant()+"|"+Port("SHIGUANG_PORT",43527);
  // An already running pre-upgrade host has no pipe. Activate it during this one-time transition.
  if(Environment.GetEnvironmentVariable("SHIGUANG_DATA")==null&&Port("SHIGUANG_PORT",43527)==43527){
   foreach(var other in Process.GetProcesses()){try{if(other.Id==Process.GetCurrentProcess().Id||other.MainWindowHandle==IntPtr.Zero)continue;string exe=other.MainModule.FileName;if(!String.Equals(Path.GetDirectoryName(exe),Path.Combine(install,"native"),StringComparison.OrdinalIgnoreCase))continue;string name=Path.GetFileNameWithoutExtension(exe);if(name!="Shiguang"&&name!="Lanxi")continue;ShowWindowAsync(other.MainWindowHandle,9);SetForegroundWindow(other.MainWindowHandle);return;}catch{}finally{other.Dispose();}}
  }
  using(var instance=new SingleInstance(identity)){
   if(!instance.IsOwner)return;
   try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
   SetCurrentProcessExplicitAppUserModelID("Xiaoshuaishuai.Shiguang");Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   using(var host=new DesktopHost(premium)){var handle=host.Handle;instance.Attach(()=>{try{host.BeginInvoke(new Action(host.ActivateMain));}catch(InvalidOperationException){}});Application.Run(host);}
  }
 }
}
