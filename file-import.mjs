import {createHash} from 'node:crypto';
import {validDate,validTime,localStamp} from './extract.mjs';
export function parseUpload(bytes,name,sentAt,platform='文件'){
 if(bytes.length>30*1024*1024)throw Error('文件不能超过 30MB');
 const ext=name.split('.').pop().toLowerCase();if(!['txt','md','csv','json'].includes(ext))throw Error('支持 TXT、MD、CSV、JSON 和文字型 PDF；QQ 加密数据库/BAK 暂不支持');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('gb18030').decode(bytes);}
 if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder('utf-16le').decode(bytes);
 text=text.replace(/^\uFEFF/,'');if(text.includes('\0'))throw Error('文件不是可读取的文本');
 if(text.length>500000)throw Error('文本最多 50 万字，请拆分文件');
 const normalize=(v)=>{const x=String(v||'').replace(/\//g,'-').replace(' ','T').slice(0,16);if(!validDate(x.slice(0,10))||!validTime(x.slice(11)))throw Error('记录缺少有效发送时间，请使用 YYYY-MM-DD HH:mm');return x;};
 const source=platform==='QQ'?'QQ · '+name:'文件 · '+name;
 let messages=[];
 if(ext==='json'){
  const obj=JSON.parse(text),rows=Array.isArray(obj)?obj:obj.messages;
  if(!Array.isArray(rows))throw Error('JSON 应为消息数组，或包含 messages 数组');
  messages=rows.map(r=>({text:String(r.text??r.content??''),sentAt:normalize(r.sentAt??r.time??sentAt),source:r.group?`${platform} · ${String(r.group).slice(0,80)}`:source}));
 }else if(ext==='csv'){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw Error('CSV 引号不完整');if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift()||[],ti=header.findIndex(x=>['text','content','原文','内容'].includes(x.trim())),si=header.findIndex(x=>['sentAt','time','时间','发送时间'].includes(x.trim())),gi=header.findIndex(x=>['group','群名'].includes(x.trim()));
  if(ti<0)throw Error('CSV 需要 text/内容 列，可带 sentAt/时间 和 group/群名 列');
  messages=rows.filter(r=>r[ti]?.trim()).map(r=>({text:r[ti],sentAt:normalize(si>=0?r[si]:sentAt),source:gi>=0&&r[gi]?`${platform} · ${r[gi].slice(0,80)}`:source}));
 }else{
  const lines=text.split(/\r?\n/);let current;
  for(const line of lines){const m=line.match(/^\s*(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\s+(\d{1,2}:\d{2})(?::\d{2})?(?:\s+.*)?$/);
   if(m){if(current)messages.push(current);const d=m[1].split(/[-/]/).map((s,i)=>i?s.padStart(2,'0'):s).join('-');current={text:'',sentAt:normalize(d+'T'+m[2].padStart(5,'0')),source};}
   else if(current)current.text+=(current.text?'\n':'')+line;
  }
  if(current)messages.push(current);if(!messages.length)messages=[{text,sentAt:normalize(sentAt),source}];
 }
 messages=messages.map(m=>({...m,text:m.text.trim(),source:m.source.slice(0,100)})).filter(m=>m.text);
 if(!messages.length)throw Error('文件没有可读取的消息');if(messages.length>3000)throw Error('一次最多导入 3000 条消息');
 if(messages.some(m=>m.text.length>50000))throw Error('单条通知最多 50000 字');return messages;
}
export class FileQueue{
 constructor(db,analyze,ready){Object.assign(this,{db,analyze,ready});this.busy=false;
  db.exec("CREATE TABLE IF NOT EXISTS file_jobs(id TEXT PRIMARY KEY,payload TEXT,status TEXT DEFAULT 'queued',error TEXT DEFAULT '',source_id TEXT); UPDATE file_jobs SET status='queued' WHERE status='processing'");
 }
 enqueue(messages){let added=0;this.db.exec('BEGIN');try{for(const m of messages){const payload=JSON.stringify(m),id=createHash('sha256').update(payload).digest('hex');added+=Number(this.db.prepare('INSERT OR IGNORE INTO file_jobs(id,payload) VALUES(?,?)').run(id,payload).changes);}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return{added,duplicate:messages.length-added};}
 state(){return this.db.prepare('SELECT status,count(*) count FROM file_jobs GROUP BY status').all();}
 async tick(){if(this.busy)return;const ready=this.ready();const j=this.db.prepare("SELECT * FROM file_jobs WHERE status='queued' "+(ready?'':"AND json_extract(payload,'$.mode')='rules' ")+"ORDER BY CASE WHEN json_extract(payload,'$.conversationType')='private' THEN 0 ELSE 1 END,rowid LIMIT 1").get();if(!j)return;if(this.allowed&&!this.allowed(JSON.parse(j.payload))){this.db.prepare("UPDATE file_jobs SET status='ignored',error='来源群已停止关注或不在当前群列表' WHERE id=?").run(j.id);return;}this.busy=true;this.db.prepare("UPDATE file_jobs SET status='processing' WHERE id=?").run(j.id);try{const r=await this.analyze({...JSON.parse(j.payload),mode:JSON.parse(j.payload).mode==='rules'?'rules':'model'});this.db.prepare("UPDATE file_jobs SET status='done',source_id=?,error='' WHERE id=?").run(r.sourceId,j.id);}catch(e){this.db.prepare("UPDATE file_jobs SET status='failed',error=? WHERE id=?").run(e.message,j.id);}finally{this.busy=false;}}
 retry(){this.db.exec("UPDATE file_jobs SET status='queued',error='' WHERE status='failed'");}
}

