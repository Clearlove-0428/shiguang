param([string]$DbDir,[string]$Vault)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Security
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Security.Cryptography;using System.Diagnostics;
public static class QQReadOnlyKey {
 [StructLayout(LayoutKind.Sequential)] public struct Region{public IntPtr Base,AllocationBase;public uint AllocationProtect;public UIntPtr Size;public uint State,Protect,Type;}
 [DllImport("kernel32.dll")]static extern IntPtr OpenProcess(uint a,bool i,int p);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")]static extern UIntPtr VirtualQueryEx(IntPtr h,IntPtr a,out Region r,UIntPtr l);
 [DllImport("kernel32.dll")]static extern bool ReadProcessMemory(IntPtr h,IntPtr a,byte[] b,UIntPtr l,out UIntPtr n);
 static Stopwatch watch;public static int SaltHits=0,References=0,Tested=0;
 static byte[] Read(IntPtr h,long p,int l){if(p<65536||p>=0x800000000000)return null;byte[] b=new byte[l];UIntPtr n;ReadProcessMemory(h,new IntPtr(p),b,(UIntPtr)l,out n);return n.ToUInt64()==(ulong)l?b:null;}
 static IEnumerable<KeyValuePair<long,byte[]>> Buffers(IntPtr h){long p=0,total=0;Region r;while(p<0x7fffffffffff&&watch.Elapsed.TotalSeconds<90&&total<3L*1024*1024*1024){if(VirtualQueryEx(h,new IntPtr(p),out r,(UIntPtr)Marshal.SizeOf(typeof(Region))).ToUInt64()==0)yield break;long size=(long)r.Size.ToUInt64(),start=r.Base.ToInt64();if(size<=0||start+size<=p)yield break;p=start+size;if(r.State!=0x1000||r.Type!=0x20000||(r.Protect&0x100)!=0||(r.Protect&0xEE)==0)continue;for(long o=0;o<size;o+=1048576-512){var b=Read(h,start+o,(int)Math.Min(1048576,size-o));if(b!=null){total+=b.Length;yield return new KeyValuePair<long,byte[]>(start+o,b);Array.Clear(b,0,b.Length);}if(watch.Elapsed.TotalSeconds>90)yield break;}}}
 static bool Verify(byte[] key,byte[] page){var salt=new byte[16];for(int i=0;i<16;i++)salt[i]=(byte)(page[i]^0x3a);byte[] mk;using(var k=new Rfc2898DeriveBytes(key,salt,2,HashAlgorithmName.SHA512))mk=k.GetBytes(32);var input=new byte[4052];Array.Copy(page,16,input,0,4048);input[4048]=1;byte[] mac;using(var h=new HMACSHA1(mk))mac=h.ComputeHash(input);for(int i=0;i<20;i++)if(mac[i]!=page[4064+i])return false;return true;}
 public static string Scan(int[] pids,byte[] page){watch=Stopwatch.StartNew();var tested=new HashSet<string>();foreach(int pid in pids){var h=OpenProcess(0x410,false,pid);if(h==IntPtr.Zero)continue;try{
  var salts=new HashSet<long>();foreach(var part in Buffers(h)){var b=part.Value;for(int i=0;i+16<=b.Length;i++){if(b[i]!=page[0]||b[i+1]!=page[1])continue;bool eq=true;for(int j=2;j<16;j++)if(b[i+j]!=page[j]){eq=false;break;}if(eq&&salts.Count<5000)salts.Add(part.Key+i);}}SaltHits+=salts.Count;if(salts.Count==0)continue;
  foreach(var part in Buffers(h)){var b=part.Value;for(int i=0;i+8<=b.Length;i+=8){if(!salts.Contains(BitConverter.ToInt64(b,i)))continue;References++;var ctx=Read(h,part.Key+i-256,768);if(ctx==null)continue;var pointers=new HashSet<long>();for(int j=0;j+8<=ctx.Length;j+=8)pointers.Add(BitConverter.ToInt64(ctx,j));var initial=new List<long>(pointers);foreach(long p in initial){var nested=Read(h,p,256);if(nested!=null)for(int j=0;j+8<=nested.Length;j+=8)pointers.Add(BitConverter.ToInt64(nested,j));}
   foreach(long p in pointers){var key=Read(h,p,32);if(key==null)continue;var hex=BitConverter.ToString(key).Replace("-","").ToLowerInvariant();if(!tested.Add(hex))continue;Tested++;if(Verify(key,page))return hex;Array.Clear(key,0,key.Length);}if(watch.Elapsed.TotalSeconds>90)return null;
  }}
 }finally{CloseHandle(h);}if(watch.Elapsed.TotalSeconds>90)break;}return null;}
}
'@
$keys=@{}
$procs=@(Get-Process QQ -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -ExpandProperty Id)
foreach($name in @('nt_msg.db','group_info.db')){
 $file=Join-Path $DbDir $name
 $f=[IO.File]::Open($file,'Open','Read','ReadWrite');try{$page=New-Object byte[] 4096;[void]$f.Seek(1024,'Begin');[void]$f.Read($page,0,4096)}finally{$f.Dispose()}
 $salt=[BitConverter]::ToString($page,0,16).Replace('-','').ToLower()
 if($keys.ContainsKey($salt)){continue}
 $key=[QQReadOnlyKey]::Scan([int[]]$procs,$page)
 if(-not $key){@{ok=$false;saltHits=[QQReadOnlyKey]::SaltHits;references=[QQReadOnlyKey]::References;tested=[QQReadOnlyKey]::Tested}|ConvertTo-Json -Compress;exit 2}
 $keys[$salt]=$key
}
$json=$keys|ConvertTo-Json -Compress
$sealed=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($json),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($Vault,$sealed)
@{ok=$true;matched=$keys.Count}|ConvertTo-Json -Compress
