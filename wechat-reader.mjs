import {hasContentReference} from './content-links.mjs';
import {scheduleEligible} from './message-text.mjs';
import {noiseReason,hasTimeCue} from './notice-filter.mjs';
import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync,readdirSync,openSync,readSync,closeSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac,pbkdf2Sync,createDecipheriv,createHash,timingSafeEqual} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {zstdDecompressSync} from 'node:zlib';
const ROOT=dirname(fileURLToPath(import.meta.url));
export function discover(root){
 root=resolve(root);if(!existsSync(root))return [];
 if(existsSync(join(root,'message','message_0.db')))return [{id:basename(dirname(root)),path:root}];
 if(existsSync(join(root,'db_storage')))return [{id:basename(root),path:join(root,'db_storage')}];
 return readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&existsSync(join(root,d.name,'db_storage','message'))).map(d=>({id:d.name,path:join(root,d.name,'db_storage')}));
}
const stamp=p=>{try{const s=statSync(p);return `${s.size}:${s.mtimeMs}`;}catch{return '';}};
export function decryptPage(page,key,macKey,num){
 if(page.length!==4096)throw Error('数据库页长度无效');
 const start=num===1?16:0,index=Buffer.alloc(4);index.writeUInt32LE(num);
 const mac=createHmac('sha512',macKey).update(page.subarray(start,4032)).update(index).digest();
 if(!timingSafeEqual(mac,page.subarray(4032)))throw Error(`数据库第 ${num} 页校验失败，需要重新同步`);
 const dec=createDecipheriv('aes-256-cbc',key,page.subarray(4016,4032));dec.setAutoPadding(false);
 const plain=Buffer.concat([dec.update(page.subarray(start,4016)),dec.final()]);
 const out=Buffer.alloc(4096);if(num===1)out.write('SQLite format 3\0');plain.copy(out,start);return out;
}
function checksum(buf,little,s=[0,0]){let[a,b]=s;for(let i=0;i<buf.length;i+=8){a=(a+(little?buf.readUInt32LE(i):buf.readUInt32BE(i))+b)>>>0;b=(b+(little?buf.readUInt32LE(i+4):buf.readUInt32BE(i+4))+a)>>>0;}return[a,b];}
export function committedFrames(wal){
 if(!wal||wal.length<32)return {frames:new Map(),dbSize:0,count:0};
 const magic=wal.readUInt32BE(0);if(![0x377f0682,0x377f0683].includes(magic)||wal.readUInt32BE(8)!==4096)throw Error('不支持的微信日志格式');
 const little=magic===0x377f0682;let sums=checksum(wal.subarray(0,24),little),pending=new Map(),frames=new Map(),dbSize=0,count=0;
 if(sums[0]!==wal.readUInt32BE(24)||sums[1]!==wal.readUInt32BE(28))throw Error('日志头校验失败');
 for(let p=32;p+4120<=wal.length;p+=4120){const h=wal.subarray(p,p+24),page=wal.subarray(p+24,p+4120);if(!h.subarray(8,16).equals(wal.subarray(16,24)))break;
  sums=checksum(h.subarray(0,8),little,sums);sums=checksum(page,little,sums);if(sums[0]!==h.readUInt32BE(16)||sums[1]!==h.readUInt32BE(20))break;
  const num=h.readUInt32BE(0);if(!num)break;pending.set(num,page);count++;
  if(h.readUInt32BE(4)){for(const[n,b]of pending)frames.set(n,b);pending.clear();dbSize=h.readUInt32BE(4);}
 }
 return {frames,dbSize,count};
}
export function snapshot(source,dest,key){
 const meta=dest+'.meta.json',signature=stamp(source)+'|'+stamp(source+'-wal');
 if(existsSync(dest)&&existsSync(meta)&&JSON.parse(readFileSync(meta,'utf8')).signature===signature)return {cached:true};
 let raw,wal,stable=false;
 for(let tries=0;tries<4;tries++){
  const a=stamp(source),w=stamp(source+'-wal');raw=readFileSync(source);wal=w?readFileSync(source+'-wal'):null;
  if(a===stamp(source)&&w===stamp(source+'-wal')){stable=true;break;}
 }
 if(!stable)throw Error('微信正在写入聊天记录，本轮稍后重试');
 if(raw.subarray(0,16).toString()==='SQLite format 3\0')throw Error('请使用兼容的微信 4.x 加密数据库');
 const salt=Buffer.from(raw.subarray(0,16));for(let i=0;i<16;i++)salt[i]^=0x3a;
 const macKey=pbkdf2Sync(key,salt,2,32,'sha512'),committed=committedFrames(wal),size=(committed.dbSize||raw.length/4096)*4096;
 if(!Number.isSafeInteger(size)||size<4096||size>2*1024**3)throw Error('数据库大小异常');
 const out=Buffer.alloc(size);
 for(let num=1;num<=size/4096;num++){const page=committed.frames.get(num)||raw.subarray((num-1)*4096,num*4096);decryptPage(page,key,macKey,num).copy(out,(num-1)*4096);}
 // Keep reserved bytes=80: b-tree cells use that usable-page size. Disable WAL only in the copy.
 out[18]=1;out[19]=1;writeFileSync(dest,out);const db=new DatabaseSync(dest,{readOnly:true});
 try{const result=db.prepare('PRAGMA quick_check').all();if(result.some(r=>Object.values(r)[0]!=='ok'))throw Error('微信副本完整性校验未通过');}finally{db.close();}
 writeFileSync(meta,JSON.stringify({signature,createdAt:Date.now(),walFrames:committed.count}));return {cached:false,walFrames:committed.count};
}
export function decodeText(v){
 if(v==null)return '';if(typeof v==='string')return v;
 const b=Buffer.from(v);try{if(b.length>4&&b.readUInt32LE(0)===0xfd2fb528)return zstdDecompressSync(b,{maxOutputLength:2*1024*1024}).toString('utf8');}catch{return '';}
 return b.toString('utf8');
}
export function prepareAccount(accountPath,vault,cache){
 mkdirSync(cache,{recursive:true});
 const raw=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(ROOT,'wechat-vault.ps1'),'-Mode','read','-Vault',vault],{encoding:'utf8',windowsHide:true,timeout:15000});
 const keys=JSON.parse(raw),files=['contact/contact.db','session/session.db',...readdirSync(join(accountPath,'message')).filter(n=>/^message_\d+\.db$/.test(n)).map(n=>'message/'+n)],output={};
 for(const rel of files){const source=join(accountPath,rel),header=Buffer.alloc(16),fd=openSync(source,'r');try{readSync(fd,header,0,16,0);}finally{closeSync(fd);}const hex=keys[header.toString('hex')];if(!hex)throw Error('聊天数据库密钥已变化，请重新连接微信');
  const dest=join(cache,rel.replaceAll('/','_'));const key=Buffer.from(hex,'hex');try{snapshot(source,dest,key);}finally{key.fill(0);}output[rel]=dest;
 }
 return output;
}
export function isPromotional(text,groupName=''){
 if(/(?:科目|年级)[】\]：:\s]/.test(text)&&/(报价|课次|老师不限|投递简历|每小时|每节课)/.test(text))return true;
 const workSignals=(text.match(/家教|课时费|时薪|薪资|接单|佣金|介绍费|中介费|辅导老师|找老师|求老师|招聘老师|补差|上门辅导|试课|课酬|薪酬|长期带|需求编号|订单编号/g)||[]).length;
 if(workSignals>=2||(/家教|兼职|接单|招聘/.test(groupName)&&(workSignals>=1||/辅导|补课|年级|高一|高二|高三|初一|初二|初三|小学|科目|课次|报价/.test(text))))return true;
 return /(优惠券|包邮|下单立减|领券|淘宝口令|出闲置|低价出售)/.test(text)&&/(元|折|价格|￥|¥)/.test(text);
}
export function notificationScore(text,groupName=''){
 if(hasContentReference(text))return 4;
 if(noiseReason(text,groupName))return 0;
 if(scheduleEligible(text))return 4;
 if(hasTimeCue(text))return 4;
 if(text.length<8)return 0;
 if(isPromotional(text,groupName))return 0;
 const action=/(通知|截止|提交|报名|考试|答辩|讲座|集合|开会|会议|作业|选课|缴费|交费|申请|面试|签到|培训|放假|上课|补考|返校|调课|领取|填报|报到|评选|奖学金|材料|活动|比赛|竞赛|招募)/.test(text);
 const date=/(\d{1,2}\s*[月/.-]\s*\d{1,2}|\d{1,2}\s*[:：点时]|今天|明天|后天|本周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|截止|截至|之前|以前)/.test(text);
 const change=/(取消|延期|推迟|改期|改到|变更|调整至)/.test(text);
 return (action?2:0)+(date?2:0)+(change?2:0)+(/(@所有人|@全体|各位同学|请同学们|重要通知)/.test(text)?1:0);
}
export function cleanMessage(row){
 const base=Number(row.local_type)%4294967296;
 if(![1,49,10000,10002,3,34,43,62].includes(base))return {text:'',unsupported:true};
 if([3,34,43,62].includes(base))return {text:base===3?'[图片]':base===34?'[语音]':'[视频]',unsupported:false};
 let text=decodeText(row.body)||decodeText(row.compressed);
 if(base===49)return {text:text.slice(0,12000),unsupported:false};
 text=text.replace(/^[a-zA-Z0-9_@.-]{3,90}:\r?\n/,'').replace(/<[^>]{1,300}>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
 if(text.includes('\ufffd')&&text.split('\ufffd').length>5)return {text:'',unsupported:true};
 return {text:text.slice(0,12000),unsupported:false};
}
export function readGroups(files,account,input){
 const c=new DatabaseSync(files['contact/contact.db'],{readOnly:true}),s=new DatabaseSync(files['session/session.db'],{readOnly:true});
 let groups;try{const sessions=new Map(s.prepare('SELECT username,last_timestamp FROM SessionTable').all().map(x=>[x.username,x.last_timestamp]));
 const fields=new Set(c.prepare('PRAGMA table_info(contact)').all().map(x=>x.name));const membership=(fields.has('delete_flag')?' AND COALESCE(delete_flag,0)=0':'')+(fields.has('is_in_chat_room')?' AND is_in_chat_room=1':'');
 groups=c.prepare("SELECT username,nick_name,remark FROM contact WHERE username LIKE '%@chatroom'"+membership).all().map(r=>({id:r.username,name:r.remark||r.nick_name||r.username,lastTime:sessions.get(r.username)||0,candidates:0,scanned:0}));
 if(input.includePrivate!==false){const people=c.prepare("SELECT username,nick_name,remark FROM contact WHERE username NOT LIKE '%@chatroom' AND username NOT LIKE 'gh_%'"+(fields.has('delete_flag')?' AND COALESCE(delete_flag,0)=0':'')).all();for(const person of people){if(!sessions.has(person.username)||['filehelper','newsapp','weixin','fmessage','medianote','floatbottle'].includes(person.username))continue;groups.push({id:person.username,name:'私聊 · '+(person.remark||person.nick_name||person.username),lastTime:sessions.get(person.username)||0,candidates:0,scanned:0,conversationType:'private'});}}
 }finally{c.close();s.close();}
 groups.sort((a,b)=>b.lastTime-a.lastTime);
 const selected=new Set(input.selectedGroups||[]),cursor={...(input.cursors||{})},items=[];let scanned=0,unsupported=0,budget=10000;
 const since=input.since||Math.floor(Date.now()/1000)-14*86400;
 for(const[shard,path]of Object.entries(files).filter(([k])=>k.startsWith('message/'))){
  const d=new DatabaseSync(path,{readOnly:true});try{const tables=new Set(d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg_%'").all().map(r=>r.name));
   for(const group of groups){if(input.scope==='selected'&&!selected.has(group.id))continue;if(budget<=0)break;
    const table='Msg_'+createHash('md5').update(group.id).digest('hex');if(!tables.has(table))continue;
    const cursorKey=shard+'|'+group.id,last=cursor[cursorKey]||0;
    const rows=d.prepare(`SELECT local_id,CAST(server_id AS TEXT) AS server_id,local_type,create_time,CAST(message_content AS BLOB) AS body,CAST(compress_content AS BLOB) AS compressed FROM "${table}" WHERE local_id>? AND create_time>=? ORDER BY local_id LIMIT ?`).all(last,since,Math.min(budget,1500));
    for(const row of rows){budget--;scanned++;group.scanned++;cursor[cursorKey]=Math.max(cursor[cursorKey]||0,row.local_id);const decoded=cleanMessage(row);if(decoded.unsupported){unsupported++;continue;}const score=group.conversationType==='private'?notificationScore(decoded.text,group.name):notificationScore(decoded.text,group.name);if(score<4)continue;group.candidates++;
     items.push({id:`${account}|${shard}|${group.id}|${row.local_id}`,groupId:group.id,groupName:group.name,text:decoded.text,sentAt:row.create_time,score,sourceType:'message',conversationType:group.conversationType||'group'});
    }
   }
  }finally{d.close();}
 }
 // Group announcements are notifications even if posted before the most recent chat message.
 const annDb=new DatabaseSync(files['contact/contact.db'],{readOnly:true});try{for(const a of annDb.prepare('SELECT username_,announcement_,announcement_publish_time_ FROM chat_room_info_detail WHERE announcement_publish_time_>=?').all(since)){
  const group=groups.find(g=>g.id===a.username_);if(!group||input.scope==='selected'&&!selected.has(group.id))continue;
  const text=decodeText(a.announcement_).trim();if(!text||notificationScore(text)<4)continue;
  items.push({id:`${account}|announcement|${group.id}|${a.announcement_publish_time_}`,groupId:group.id,groupName:group.name,text,sentAt:a.announcement_publish_time_,score:notificationScore(text),sourceType:'announcement'});
 }}finally{annDb.close();}
 return {groups,items,cursors:cursor,scanned,unsupported,more:budget<=0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const input=JSON.parse(readFileSync(process.argv[2],'utf8')),accounts=discover(input.root);if(!accounts.length)throw Error('未找到微信账号目录');const account=accounts.find(a=>a.id===input.account)||accounts[0],cache=join(input.data,'wechat-cache',createHash('sha256').update(account.path).digest('hex').slice(0,12));
 const files=prepareAccount(account.path,input.vault||join(input.data,'wechat-keys.dpapi'),cache);
 if(input.mode==='schema'){const schemas={};for(const[rel,p]of Object.entries(files)){const db=new DatabaseSync(p,{readOnly:true});try{schemas[rel]=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' LIMIT 8").all();}finally{db.close();}}writeFileSync(join(input.data,'wechat-schema.local.json'),JSON.stringify(schemas,null,2));console.log(JSON.stringify({ok:true,account:account.id,files:Object.keys(files),cache}));}
 else{const result=readGroups(files,account.id,input);writeFileSync(input.output,JSON.stringify({ok:true,account:account.id,...result}));console.log(JSON.stringify({ok:true,groups:result.groups.length,scanned:result.scanned,candidates:result.items.length,unsupported:result.unsupported,more:result.more}));}
 }catch(e){console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
}
