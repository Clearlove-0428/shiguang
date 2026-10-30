using System;
using System.IO;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

// Installation, data directory and backend port identify one product instance.
// The two theme launchers share this identity; isolated installations do not.
public sealed class SingleInstance:IDisposable {
 readonly Mutex mutex;
 readonly string pipeName;
 readonly object gate=new object();
 NamedPipeServerStream listener;
 Action activation;
 bool pending,disposed;
 public bool IsOwner {get;private set;}
 public SingleInstance(string identity){
  string hash;using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(identity))).Replace("-","");
  pipeName="Shiguang.Main."+hash;mutex=new Mutex(false,@"Local\"+pipeName);
  try{IsOwner=mutex.WaitOne(0);}catch(AbandonedMutexException){IsOwner=true;}
  if(IsOwner){var worker=new Thread(Listen);worker.IsBackground=true;worker.Start();}
  else{try{using(var client=new NamedPipeClientStream(".",pipeName,PipeDirection.Out)){client.Connect(3000);client.WriteByte(1);client.Flush();}}catch(IOException){}catch(TimeoutException){}}
 }
 public void Attach(Action handler){lock(gate){activation=handler;if(pending){pending=false;handler();}}}
 void Listen(){while(true){NamedPipeServerStream pipe;lock(gate){if(disposed)return;listener=pipe=new NamedPipeServerStream(pipeName,PipeDirection.In,1,PipeTransmissionMode.Byte,PipeOptions.None);}
   try{pipe.WaitForConnection();if(pipe.ReadByte()==1)lock(gate){if(activation!=null)activation();else pending=true;}}catch(IOException){}catch(ObjectDisposedException){}
   finally{pipe.Dispose();lock(gate){if(listener==pipe)listener=null;}}
  }}
 public void Dispose(){lock(gate){disposed=true;if(listener!=null)listener.Dispose();}if(IsOwner){IsOwner=false;mutex.ReleaseMutex();}mutex.Dispose();}
}
