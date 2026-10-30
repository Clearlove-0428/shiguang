import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
export class Snapshots{
 constructor(db,data){this.db=db;this.dir=join(data,'snapshots');this.pending=null;mkdirSync(this.dir,{recursive:true});}
 list(){return readdirSync(this.dir).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).flatMap(f=>{try{const m=JSON.parse(readFileSync(join(this.dir,f),'utf8'));if(f!==m.id+'.json')return[];const path=this.path(m.id);return[{...m,bytes:statSync(path).size}];}catch{return[];}}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 path(id){if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id))throw Error('快照编号无效');return join(this.dir,id+'.sqlite');}
 create(){if(this.pending)return this.pending;this.pending=this.save().finally(()=>this.pending=null);return this.pending;}
 async save(){const id=randomUUID(),path=this.path(id),partial=path+'.partial';await backup(this.db,partial);const check=new DatabaseSync(partial,{readOnly:true});let count;try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('快照完整性检查未通过');count=check.prepare('SELECT count(*) count FROM events').get().count;}finally{check.close();}const bytes=readFileSync(partial),meta={id,createdAt:new Date().toISOString(),events:count,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};renameSync(partial,path);writeFileSync(join(this.dir,id+'.json'),JSON.stringify(meta));return meta;}
 download(id){const path=this.path(id),meta=JSON.parse(readFileSync(join(this.dir,id+'.json'),'utf8')),bytes=readFileSync(path);if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error('快照校验失败，请使用其他快照');return bytes;}
}
