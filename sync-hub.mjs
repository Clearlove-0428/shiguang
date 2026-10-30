import {accountInfo} from './account-info.mjs';
import {accountProgress} from './scan-progress.mjs';
import {dismissPending} from './notice-filter.mjs';
import {existsSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {discover} from './wechat-reader.mjs';
import {discoverQQ} from './qq-reader.mjs';
import {localStamp} from './extract.mjs';
import {discoverStorage,inspectStorage,discoveryChoice} from './storage-discovery.mjs';
export class SyncHub{
 constructor({db,root,data,enqueue}){Object.assign(this,{db,root,data,enqueue});this.busy=false;this.lastScan={};this.status={};this.timer=null;this.discovery={phase:'idle',platforms:{wechat:[],qq:[]}};this.lastDiscovery=0;this.stopped=false;
  db.exec(`CREATE TABLE IF NOT EXISTS sync_settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE IF NOT EXISTS sync_groups(platform TEXT,account TEXT,id TEXT,name TEXT,active INTEGER DEFAULT 1,scanned INTEGER DEFAULT 0,candidates INTEGER DEFAULT 0,PRIMARY KEY(platform,account,id));CREATE TABLE IF NOT EXISTS sync_ignored(platform TEXT,account TEXT,id TEXT,PRIMARY KEY(platform,account,id));CREATE TABLE IF NOT EXISTS sync_seen(platform TEXT,account TEXT,id TEXT,PRIMARY KEY(platform,account,id));`);
  db.exec('CREATE TABLE IF NOT EXISTS sync_activity(platform TEXT,account TEXT,id TEXT,last_time INTEGER,PRIMARY KEY(platform,account,id))');
  const old=db.prepare("SELECT name FROM sqlite_master WHERE name='auto_settings'").get()?JSON.parse(db.prepare("SELECT value FROM auto_settings WHERE key='config'").get()?.value||'{}'):{};
  this.freshConfig=!this.get('config',null);
  this.config=this.get('config',{wechat:{root:old.root||'',accounts:old.account?[old.account]:[],enabled:old.enabled??false,days:old.days||7},qq:{root:join(process.env.USERPROFILE||'','Documents','Tencent Files'),accounts:[],enabled:false,days:7}});
  if(!this.get('migrated',false)){if(db.prepare("SELECT name FROM sqlite_master WHERE name='auto_jobs'").get()){db.exec("INSERT OR IGNORE INTO sync_seen SELECT 'wechat',account,id FROM auto_jobs");if(old.account){const cursors=db.prepare("SELECT value FROM auto_settings WHERE key='cursors'").get();if(cursors)this.set('cursor:wechat:'+old.account,JSON.parse(cursors.value));const oldVault=join(data,'wechat-keys.dpapi'),newVault=this.vault('wechat',old.account);if(existsSync(oldVault)&&!existsSync(newVault))copyFileSync(oldVault,newVault);}}this.set('migrated',true);}
 }
 get(k,f){const r=this.db.prepare('SELECT value FROM sync_settings WHERE key=?').get(k);return r?JSON.parse(r.value):f;}
 set(k,v){this.db.prepare('INSERT OR REPLACE INTO sync_settings VALUES(?,?)').run(k,JSON.stringify(v));}
 accounts(p){try{return(p==='qq'?discoverQQ:discover)(this.config[p].root);}catch{return[];}}
 setAccountLabel(p,id,note){if(!['wechat','qq'].includes(p)||typeof id!=='string'||typeof note!=='string'||note.trim().length>40||!this.accounts(p).some(a=>a.id===id))throw Error('请选择本目录中的账号，备注最多40字');this.set('account-label:'+p+':'+id,note.trim());return this.state();}
 vault(p,a){return join(this.data,p==='qq'?`qq-${a}.dpapi`:`wx-${createHash('sha256').update(a).digest('hex').slice(0,16)}.dpapi`);}
 configure(p,b){if(!['qq','wechat'].includes(p))throw Error('平台无效');const next={...this.config[p],...b};if(typeof next.root!=='string'||next.root.length>500||!Array.isArray(next.accounts)||next.accounts.some(a=>typeof a!=='string'||a.length>150)||!Number.isInteger(Number(next.days))||next.days<1||next.days>90)throw Error('目录、账号或天数无效');next.days=Number(next.days);next.enabled=!!next.enabled;if(this.busy)throw Error('正在读取本轮消息，请稍后保存');if(next.root!==this.config[p].root||next.days!==this.config[p].days)for(const a of next.accounts)this.set('cursor:'+p+':'+a,{});this.freshConfig=false;this.config[p]=next;this.set('config',this.config);this.lastScan={};return this.state();}
 group(p,a,id,ignored){if(!['qq','wechat'].includes(p)||typeof a!=='string'||typeof id!=='string')throw Error('平台或群聊无效');let dismissed=0;this.db.exec('BEGIN');try{if(ignored){this.db.prepare('INSERT OR IGNORE INTO sync_ignored VALUES(?,?,?)').run(p,a,id);if(this.db.prepare("SELECT name FROM sqlite_master WHERE name='events'").get()){const rows=this.db.prepare("SELECT e.id FROM events e JOIN sources s ON s.id=e.source_id WHERE e.status='pending' AND s.platform=? AND s.account=? AND s.group_id=?").all(p,a,id);dismissed=dismissPending(this.db,rows,'来源群已停止关注');}}else this.db.prepare('DELETE FROM sync_ignored WHERE platform=? AND account=? AND id=?').run(p,a,id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return{ok:true,dismissed};}

 groupsBatch(groups,ignored){if(!Array.isArray(groups)||!groups.length||groups.length>3000||typeof ignored!=='boolean')throw Error('请选择有效会话');const unique=[...new Map(groups.map(g=>[JSON.stringify([g.platform,g.account,g.id]),g])).values()];for(const g of unique){if(!['qq','wechat'].includes(g.platform)||typeof g.account!=='string'||typeof g.id!=='string'||!this.db.prepare('SELECT 1 FROM sync_groups WHERE platform=? AND account=? AND id=?').get(g.platform,g.account,g.id))throw Error('会话不存在，请刷新列表');}let dismissed=0;this.db.exec('BEGIN');try{for(const g of unique){if(ignored){this.db.prepare('INSERT OR IGNORE INTO sync_ignored VALUES(?,?,?)').run(g.platform,g.account,g.id);if(this.db.prepare("SELECT name FROM sqlite_master WHERE name='events'").get()){const rows=this.db.prepare("SELECT e.id FROM events e JOIN sources s ON s.id=e.source_id WHERE e.status='pending' AND s.platform=? AND s.account=? AND s.group_id=?").all(g.platform,g.account,g.id);dismissed+=dismissPending(this.db,rows,'来源会话已停止关注');}}else this.db.prepare('DELETE FROM sync_ignored WHERE platform=? AND account=? AND id=?').run(g.platform,g.account,g.id);}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return{ok:true,count:unique.length,dismissed};}
 allowed(m){if(!m.platform||!m.account||!m.groupId)return true;return !this.db.prepare('SELECT 1 FROM sync_ignored WHERE platform=? AND account=? AND id=?').get(m.platform,m.account,m.groupId)&&this.db.prepare('SELECT active FROM sync_groups WHERE platform=? AND account=? AND id=?').get(m.platform,m.account,m.groupId)?.active===1;}
 progress(){const platforms={};for(const p of ['wechat','qq']){platforms[p]={};for(const account of this.config[p].accounts){const s=this.status[p]?.[account]||this.get('stats:'+p+':'+account,{});platforms[p][account]=accountProgress(this.db,p,account,s,this.get('run-jobs:'+p+':'+account,[]),this.config[p].enabled);}}return{platforms,busy:this.busy};}
 state(){const platforms={};for(const p of ['wechat','qq'])platforms[p]={config:this.config[p],accounts:this.accounts(p).map(a=>accountInfo(p,a,this.data,this.get('account-label:'+p+':'+a.id,''))),status:this.status[p]||{},groups:this.db.prepare('SELECT g.*,COALESCE((SELECT a.last_time FROM sync_activity a WHERE a.platform=g.platform AND a.account=g.account AND a.id=g.id),0) last_time,EXISTS(SELECT 1 FROM sync_ignored i WHERE i.platform=g.platform AND i.account=g.account AND i.id=g.id) ignored FROM sync_groups g WHERE platform=? ORDER BY active DESC,candidates DESC,name').all(p)};return{platforms,busy:this.busy,discovery:this.discovery,progress:this.progress()};}
 run(exe,args,timeout=120000){return new Promise((res,rej)=>execFile(exe,args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024},(e,out)=>{try{const j=JSON.parse(out.trim().replace(/^\uFEFF/,''));if(e||j.ok===false)throw Error(j.error||'请确认对应账号已登录，再重新连接');res(j);}catch(err){rej(Error(err.message||'读取失败'));}}));}
 async scan(p,account){const c=this.config[p],key=p+':'+account.id,vault=this.vault(p,account.id);this.status[p]={...this.status[p],[account.id]:{phase:'scanning',step:'connecting',startedAt:Date.now(),message:'正在连接客户端'}};
  try{
   if(!existsSync(vault)||this.get('reconnect:'+key,false)){await this.run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(this.root,p==='qq'?'qq-vault.ps1':'wechat-vault.ps1'),'-DbDir',account.path,'-Vault',vault]);this.set('reconnect:'+key,false);}
   this.status[p][account.id]={...this.status[p][account.id],step:'reading',message:'正在读取聊天记录'};
   const work=join(this.data,'sync-work');mkdirSync(work,{recursive:true});const suffix=createHash('sha256').update(key).digest('hex').slice(0,16),input=join(work,suffix+'.input.json'),output=join(work,suffix+'.output.json');writeFileSync(input,JSON.stringify({root:c.root,account:account.id,data:this.data,vault,since:Math.floor(Date.now()/1000)-c.days*86400,cursors:this.get('cursor:'+key,{}),scope:'all',includePrivate:c.includePrivate!==false,output}));
   await this.run(process.execPath,[join(this.root,p==='qq'?'qq-reader.mjs':'wechat-reader.mjs'),input],90000);const r=JSON.parse(readFileSync(output,'utf8'));
   // Only a successful complete group snapshot can mark old groups absent.
   this.db.exec('BEGIN');try{this.db.prepare('UPDATE sync_groups SET active=0 WHERE platform=? AND account=?').run(p,account.id);for(const g of r.groups)this.db.prepare('INSERT INTO sync_groups VALUES(?,?,?,?,1,?,?) ON CONFLICT(platform,account,id) DO UPDATE SET name=excluded.name,active=1,scanned=scanned+excluded.scanned,candidates=candidates+excluded.candidates').run(p,account.id,g.id,g.name,g.scanned,g.candidates);for(const g of r.groups){if(g.lastTime>0)this.db.prepare('INSERT INTO sync_activity VALUES(?,?,?,?) ON CONFLICT(platform,account,id) DO UPDATE SET last_time=MAX(last_time,excluded.last_time)').run(p,account.id,g.id,Math.floor(g.lastTime));}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
   const batchJobs=[];
   for(const m of r.items.sort((a,b)=>Number(b.conversationType==='private')-Number(a.conversationType==='private'))){const payload={externalMessageId:m.id,text:m.text,sentAt:localStamp(new Date(m.sentAt*1000)),source:`${p==='qq'?'QQ':'微信'} · ${account.id} · ${m.groupName}`.slice(0,100),platform:p,account:account.id,groupId:m.groupId,groupName:m.groupName,conversationType:m.conversationType||'group'};if(this.allowed(payload))this.capture?.(payload);if(this.db.prepare('SELECT 1 FROM sync_seen WHERE platform=? AND account=? AND id=?').get(p,account.id,m.id))continue;if(this.allowed(payload)){this.enqueue([payload]);batchJobs.push(createHash('sha256').update(JSON.stringify(payload)).digest('hex'));}this.db.prepare('INSERT OR IGNORE INTO sync_seen VALUES(?,?,?)').run(p,account.id,m.id);}
   if(batchJobs.length){const previous=this.get('run-jobs:'+key,[]),pending=this.db.prepare("SELECT name FROM sqlite_master WHERE name='file_jobs'").get()?this.db.prepare("SELECT id FROM file_jobs WHERE json_extract(payload,'$.platform')=? AND json_extract(payload,'$.account')=? AND status IN ('queued','processing','failed')").all(p,account.id).map(x=>x.id):previous;this.set('run-jobs:'+key,[...new Set([...pending,...batchJobs])]);}
   this.set('cursor:'+key,r.cursors);this.lastScan[key]=r.more?0:Date.now();const previous=this.get('stats:'+key,{scanned:0,candidates:0});const status={phase:'watching',lastScan:localStamp(),scanned:previous.scanned+r.scanned,candidates:previous.candidates+r.items.length,groups:r.groups.length,more:!!r.more,readThisPass:r.scanned,startedAt:this.status[p][account.id].startedAt,message:'自动同步中'};this.set('stats:'+key,status);this.status[p][account.id]=status;try{unlinkSync(output);}catch{}
  }catch(e){if(/访问材料|密钥|校验失败/.test(e.message))this.set('reconnect:'+key,true);this.status[p][account.id]={phase:'error',message:e.message,lastScan:this.get('stats:'+key,{}).lastScan};this.lastScan[key]=Date.now();}
 }
 async tick(){if(this.busy)return;this.busy=true;try{for(const p of ['wechat','qq']){const c=this.config[p];if(!c.enabled)continue;for(const a of this.accounts(p).filter(a=>c.accounts.includes(a.id))){if(Date.now()-(this.lastScan[p+':'+a.id]||0)>60000)await this.scan(p,a);}}}finally{this.busy=false;}}
 async discoverDirectories(){
  if(this.discovery.phase==='searching')return this.discovery;
  if(process.env.SHIGUANG_NO_MODEL==='1'&&!process.env.SHIGUANG_DISCOVERY_ROOTS){this.discovery={...this.discovery,phase:'disabled',message:'隔离测试未启用本机目录发现'};return this.discovery;}
  const snapshots=JSON.parse(JSON.stringify(this.config)),fresh=this.freshConfig;
  this.discovery={...this.discovery,phase:'searching',message:'正在本机寻找聊天记录目录'};this.lastDiscovery=Date.now();this.discoveryAbort=new AbortController();
  try{
   let locations;
   if(process.env.SHIGUANG_DISCOVERY_ROOTS){const roots=JSON.parse(process.env.SHIGUANG_DISCOVERY_ROOTS);locations={direct:roots,search:roots};}
   else if(process.env.SHIGUANG_NO_MODEL==='1')locations={direct:[],search:[]};
   const result=await discoverStorage({configured:locations&&process.env.SHIGUANG_NO_MODEL==='1'?{}:snapshots,locations,signal:this.discoveryAbort.signal});
   if(this.stopped)return this.discovery;
   const outcomes={};
   for(const p of['wechat','qq']){
    if(JSON.stringify(this.config[p])!==JSON.stringify(snapshots[p])||this.busy){outcomes[p]='已保留当前设置';continue;}
    const valid=process.env.SHIGUANG_NO_MODEL==='1'&&fresh?null:await inspectStorage(snapshots[p].root,p);let next=null;
    if(this.stopped)return this.discovery;
    if(JSON.stringify(this.config[p])!==JSON.stringify(snapshots[p])||this.busy){outcomes[p]='已保留当前设置';continue;}
    if(valid){if(fresh&&!snapshots[p].accounts.length&&valid.accounts.length===1)next={...snapshots[p],accounts:valid.accounts};outcomes[p]='已找到当前目录';}
    else{next=discoveryChoice(snapshots[p],result.platforms[p]);outcomes[p]=next?'已自动找到目录':result.platforms[p].length?'找到多个目录或不同账号，请选择':'暂未找到，可手动填写目录';}
    if(next){this.config[p]=next;this.lastScan={};outcomes[p]=next.accounts.length?'目录和账号已就绪': '已找到目录，请选择主账号';}
   }
   if(this.stopped)return this.discovery;
   this.set('config',this.config);this.freshConfig=false;this.discovery={...result,phase:'done',outcomes};
  }catch{if(!this.stopped)this.discovery={...this.discovery,phase:'error',message:'本轮查找未完成，可重新查找或手动填写目录'};}
  return this.discovery;
 }
 start(){this.stopped=false;this.discoverDirectories().catch(()=>{});this.discoveryTimer=setInterval(()=>{if(['wechat','qq'].some(p=>!this.accounts(p).length)&&Date.now()-this.lastDiscovery>300000)this.discoverDirectories().catch(()=>{});},30000);this.timer=setInterval(()=>this.tick().catch(()=>{}),5000);this.tick().catch(()=>{});}
 stop(){this.stopped=true;this.discoveryAbort?.abort();clearInterval(this.timer);clearInterval(this.discoveryTimer);}
}

