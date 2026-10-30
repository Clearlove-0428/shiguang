param([ValidateSet('scan','read')][string]$Mode='scan',[string]$DbDir,[string]$Vault)
$ErrorActionPreference='Stop'
# WeChat 4.1 Config.Cipher layout reference: fanyuantaier/wechatauto-replica, Apache-2.0.
# Adapted as a read-only scanner with selected-database validation and Windows DPAPI storage.
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Security
if($Mode -eq 'read'){
 $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Vault),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 [Console]::Write([Text.Encoding]::UTF8.GetString($bytes));[Array]::Clear($bytes,0,$bytes.Length);exit
}
if(-not (Test-Path -LiteralPath $DbDir -PathType Container)){throw 'Database directory does not exist'}
$files=@(Get-ChildItem -LiteralPath (Join-Path $DbDir 'message') -Filter 'message_*.db' -File | Where-Object {$_.Name -match '^message_\d+\.db$'})
$files+=Get-Item -LiteralPath (Join-Path $DbDir 'contact/contact.db'),(Join-Path $DbDir 'session/session.db') -ErrorAction SilentlyContinue
$salts=@()
$pageMap=New-Object 'System.Collections.Generic.Dictionary[string,byte[]]'
foreach($f in $files){$stream=[IO.File]::Open($f.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite);try{$head=New-Object byte[] 4096;[void]$stream.Read($head,0,4096);$salt=[BitConverter]::ToString($head,0,16).Replace('-','').ToLower();$salts+=$salt;$pageMap[$salt]=$head}finally{$stream.Dispose()}}
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
public static class ShiguangReadOnlyKeys {
 public static long Bytes=0,Regions=0,Opens=0,Hex64=0,Hex96=0;
 [StructLayout(LayoutKind.Sequential)] public struct Region {public IntPtr Base;public IntPtr AllocationBase;public uint AllocationProtect;public UIntPtr Size;public uint State;public uint Protect;public uint Type;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll")] static extern UIntPtr VirtualQueryEx(IntPtr process,IntPtr address,out Region region,UIntPtr length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadProcessMemory(IntPtr process,IntPtr address,byte[] buffer,UIntPtr size,out UIntPtr read);
 static bool Hex(byte b){return b>=48&&b<=57||b>=65&&b<=70||b>=97&&b<=102;}
 static byte[] Decode(string hex){var b=new byte[hex.Length/2];for(int i=0;i<b.Length;i++)b[i]=Convert.ToByte(hex.Substring(i*2,2),16);return b;}
 static bool Verify(byte[] key,byte[] page){var salt=new byte[16];for(int i=0;i<16;i++)salt[i]=(byte)(page[i]^0x3a);byte[] macKey;using(var kdf=new Rfc2898DeriveBytes(key,salt,2,HashAlgorithmName.SHA512))macKey=kdf.GetBytes(32);var input=new byte[4020];Array.Copy(page,16,input,0,4016);input[4016]=1;byte[] mac;using(var hmac=new HMACSHA512(macKey))mac=hmac.ComputeHash(input);for(int i=0;i<64;i++)if(mac[i]!=page[4032+i])return false;return true;}
 static byte[] Read(IntPtr h,long address,int count){if(address<65536||address>=0x800000000000||count<1||count>1048576)return null;var bytes=new byte[count];UIntPtr n;ReadProcessMemory(h,new IntPtr(address),bytes,(UIntPtr)count,out n);return n.ToUInt64()==(ulong)count?bytes:null;}
 static IEnumerable<KeyValuePair<long,byte[]>> Buffers(IntPtr h){long address=0;Region region;while(address<0x7fffffffffff){if(VirtualQueryEx(h,new IntPtr(address),out region,(UIntPtr)Marshal.SizeOf(typeof(Region))).ToUInt64()==0)yield break;long len=(long)region.Size.ToUInt64(),start=region.Base.ToInt64();if(len<=0||start+len<=address)yield break;address=start+len;if(region.State!=0x1000||(region.Protect&0x100)!=0||(region.Protect&0xEE)==0)continue;for(long offset=0;offset<len;offset+=1048576-128){var b=Read(h,start+offset,(int)Math.Min(1048576,len-offset));if(b!=null){yield return new KeyValuePair<long,byte[]>(start+offset,b);Array.Clear(b,0,b.Length);}}}}
 public static Dictionary<string,string> ConfigScan(int[] pids,Dictionary<string,byte[]> pages){
  var found=new Dictionary<string,string>();var marker=Encoding.ASCII.GetBytes("com.Tencent.WCDB.Config.Cipher");var mask=Decode("d2c7442458020000004889442450488b450048844c2448488944254048584c24");var tested=new HashSet<string>();
  foreach(int pid in pids){IntPtr h=OpenProcess(0x410,false,pid);if(h==IntPtr.Zero)continue;try{
   var markers=new HashSet<long>();
   foreach(var part in Buffers(h)){var b=part.Value;for(int i=0;i<=b.Length-marker.Length;i++){if(b[i]!=marker[0])continue;bool ok=true;for(int j=1;j<marker.Length;j++)if(b[i+j]!=marker[j]){ok=false;break;}if(ok)markers.Add(part.Key+i);}}
   if(markers.Count==0)continue;
   foreach(var part in Buffers(h)){var b=part.Value;for(int i=0;i+32<=b.Length;i+=8){if(BitConverter.ToInt64(b,i+8)!=marker.Length||!markers.Contains(BitConverter.ToInt64(b,i)))continue;long config=BitConverter.ToInt64(b,i+24);var obj=Read(h,config+0x88,40);if(obj==null)continue;long length=BitConverter.ToInt64(obj,16);if(length<1||length>1024)continue;var blob=Read(h,BitConverter.ToInt64(obj,8),(int)length);if(blob==null)continue;for(int k=0;k<blob.Length;k++)blob[k]^=mask[k%mask.Length];
     foreach(Match m in Regex.Matches(Encoding.ASCII.GetString(blob),"[xX]'([0-9a-fA-F]{64,192})'")){string run=m.Groups[1].Value;for(int offset=0;offset+64<=run.Length;offset+=32){string hex=run.Substring(offset,64).ToLowerInvariant();if(!tested.Add(hex))continue;byte[] enc=Decode(hex);foreach(var page in pages){if(!found.ContainsKey(page.Key)&&Verify(enc,page.Value))found[page.Key]=hex;}if(found.Count==pages.Count){Array.Clear(blob,0,blob.Length);return found;}}}
     Array.Clear(blob,0,blob.Length);
   }}
  }finally{CloseHandle(h);}}
  return found;
 }
 public static Dictionary<string,string> Scan(int[] pids,string[] salts,Dictionary<string,byte[]> pages){
  var allowed=new HashSet<string>(salts,StringComparer.OrdinalIgnoreCase);var found=new Dictionary<string,string>();var watch=Stopwatch.StartNew();
  foreach(int pid in pids){
   // Only query and read; no write, injection, remote thread, or full memory dump.
   IntPtr h=OpenProcess(0x410,false,pid);if(h==IntPtr.Zero)continue;Opens++;
   try{long address=0;long scanned=0;Region region;
    while(address<0x7fffffffffff && watch.Elapsed.TotalSeconds<100 && scanned<4L*1024*1024*1024){
     if(VirtualQueryEx(h,new IntPtr(address),out region,(UIntPtr)Marshal.SizeOf(typeof(Region))).ToUInt64()==0)break;
     long length=(long)region.Size.ToUInt64(),start=region.Base.ToInt64();if(length<=0||start+length<=address)break;address=start+length;
     if(region.State!=0x1000 || region.Type!=0x20000 || (region.Protect&0x100)!=0 || (region.Protect&0xEE)==0)continue;Regions++;
     for(long offset=0;offset<length;offset+=1024*1024-128){
      int len=(int)Math.Min(1024*1024,length-offset);var bytes=new byte[len];UIntPtr read;
      ReadProcessMemory(h,new IntPtr(start+offset),bytes,(UIntPtr)len,out read);int n=(int)read.ToUInt64();scanned+=n;Bytes+=n;
      for(int i=0;i+98<n;i++){
       if(bytes[i]!=120||bytes[i+1]!=39)continue;if(bytes[i+66]==39){bool valid=true;for(int k=2;k<66;k++)if(!Hex(bytes[i+k])){valid=false;break;}if(valid){Hex64++;byte[] candidate=Decode(Encoding.ASCII.GetString(bytes,i+2,64));foreach(var pair in pages){if(found.ContainsKey(pair.Key))continue;byte[] enc=candidate;if(!Verify(enc,pair.Value)){using(var kdf=new Rfc2898DeriveBytes(candidate,Decode(pair.Key),256000,HashAlgorithmName.SHA512))enc=kdf.GetBytes(32);}if(Verify(enc,pair.Value))found[pair.Key]=BitConverter.ToString(enc).Replace("-","").ToLowerInvariant();}}}if(bytes[i+98]!=39)continue;bool ok=true;for(int k=2;k<98;k++){if(!Hex(bytes[i+k])){ok=false;break;}}if(!ok)continue;Hex96++;
       string salt=Encoding.ASCII.GetString(bytes,i+66,32).ToLowerInvariant();if(allowed.Contains(salt))found[salt]=Encoding.ASCII.GetString(bytes,i+2,64).ToLowerInvariant();
      }
      Array.Clear(bytes,0,bytes.Length);if(found.Count==allowed.Count)return found;if(watch.Elapsed.TotalSeconds>100)break;
     }
    }
   }finally{CloseHandle(h);}
  }
  return found;
 }
}
'@
$pids=@(Get-Process Weixin -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -ExpandProperty Id)
if($pids.Count -eq 0){throw 'Please log into WeChat first'}
$keys=[ShiguangReadOnlyKeys]::ConfigScan([int[]]$pids,$pageMap)
if($keys.Count -eq 0){$keys=[ShiguangReadOnlyKeys]::Scan([int[]]$pids,[string[]]$salts,$pageMap)}
if($keys.Count -eq 0){@{ok=$false;matched=0;processes=$pids.Count;opened=[ShiguangReadOnlyKeys]::Opens;regions=[ShiguangReadOnlyKeys]::Regions;bytes=[ShiguangReadOnlyKeys]::Bytes;hex64=[ShiguangReadOnlyKeys]::Hex64;hex96=[ShiguangReadOnlyKeys]::Hex96}|ConvertTo-Json -Compress;exit 2}
$json=$keys | ConvertTo-Json -Compress
$sealed=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($json),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($Vault,$sealed)
@{ok=$true;matched=$keys.Count;required=($salts|Select-Object -Unique).Count} | ConvertTo-Json -Compress
