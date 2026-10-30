// Local directory metadata only. Never reads messages, credentials or database contents.
import {readdir,stat,readFile,realpath} from 'node:fs/promises';
import {join,resolve,basename,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const skip=/^(Windows|Program Files(?: \(x86\))?|ProgramData|AppData|node_modules|\.git|\.codex|\.agents|\$.*|System Volume Information|Recovery|backups|sync-work)$/i;
const folderKey=p=>resolve(p).replace(/[\\/]+$/,'').toLowerCase();
const entries=async p=>{try{return await readdir(p,{withFileTypes:true});}catch{return[];}};
const isFile=async p=>{try{return(await stat(p)).isFile();}catch{return false;}};
async function accountAt(p,platform){
 if(platform==='qq')return /^\d+$/.test(basename(p))&&await isFile(join(p,'nt_qq','nt_db','nt_msg.db'));
 return (await entries(join(p,'db_storage','message'))).some(f=>f.isFile()&&/^message_\d+\.db$/.test(f.name));
}
export async function inspectStorage(root,platform){
 if(!root||typeof root!=='string')return null;
 root=resolve(root);let accounts=[];
 if(platform==='wechat'&&basename(root).toLowerCase()==='db_storage')root=dirname(root);
 if(await accountAt(root,platform))return{root,accounts:[basename(root)]};
 for(const d of await entries(root))if(d.isDirectory()&&!d.isSymbolicLink()&&await accountAt(join(root,d.name),platform))accounts.push(d.name);
 return accounts.length?{root,accounts:accounts.sort()}:null;
}
export async function defaultLocations(){
 const profile=process.env.USERPROFILE||'',appData=process.env.APPDATA||'',direct=[],search=[];
 let known={};
 if(process.platform==='win32')known=await new Promise(res=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./storage-locations.ps1',import.meta.url))],{windowsHide:true,timeout:5000,encoding:'utf8',maxBuffer:64000},(err,out)=>{try{res(err?{}:JSON.parse(out.trim().replace(/^\uFEFF/,'')));}catch{res({});}}));
 const bases=[join(profile,'Documents'),...(known.documents?[known.documents]:[]),...(known.drives||[])];
 for(const p of bases){search.push(p);for(const n of['xwechat_files','WeChat Files','Tencent Files','QQNT'])direct.push(join(p,n));}
 for(const p of known.paths||[])if(typeof p==='string'&&/^[A-Za-z]:[\\/]/.test(p)){
  direct.push(p,...['xwechat_files','WeChat Files','Tencent Files'].map(n=>join(p,n)));search.push(p);
 }
 // Client path preferences are tiny INIs; extract absolute directory paths only.
 for(const conf of[join(appData,'Tencent','WeChat','All Users','config'),join(appData,'Tencent','xwechat','config')]){
  for(const f of await entries(conf))if(f.isFile()&&/\.ini$/i.test(f.name)){
   try{const p=join(conf,f.name),s=await stat(p);if(s.size>4096)continue;const b=await readFile(p);
    for(const encoding of['utf8','utf16le'])for(const line of b.toString(encoding).split(/[\r\n\0]/)){
     const value=line.trim().replace(/^[^=\r\n]*=/,'').replace(/^"|"$/g,'');
     if(/^[A-Za-z]:[\\/][^<>"|?*\x00-\x1f]+$/.test(value))direct.push(value,...['xwechat_files','WeChat Files','Tencent Files'].map(n=>join(value,n)));
    }
   }catch{}
  }
 }
 return{direct,search};
}
export async function discoverStorage({configured={},locations,signal,maxDirectories=5000,maxDepth=4,budgetMs=6000}={}){
 locations||=await defaultLocations();const started=Date.now(),results={wechat:[],qq:[]},visited=new Set();let checked=0,limited=false;
 const stopped=()=>signal?.aborted||Date.now()-started>=budgetMs||checked>=maxDirectories;
 const probe=async path=>{
  if(stopped()){limited=true;return;}const key=folderKey(path);if(visited.has(key))return;visited.add(key);checked++;
  for(const platform of['wechat','qq']){
   const found=await inspectStorage(path,platform);if(!found)continue;
   const canonical=folderKey(await realpath(found.root).catch(()=>found.root));
   if(!results[platform].some(x=>x.canonical===canonical))results[platform].push({...found,canonical});
  }
 };
 for(const path of [...Object.values(configured).map(c=>c?.root).filter(Boolean),...(locations.direct||[])])await probe(path);
 // Breadth first, fixed local drives only. Stop before traversing actual chat stores.
 if(!results.wechat.length||!results.qq.length){const queue=(locations.search||[]).map(p=>[p,0]),walked=new Set();
  while(queue.length&&!stopped()){
   const [path,depth]=queue.shift(),key=folderKey(path);if(walked.has(key))continue;walked.add(key);await probe(path);
   if(Object.values(results).flat().some(x=>folderKey(x.root)===key))continue;
   if(depth>=maxDepth){limited=true;continue;}
   for(const e of await entries(path))if(e.isDirectory()&&!e.isSymbolicLink()&&!skip.test(e.name))queue.push([join(path,e.name),depth+1]);
  }
  if(queue.length)limited=true;
 }
 // Collapse a discovered parent and its account subfolder into one choice.
 for(const p of['wechat','qq'])results[p]=results[p].filter(a=>!results[p].some(b=>a!==b&&a.canonical.startsWith(b.canonical+'\\')&&a.accounts.every(id=>b.accounts.includes(id)))).map(({canonical,...x})=>x);
 return{platforms:results,checked,limited,elapsedMs:Date.now()-started,completedAt:new Date().toISOString()};
}
export function discoveryChoice(current,candidates){
 // Call only after validating that the configured location is missing/unsupported.
 if(candidates.length!==1)return null;
 const candidate=candidates[0],previous=current.accounts||[];
 // Never replace an explicit account selection or silently add another account.
 if(previous.some(id=>!candidate.accounts.includes(id)))return null;
 return{...current,root:candidate.root,accounts:previous.length?previous:candidate.accounts.length===1?[candidate.accounts[0]]:[]};
}
