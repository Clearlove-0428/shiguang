import http from 'node:http';
import {networkInterfaces} from 'node:os';
import {networkChoices} from './mobile-addresses.mjs';
import {randomBytes,randomUUID,createHash,hkdfSync,createCipheriv,createDecipheriv} from 'node:crypto';
const b64=b=>Buffer.from(b).toString('base64url');
const bytes=s=>{if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid encoding');return Buffer.from(s,'base64url');};
const canonical=v=>JSON.stringify(v&&typeof v==='object'?(Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))]))):v);
const hash=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
const derived=(secret,id,direction)=>hkdfSync('sha256',bytes(secret),Buffer.from('shiguang-sync-v1'),Buffer.from(`${id}|${direction}`),32);
export function privateAddress(host){const p=host.replace(/^::ffff:/,'').split('.').map(Number);return /^\d+\.\d+\.\d+\.\d+$/.test(host.replace(/^::ffff:/,''))&&p.every(x=>x>=0&&x<=255)&&(p[0]===10||p[0]===127||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31);}
export function openEnvelope(secret,e,direction='request',requestNonce=''){
 if(e.v!==1||typeof e.id!=='string'||bytes(e.nonce).length!==12)throw Error('Invalid envelope');
 const raw=bytes(e.body);if(raw.length<16)throw Error('Invalid ciphertext');
 const cipher=createDecipheriv('aes-256-gcm',derived(secret,e.id,direction),bytes(e.nonce));
 cipher.setAAD(Buffer.from(`1|${e.id}|${direction}|${requestNonce}`));cipher.setAuthTag(raw.subarray(-16));
 return JSON.parse(Buffer.concat([cipher.update(raw.subarray(0,-16)),cipher.final()]).toString('utf8'));
}
export function sealEnvelope(secret,id,value,direction='response',requestNonce=''){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',derived(secret,id,direction),iv);cipher.setAAD(Buffer.from(`1|${id}|${direction}|${requestNonce}`));
 const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]);
 return {v:1,id,nonce:b64(iv),body:b64(body)};
}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('日期无效');}
function time(value){if(value!==null&&(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))throw Error('时间无效');}
export function validateWindow(w,d,t){if(w===null)return;if(!w||typeof w!=='object'||Array.isArray(w))throw Error('范围无效');date(w.startDate);date(w.endDate);time(w.startTime);time(w.endTime);if(w.endDate<w.startDate||(w.startDate===w.endDate&&w.startTime&&w.endTime&&w.endTime<w.startTime)||w.endDate!==d||w.endTime!==t)throw Error('范围终点必须与截止一致');}
function identifier(value){return typeof value==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(value);}
export class MobileBridge {
 constructor({db,events,updateEvent,importDocument,importStatus,port=43529,host='0.0.0.0',timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone}){
  this.importDocument=importDocument;this.importStatus=importStatus;
  this.db=db;this.events=events;this.updateEvent=updateEvent;this.port=port;this.host=host;this.timeZone=timeZone;this.server=null;this.active=false;this.error=null;
  for(const [field,type] of [['mobile_window','TEXT']])if(!db.prepare('PRAGMA table_info(events)').all().some(c=>c.name===field))db.exec(`ALTER TABLE events ADD COLUMN ${field} ${type}`);
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS mobile_devices(id TEXT PRIMARY KEY,secret TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL,last_seen TEXT,revoked INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS mobile_pairs(id TEXT PRIMARY KEY,secret TEXT NOT NULL,expires INTEGER NOT NULL,device_id TEXT,device_hash TEXT);
   CREATE TABLE IF NOT EXISTS mobile_replays(id TEXT,nonce TEXT,seen INTEGER NOT NULL,PRIMARY KEY(id,nonce));
   CREATE TABLE IF NOT EXISTS mobile_changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX IF NOT EXISTS mobile_changes_event ON mobile_changes(event_id,seq);
   CREATE TABLE IF NOT EXISTS mobile_operations(device_id TEXT,operation_id TEXT,request_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(device_id,operation_id));
   CREATE TRIGGER IF NOT EXISTS mobile_event_insert AFTER INSERT ON events BEGIN INSERT INTO mobile_changes(event_id) VALUES(NEW.id); END;
   CREATE TRIGGER IF NOT EXISTS mobile_event_update AFTER UPDATE OF title,date,time,status,focus,manual_schedule,mobile_window,evidence,source_id,action ON events BEGIN INSERT INTO mobile_changes(event_id) VALUES(NEW.id); END;
   CREATE TRIGGER IF NOT EXISTS mobile_event_delete AFTER DELETE ON events BEGIN INSERT INTO mobile_changes(event_id,deleted) VALUES(OLD.id,1); END;
   CREATE TRIGGER IF NOT EXISTS mobile_source_update AFTER UPDATE OF platform,account,group_id,group_name,sent_at,text ON sources BEGIN INSERT INTO mobile_changes(event_id) SELECT id FROM events WHERE source_id=NEW.id; END;`);
  if(!this.meta('serverId')){this.setMeta('serverId',randomUUID());db.exec('INSERT INTO mobile_changes(event_id) SELECT id FROM events');}
  this.serverId=this.meta('serverId');
  if(this.meta('timeZone')!==timeZone){db.exec('INSERT INTO mobile_changes(event_id) SELECT id FROM events');this.setMeta('timeZone',timeZone);}
 }
 meta(key){return this.db.prepare('SELECT value FROM mobile_meta WHERE key=?').get(key)?.value;}
 setMeta(key,value){this.db.prepare('INSERT OR REPLACE INTO mobile_meta VALUES(?,?)').run(key,String(value));}
 status(){const addressOptions=networkChoices(networkInterfaces(),this.port);return {enabled:this.meta('enabled')==='true',active:this.active,error:this.error,port:this.port,serverId:this.serverId,addresses:addressOptions.map(x=>x.origin),addressOptions,devices:this.db.prepare('SELECT id,name,created_at,last_seen,revoked FROM mobile_devices ORDER BY created_at DESC').all()};}
 async configure(enabled){
  if(!enabled){this.setMeta('enabled',false);this.stop();return this.status();}
  if(this.active)return this.status();
  const server=http.createServer((req,res)=>this.handle(req,res));this.server=server;
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=32;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(this.port,this.host,resolve);});this.active=true;this.error=null;this.setMeta('enabled',true);server.on('error',e=>{this.error=e.message;});}
  catch(e){this.error=e.message;this.server=null;throw Error('手机桥无法启动：'+e.message);}
  return this.status();
 }
 async start(){if(this.meta('enabled')==='true')try{await this.configure(true);}catch(e){this.error=e.message;}}
 stop(){this.active=false;if(this.server){this.server.close();this.server.closeAllConnections();this.server=null;}}
 invite(origin){
  if(!this.active)throw Error('请先开启手机局域网同步');
  if(!this.status().addresses.includes(origin))throw Error('请选择这台电脑的局域网地址');
  const id=randomUUID(),secret=b64(randomBytes(32)),expires=Date.now()+300000;
  this.db.prepare('DELETE FROM mobile_pairs WHERE expires<?').run(Date.now());
  this.db.prepare('INSERT INTO mobile_pairs(id,secret,expires) VALUES(?,?,?)').run(id,secret,expires);
  return {code:'shiguang-pair:'+b64(Buffer.from(JSON.stringify({v:1,origin,id,secret,serverId:this.serverId}))),expiresAt:new Date(expires).toISOString()};
 }
 revoke(id){this.db.prepare('UPDATE mobile_devices SET revoked=1 WHERE id=?').run(String(id));this.db.prepare('DELETE FROM mobile_pairs WHERE device_id=?').run(String(id));return {ok:true};}
 snapshot(){
  const revisions=new Map(this.db.prepare('SELECT event_id,MAX(seq) revision FROM mobile_changes GROUP BY event_id').all().map(x=>[x.event_id,x.revision]));
  return this.events().map(e=>{
   const w=e.mobile_window?JSON.parse(e.mobile_window):e.range_end&&e.date===e.range_end&&e.time===e.range_end_time?{startDate:e.range_start,startTime:e.range_start_time??null,endDate:e.range_end,endTime:e.range_end_time??null}:null;
   return {id:e.id,title:e.title,date:e.date??null,time:e.time??null,timeZone:this.timeZone,status:e.status,focus:!!e.focus,manualSchedule:!!e.manual_schedule,source:{id:e.source_id,platform:['wechat','qq','file','manual'].includes(e.platform)?e.platform:'file',accountId:e.account||null,conversationId:e.group_id||null,conversationName:e.group_name||e.source||'来源',conversationType:e.conversation_type==='private'?'private':['wechat','qq'].includes(e.platform)?'group':'file',sentAt:e.sent_at,evidence:e.evidence||''},...(w?{window:w}:{}),revision:revisions.get(e.id)};
  });
 }
 validateOperation(op,current){
  if(!identifier(op.operationId)||typeof op.eventId!=='string'||op.eventId.length>160||!Number.isSafeInteger(op.baseRevision)||op.baseRevision<1||!['edit','set-status','set-focus'].includes(op.kind)||!op.patch||typeof op.patch!=='object'||Array.isArray(op.patch))throw Error('操作格式无效');
  const p=op.patch,keys=Object.keys(p),allowed=op.kind==='edit'?['title','date','time','window']:op.kind==='set-status'?['status']:['focus'];
  if(!keys.length||keys.some(k=>!allowed.includes(k)))throw Error('操作包含不可修改字段');
  if('title'in p&&(typeof p.title!=='string'||!p.title.trim()||p.title.length>160))throw Error('标题须为1至160字');
  if('focus'in p&&typeof p.focus!=='boolean')throw Error('关注值无效');
  if('status'in p&&!['pending','confirmed','done','dismissed','cancelled'].includes(p.status))throw Error('状态无效');
  const d='date'in p?p.date:current?.date,t='time'in p?p.time:current?.time;
  if(d!==null&&d!==undefined)date(d);if(t!==undefined)time(t);if(t&&!d)throw Error('没有日期不能设置时刻');
  if((p.status??current?.status)==='confirmed'&&!d)throw Error('请先补充日期');
  if('window'in p)validateWindow(p.window,d,t);
 }
 sync(deviceId,request){
  const {cursor,operations=[]}=request;if(!Number.isSafeInteger(cursor)||cursor<0||!Array.isArray(operations)||operations.length>50)throw Error('同步请求无效');
  const db=this.db,results=[];db.exec('BEGIN IMMEDIATE');
  try{
   const top=db.prepare('SELECT COALESCE(MAX(seq),0) value FROM mobile_changes').get().value;if(cursor>top)throw Error('电脑记录已恢复到较早版本，请重新核对配对与离线修改');
   for(const op of operations){
    if(!identifier(op?.operationId))throw Error('operationId无效');
    const digest=hash(op),prior=db.prepare('SELECT request_hash,result FROM mobile_operations WHERE device_id=? AND operation_id=?').get(deviceId,op.operationId);
    if(prior){if(prior.request_hash!==digest)throw Error('operationId已用于不同内容');results.push(JSON.parse(prior.result));continue;}
    let current=this.snapshot().find(e=>e.id===op.eventId)??null,result;
    try{
     this.validateOperation(op,current);
     if(!current||current.revision!==op.baseRevision)result={operationId:op.operationId,eventId:op.eventId,status:'conflict',current,reason:current?'电脑与本机都修改了此事项，请核对':'电脑已移除此事项'};
     else{
      this.updateEvent(op.eventId,op.patch,true);
      current=this.snapshot().find(e=>e.id===op.eventId);
      result={operationId:op.operationId,eventId:op.eventId,status:'applied',current};
     }
    }catch(e){result={operationId:op.operationId,eventId:String(op.eventId??''),status:'rejected',current,reason:e.message};}
    db.prepare('INSERT INTO mobile_operations VALUES(?,?,?,?)').run(deviceId,op.operationId,digest,JSON.stringify(result));results.push(result);
   }
   const changed=new Set(db.prepare('SELECT DISTINCT event_id FROM mobile_changes WHERE seq>?').all(cursor).map(x=>x.event_id)),all=this.snapshot(),byId=new Map(all.map(e=>[e.id,e]));
   const response={serverId:this.serverId,cursor:db.prepare('SELECT COALESCE(MAX(seq),0) value FROM mobile_changes').get().value,changes:all.filter(e=>changed.has(e.id)),deleted:[...changed].filter(id=>!byId.has(id)),results};
   db.exec('COMMIT');return response;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 process(envelope){
  const db=this.db,pair=db.prepare('SELECT * FROM mobile_pairs WHERE id=? AND expires>?').get(envelope.id,Date.now()),device=db.prepare('SELECT * FROM mobile_devices WHERE id=? AND revoked=0').get(envelope.id),identity=pair||device;
  if(!identity)throw Error('Unauthorized');
  const payload=openEnvelope(identity.secret,envelope);
  if(!Number.isFinite(payload.sentAt)||Math.abs(Date.now()-payload.sentAt)>300000)throw Error('Unauthorized');
  db.prepare('DELETE FROM mobile_replays WHERE seen<?').run(Date.now()-600000);
  db.prepare('INSERT INTO mobile_replays VALUES(?,?,?)').run(envelope.id,envelope.nonce,Date.now());
  let result;
  try{
   if(pair){
    if(payload.action!=='pair'||!identifier(payload.deviceId)||bytes(payload.deviceSecret).length!==32||typeof payload.deviceName!=='string'||!payload.deviceName.trim()||payload.deviceName.length>80)throw Error('配对请求无效');
    if(pair.device_id&&(pair.device_id!==payload.deviceId||pair.device_hash!==hash(payload.deviceSecret)))throw Error('配对码已使用');
    db.exec('BEGIN IMMEDIATE');try{
     db.prepare('INSERT INTO mobile_devices(id,secret,name,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,name=excluded.name,revoked=0').run(payload.deviceId,payload.deviceSecret,payload.deviceName,new Date().toISOString());
     db.prepare('UPDATE mobile_pairs SET device_id=?,device_hash=? WHERE id=?').run(payload.deviceId,hash(payload.deviceSecret),pair.id);db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    result={serverId:this.serverId,deviceId:payload.deviceId};
   }else{
    if(payload.action==='import'&&this.importDocument)result={serverId:this.serverId,...this.importDocument(payload.document)};
    else if(payload.action==='import-status'&&this.importStatus)result={serverId:this.serverId,jobs:this.importStatus(payload.ids)};
    else if(payload.action==='sync')result=this.sync(device.id,payload);
    else throw Error('电脑版本不支持此操作，请更新并重新打开电脑拾光');
    db.prepare('UPDATE mobile_devices SET last_seen=? WHERE id=?').run(new Date().toISOString(),device.id);
   }
  }catch(e){result={serverId:this.serverId,error:e.message};}
  return sealEnvelope(identity.secret,envelope.id,result,'response',envelope.nonce);
 }
 async handle(req,res){
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(!this.active||!privateAddress(req.socket.remoteAddress??'')){reply(403,{error:'LAN only'});return;}
  if(req.url!=='/mobile/v1/exchange'){reply(404,{error:'Not found'});return;}
  if(req.method==='OPTIONS'){reply(204,{});return;}if(req.method!=='POST'){reply(405,{error:'POST required'});return;}
  try{let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>2*1024*1024){reply(413,{error:'Request too large'});return;}parts.push(part);}if(!this.active)throw Error('Stopped');const envelope=JSON.parse(Buffer.concat(parts).toString('utf8'));if(typeof envelope.id!=='string'||envelope.id.length>100)throw Error('Invalid identity');reply(200,this.process(envelope));}
  catch{reply(401,{error:'Authentication or request validation failed'});}
 }
}
