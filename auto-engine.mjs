import {existsSync,mkdirSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {discover,isPromotional} from './wechat-reader.mjs';
import {localStamp} from './extract.mjs';
export class AutoEngine{
 constructor({db,root,data,analyzeImport,classify,model}){Object.assign(this,{db,root,data,analyzeImport,classify,model});this.busy=false;this.scanning=false;this.connecting=false;this.lastScan=0;this.lastConnect=0;this.lastError='';this.phase='idle';this.timer=null;
  db.exec(`CREATE TABLE IF NOT EXISTS auto_jobs(id TEXT PRIMARY KEY,account TEXT,group_id TEXT,group_name TEXT,text TEXT,sent_at INTEGER,score INTEGER,content_hash TEXT,status TEXT DEFAULT 'queued',attempts INTEGER DEFAULT 0,next_attempt INTEGER DEFAULT 0,error TEXT DEFAULT '',source_id TEXT,created_at TEXT);
  CREATE INDEX IF NOT EXISTS auto_jobs_status ON auto_jobs(status,next_attempt,sent_at);
  CREATE TABLE IF NOT EXISTS wechat_groups(id TEXT PRIMARY KEY,name TEXT,last_time INTEGER,scanned INTEGER DEFAULT 0,candidates INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS auto_settings(key TEXT PRIMARY KEY,value TEXT);`);
  this.config=this.get('config',{enabled:false,root:'',account:'',scope:'all',selectedGroups:[],days:7,autoConfirm:false});
  db.exec("UPDATE auto_jobs SET status='queued' WHERE status='classifying'; UPDATE auto_jobs SET status='extract' WHERE status='extracting';");
 }
 get(k,f){const r=this.db.prepare('SELECT value FROM auto_settings WHERE key=?').get(k);return r?JSON.parse(r.value):f;}
 set(k,v){this.db.prepare('INSERT OR REPLACE INTO auto_settings VALUES(?,?)').run(k,JSON.stringify(v));}
 runScript(script,args=[],timeout=120000){return new Promise((res,rej)=>{execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(this.root,script),...args],{windowsHide:true,encoding:'utf8',timeout,maxBuffer:1024*1024},(e,out)=>{if(e){rej(Error('无法连接当前账号，请确认微信已登录并重试'));return;}try{res(JSON.parse(out.trim().replace(/^\uFEFF/,'')))}catch{rej(Error('客户端连接返回格式异常'));}});});}
 state(){const counts={};for(const row of this.db.prepare('SELECT status,count(*) as count FROM auto_jobs GROUP BY status').all())counts[row.status]=row.count;
  return {config:this.config,phase:this.phase,connecting:this.connecting,scanning:this.scanning,processing:this.busy,lastError:this.lastError,lastScan:this.get('lastScan',null),stats:this.get('stats',{scanned:0,unsupported:0}),counts,groups:this.db.prepare('SELECT * FROM wechat_groups ORDER BY candidates DESC,last_time DESC').all(),recent:this.db.prepare("SELECT group_name,sent_at,status,error,source_id FROM auto_jobs WHERE status IN ('done','failed') ORDER BY rowid DESC LIMIT 12").all()};
 }
 configure(b){
  const next={...this.config};for(const k of ['enabled','root','account','scope','selectedGroups','days','autoConfirm'])if(k in b)next[k]=b[k];
  next.root=String(next.root||'').trim();next.days=Number(next.days);next.enabled=!!next.enabled;next.autoConfirm=!!next.autoConfirm;
  if(!next.root||next.root.length>500||!Number.isInteger(next.days)||next.days<1||next.days>90||!['all','selected'].includes(next.scope)||!Array.isArray(next.selectedGroups))throw Error('请填写有效目录、1–90 天范围和群聊选择');
  if(next.scope==='selected'&&next.selectedGroups.length===0)throw Error('请至少选择一个群聊');
  if((this.scanning||this.connecting)&&!(Object.keys(b).length===1&&b.enabled===false))throw Error('正在读取微信，请等本轮完成后再保存');
  if(next.root!==this.config.root||next.account!==this.config.account){this.set('cursors',{});this.db.exec('DELETE FROM wechat_groups');}
  if(next.days!==this.config.days)this.set('cursors',{});
  this.config=next;this.set('config',next);this.lastScan=0;this.lastError='';this.phase=next.enabled?'waiting':'paused';return this.state();
 }
 async connect(){
  if(this.connecting)return;this.connecting=true;this.lastConnect=Date.now();this.phase='connecting';this.lastError='';
  try{const accounts=discover(this.config.root);if(!accounts.length)throw Error('目录下未找到微信 db_storage，请检查聊天记录路径');
   if(accounts.length>1&&!this.config.account)throw Error('目录中有多个账号，请指定账号子目录后连接');
   const account=accounts.find(a=>a.id===this.config.account)||accounts[0];
   await this.runScript('open-wechat.ps1');
   const r=await this.runScript('wechat-vault.ps1',['-Mode','scan','-DbDir',account.path,'-Vault',join(this.data,'wechat-keys.dpapi')]);
   if(!r.ok||r.matched<r.required)throw Error('还没有取得完整的数据库访问材料，请在微信完成登录后重试');
   this.config.account=account.id;this.set('config',this.config);this.phase='connected';this.lastScan=0;
  }catch(e){this.lastError=e.message;this.phase='needs_login';throw e;}finally{this.connecting=false;}
 }
 async scan(){
  if(this.scanning||this.connecting)return;this.scanning=true;this.phase='scanning';this.lastError='';
  const dir=join(this.data,'auto-work');mkdirSync(dir,{recursive:true});const input=join(dir,'input.json'),output=join(dir,'scan.json');
  try{
   if(!existsSync(join(this.data,'wechat-keys.dpapi')))throw Error('尚未连接微信，请点击连接并同步');
   writeFileSync(input,JSON.stringify({...this.config,data:this.data,output,since:Math.floor(Date.now()/1000)-this.config.days*86400,cursors:this.get('cursors',{})}));
   const result=await new Promise((res,rej)=>execFile(process.execPath,[join(this.root,'wechat-reader.mjs'),input],{windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:1024*1024},(e,out)=>{try{const r=JSON.parse(out.trim());if(!r.ok)throw Error(r.error);if(e)throw e;res(r);}catch(err){rej(Error(err.message||'微信读取失败'));}}));
   const r=JSON.parse(readFileSync(output,'utf8'));this.db.exec('BEGIN');
   try{for(const g of r.groups)this.db.prepare('INSERT INTO wechat_groups VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,last_time=excluded.last_time,scanned=scanned+excluded.scanned,candidates=candidates+excluded.candidates').run(g.id,g.name,g.lastTime,g.scanned,g.candidates);
    for(const m of r.items){const day=localStamp(new Date(m.sentAt*1000)).slice(0,10),hash=createHash('sha256').update(m.text.replace(/\s/g,'')+'|'+day).digest('hex');this.db.prepare('INSERT OR IGNORE INTO auto_jobs(id,account,group_id,group_name,text,sent_at,score,content_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(m.id,r.account,m.groupId,m.groupName,m.text,m.sentAt,m.score,hash,localStamp());}
    this.set('cursors',r.cursors);const stats=this.get('stats',{scanned:0,unsupported:0});stats.scanned+=r.scanned;stats.unsupported+=r.unsupported;this.set('stats',stats);this.set('lastScan',localStamp());this.db.exec('COMMIT');
   }catch(e){this.db.exec('ROLLBACK');throw e;}
   this.lastScan=r.more?0:Date.now();this.phase='watching';try{unlinkSync(output);}catch{}return result;
  }catch(e){this.lastError=e.message;this.lastScan=Date.now();this.phase='error';throw e;}finally{this.scanning=false;}
 }
 async tick(){
  if(!this.config.enabled||this.connecting)return;
  if(Date.now()-(this.lastProcessCheck||0)>15000){this.lastProcessCheck=Date.now();try{const s=await this.runScript('wechat-status.ps1',[],5000);this.clientRunning=s.running;}catch{this.clientRunning=false;}}
  if(!this.clientRunning){this.phase='waiting_client';return;}
  if(!existsSync(join(this.data,'wechat-keys.dpapi'))||/密钥已变化|尚未连接/.test(this.lastError)){if(Date.now()-this.lastConnect>60000)await this.connect().catch(()=>{});return;}
  if(!this.scanning&&Date.now()-this.lastScan>60000)this.scan().catch(()=>{});
  const modelState=this.model();if(this.busy||!['ready','rules'].includes(modelState.state)||modelState.busy)return;
  this.busy=true;let current=[];
  try{
   const scope=this.config.scope==='selected'?new Set(this.config.selectedGroups):null;
   const selected=scope?[...scope]:[];
   const eligible=this.db.prepare("SELECT * FROM auto_jobs WHERE account=? AND status IN ('queued','extract') AND next_attempt<=?"+(scope?' AND group_id IN ('+selected.map(()=>'?').join(',')+')':'')+" ORDER BY (status='extract') DESC,sent_at DESC LIMIT 300").all(this.config.account,Date.now(),...selected);
   for(const j of eligible)if(isPromotional(j.text,j.group_name))this.db.prepare("UPDATE auto_jobs SET status='ignored',error='已过滤招聘或推广信息' WHERE id=?").run(j.id);
   const clean=eligible.filter(j=>!isPromotional(j.text,j.group_name));
   const job=clean.find(j=>j.status==='extract');
   if(job){current=[job];
    const dup=this.db.prepare("SELECT source_id FROM auto_jobs WHERE content_hash=? AND status='done' AND id!=? LIMIT 1").get(job.content_hash,job.id);
    if(dup){this.db.prepare("UPDATE auto_jobs SET status='duplicate',source_id=? WHERE id=?").run(dup.source_id,job.id);return;}
    this.db.prepare("UPDATE auto_jobs SET status='extracting' WHERE id=?").run(job.id);
    const result=await this.analyzeImport({text:job.text,source:'微信 · '+job.group_name,sentAt:localStamp(new Date(job.sent_at*1000)),mode:modelState.state==='rules'?'rules':'model'});
    this.db.prepare("UPDATE auto_jobs SET status='done',source_id=?,error='' WHERE id=?").run(result.sourceId,job.id);
    if(this.config.autoConfirm){const events=this.db.prepare("SELECT * FROM events WHERE source_id=? AND action='new' AND status='pending' AND date IS NOT NULL AND time IS NOT NULL").all(result.sourceId);for(const e of events){if(+new Date(e.date+'T'+e.time)>Date.now()&&!/(待定|不明确|歧义|不确定)/.test(e.notes||''))this.db.prepare("UPDATE events SET status='confirmed',updated_at=? WHERE id=?").run(localStamp(),e.id);}}
   }else{
    const batch=clean.filter(j=>j.status==='queued').slice(0,10);if(!batch.length)return;current=batch;
    for(const j of batch)this.db.prepare("UPDATE auto_jobs SET status='classifying' WHERE id=?").run(j.id);
    const decisions=modelState.state==='rules'?batch.map((_,id)=>({id,relevant:true})):await this.classify(batch);
    for(let i=0;i<batch.length;i++){const d=decisions.find(x=>x.id===i);if(!d||typeof d.relevant!=='boolean')throw Error('模型筛选结果不完整，稍后重试');}
    for(let i=0;i<batch.length;i++){const d=decisions.find(x=>x.id===i);this.db.prepare('UPDATE auto_jobs SET status=?,error=? WHERE id=?').run(d.relevant?'extract':'ignored','',batch[i].id);}
   }
  }catch(e){for(const j of current)this.db.prepare('UPDATE auto_jobs SET status=?,attempts=attempts+1,next_attempt=?,error=? WHERE id=?').run(j.attempts>=2?'failed':j.status,Date.now()+30000*(j.attempts+1),String(e.message).slice(0,300),j.id);this.lastError=e.message;
  }finally{this.busy=false;}
 }
 retry(){this.db.exec("UPDATE auto_jobs SET status='queued',attempts=0,next_attempt=0,error='' WHERE status='failed'");this.lastError='';}
 start(){this.timer=setInterval(()=>this.tick().catch(e=>this.lastError=e.message),1200);this.tick().catch(()=>{});}
 stop(){clearInterval(this.timer);}
}
