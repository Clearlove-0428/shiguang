import {hasTimeCue,noiseReason} from './notice-filter.mjs';
import {existsSync,readdirSync,readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac,createHash,pbkdf2Sync,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {committedFrames,notificationScore} from './wechat-reader.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url));
export function discoverQQ(root){root=resolve(root);if(!existsSync(root))return[];if(existsSync(join(root,'nt_qq/nt_db/nt_msg.db')))return[{id:basename(root),path:join(root,'nt_qq/nt_db')}];return readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^\d+$/.test(d.name)&&existsSync(join(root,d.name,'nt_qq/nt_db/nt_msg.db'))).map(d=>({id:d.name,path:join(root,d.name,'nt_qq/nt_db')}));}
export function qqPrivateLabel(peer,name){const text=String(name||'').trim();return '私聊 · '+(text&&!/^u_[\w-]+$/.test(text)?text:'未命名联系人 '+createHash('sha256').update(String(peer)).digest('hex').slice(0,6).toUpperCase());}
export function readQQPrivateNames(db){
 const names=new Map(),columns=t=>new Set(db.prepare('PRAGMA table_info("'+t+'")').all().map(x=>x.name));
 const recent=columns('recent_contact_v3_table');
 // This local QQ version stores the conversation display name in 40094.
 if(recent.has('40021')&&recent.has('40094'))for(const r of db.prepare('SELECT [40021] peer,[40094] name FROM recent_contact_v3_table'+(recent.has('40050')?' ORDER BY [40050] DESC':'')).all()){if(r.peer&&String(r.name||'').trim()&&!names.has(r.peer))names.set(r.peer,r.name);}
 const messages=columns('c2c_msg_table');
 // A sender nickname is usable only when the sender is the conversation peer.
 if(['40021','40020','40093'].every(k=>messages.has(k)))for(const r of db.prepare('SELECT [40021] peer,[40093] name FROM c2c_msg_table WHERE [40020]=[40021] AND [40093] IS NOT NULL'+(messages.has('40050')?' ORDER BY [40050] DESC':'')).all()){if(r.peer&&String(r.name||'').trim()&&!names.has(r.peer))names.set(r.peer,r.name);}
 return names;
}
export function decryptQQPage(page,key,macKey,num){const start=num===1?16:0,index=Buffer.alloc(4);index.writeUInt32LE(num);const mac=createHmac('sha1',macKey).update(page.subarray(start,4064)).update(index).digest();if(!timingSafeEqual(mac,page.subarray(4064,4084)))throw Error('QQ 数据库页校验失败，请重新连接');const dec=createDecipheriv('aes-256-cbc',key,page.subarray(4048,4064));dec.setAutoPadding(false);const out=Buffer.alloc(4096);if(num===1)out.write('SQLite format 3\0');Buffer.concat([dec.update(page.subarray(start,4048)),dec.final()]).copy(out,start);return out;}
const stamp=p=>{try{const s=statSync(p);return`${s.size}:${s.mtimeMs}`;}catch{return'';}};
export function prepareQQ(account,data){const dir=join(data,'qq-cache',account.id);mkdirSync(dir,{recursive:true});const vault=join(data,`qq-${account.id}.dpapi`);if(!existsSync(vault))throw Error('需要在 QQ 登录这个账号以连接数据库');
 const keys=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(ROOT,'wechat-vault.ps1'),'-Mode','read','-Vault',vault],{encoding:'utf8',windowsHide:true})),files={};
 for(const name of ['nt_msg.db','group_info.db']){const source=join(account.path,name),dest=join(dir,name),meta=dest+'.meta.json',signature=stamp(source)+'|'+stamp(source+'-wal');files[name]=dest;if(existsSync(dest)&&existsSync(meta)&&JSON.parse(readFileSync(meta,'utf8')).signature===signature)continue;
  let raw,wal,stable=false;for(let tries=0;tries<4;tries++){const sig=stamp(source)+'|'+stamp(source+'-wal');raw=readFileSync(source);wal=existsSync(source+'-wal')?readFileSync(source+'-wal'):null;if(sig===stamp(source)+'|'+stamp(source+'-wal')){stable=true;break;}}if(!stable)throw Error('QQ 正在写入消息，稍后重试');raw=raw.subarray(1024);
  const salt=Buffer.from(raw.subarray(0,16)),hex=keys[salt.toString('hex')];if(!hex)throw Error('QQ 访问材料已变化，需要重新连接');const key=Buffer.from(hex,'hex');for(let i=0;i<16;i++)salt[i]^=0x3a;const mk=pbkdf2Sync(key,salt,2,32,'sha512'),commit=committedFrames(wal),size=(commit.dbSize||raw.length/4096)*4096;if(!Number.isInteger(size)||size>2*1024**3)throw Error('QQ 数据库大小不支持');const output=Buffer.alloc(size);
  try{for(let n=1;n<=size/4096;n++)decryptQQPage(commit.frames.get(n)||raw.subarray((n-1)*4096,n*4096),key,mk,n).copy(output,(n-1)*4096);}finally{key.fill(0);mk.fill(0);}output[18]=1;output[19]=1;writeFileSync(dest,output);const db=new DatabaseSync(dest,{readOnly:true});try{if(db.prepare('PRAGMA quick_check').all().some(r=>Object.values(r)[0]!=='ok'))throw Error('QQ 副本完整性检查失败');}finally{db.close();}writeFileSync(meta,JSON.stringify({signature}));
 }return files;
}
export function protobufFields(buffer){const b=Buffer.from(buffer),out=[];let p=0;const varint=()=>{let n=0n,shift=0n;for(let i=0;i<10;i++){if(p>=b.length)throw Error('protobuf truncated');const v=b[p++];n|=BigInt(v&127)<<shift;if(!(v&128))return n;shift+=7n;}throw Error('protobuf length invalid');};try{while(p<b.length){const tag=Number(varint()),field=tag>>>3,wire=tag&7;if(!field)break;let value;if(wire===0)value=varint();else if(wire===2){const size=Number(varint());if(size<0||p+size>b.length)break;value=b.subarray(p,p+size);p+=size;}else if(wire===1){p+=8;continue;}else if(wire===5){p+=4;continue;}else break;out.push({field,value});}}catch{}return out;}
export function qqText(bytes){if(!bytes)return '';const parts=[];const walk=(b,depth)=>{if(depth>5)return;for(const f of protobufFields(b)){if(!Buffer.isBuffer(f.value))continue;if([45101,48153,48157,48214,48271].includes(f.field)){const s=f.value.toString('utf8');if(s&&!s.includes('\ufffd'))parts.push(s);}else if(f.field===47901){try{const card=JSON.parse(f.value.toString('utf8'));const add=x=>{if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){if(['title','desc','prompt','url','jumpUrl','qqdocurl'].includes(k)&&typeof v==='string')parts.push(v);else if(typeof v==='object')add(v);}};add(card);}catch{}}else walk(f.value,depth+1);}};walk(bytes,0);return[...new Set(parts)].join('\n').slice(0,12000);}
export function readQQGroups(files,account,input){const c=new DatabaseSync(files['group_info.db'],{readOnly:true}),d=new DatabaseSync(files['nt_msg.db'],{readOnly:true});try{
 const groups=c.prepare('SELECT CAST([60001] AS TEXT) id,[60007] name FROM group_list').all().map(g=>({...g,lastTime:0,scanned:0,candidates:0})),map=new Map(groups.map(g=>[g.id,g])),cursor={...(input.cursors||{})},since=input.since||Math.floor(Date.now()/1000)-7*86400;
 for(const r of d.prepare('SELECT CAST([40027] AS TEXT) gid,MAX([40050]) time FROM group_msg_table WHERE [40050]>=? GROUP BY [40027]').all(Math.floor(Date.now()/1000)-90*86400)){const g=map.get(r.gid);if(g)g.lastTime=r.time;}
 const rows=d.prepare('SELECT CAST([40001] AS TEXT) id,CAST([40027] AS TEXT) gid,[40050] time,CAST([40800] AS BLOB) body FROM group_msg_table WHERE [40050]>=? AND ([40050]>? OR ([40050]=? AND [40001]>CAST(? AS INTEGER))) ORDER BY [40050],[40001] LIMIT 3000').all(since,cursor.time||0,cursor.time||0,cursor.id||'0');let unsupported=0;const items=[];
 for(const r of rows){cursor.time=r.time;cursor.id=r.id;const g=map.get(r.gid);if(!g)continue;g.scanned++;g.lastTime=Math.max(g.lastTime,r.time);const text=qqText(r.body);if(!text){unsupported++;continue;}const score=notificationScore(text,g.name);if(score<4)continue;g.candidates++;items.push({id:`${account}|qq|${r.gid}|${r.id}`,groupId:g.id,groupName:g.name,text,sentAt:r.time,score});}
 let privateScanned=0,privateMore=false;
 if(input.includePrivate!==false&&d.prepare("SELECT 1 FROM sqlite_master WHERE name='c2c_msg_table'").get()){
 const contacts=d.prepare("SELECT [40021] peer,MAX([40050]) last_time FROM c2c_msg_table WHERE [40021] IS NOT NULL AND [40021]<>'' GROUP BY [40021]").all();
 const displayNames=readQQPrivateNames(d);
 for(const c of contacts)groups.push({id:'private:'+c.peer,name:qqPrivateLabel(c.peer,displayNames.get(c.peer)),lastTime:c.last_time||0,scanned:0,candidates:0,conversationType:'private'});
 const pm=new Map(groups.filter(g=>g.conversationType==='private').map(g=>[g.id,g]));const pc=cursor.private||{};
 const pr=d.prepare('SELECT CAST([40001] AS TEXT) id,[40021] peer,[40050] time,CAST([40800] AS BLOB) body FROM c2c_msg_table WHERE [40050]>=? AND ([40050]>? OR ([40050]=? AND [40001]>CAST(? AS INTEGER))) ORDER BY [40050],[40001] LIMIT 3000').all(since,pc.time||0,pc.time||0,pc.id||'0');
 for(const row of pr){pc.time=row.time;pc.id=row.id;privateScanned++;const g=pm.get('private:'+row.peer);if(!g)continue;g.scanned++;const text=qqText(row.body);if(!text){unsupported++;continue;}if(notificationScore(text,g.name)<4)continue;g.candidates++;items.push({id:account+'|qq-private|'+row.peer+'|'+row.id,groupId:g.id,groupName:g.name,text,sentAt:row.time,score:4,conversationType:'private'});}cursor.private=pc;privateMore=pr.length===3000;
 }
 return {groups,items,cursors:cursor,scanned:rows.length+privateScanned,unsupported,more:rows.length===3000||privateMore};
}finally{c.close();d.close();}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const input=JSON.parse(readFileSync(process.argv[2],'utf8')),account=discoverQQ(input.root).find(a=>a.id===input.account);if(!account)throw Error('账号目录不存在');const files=prepareQQ(account,input.data);const result=readQQGroups(files,account.id,input);writeFileSync(input.output,JSON.stringify({ok:true,account:account.id,...result}));console.log(JSON.stringify({ok:true,groups:result.groups.length,scanned:result.scanned,candidates:result.items.length}));}catch(e){console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
}

