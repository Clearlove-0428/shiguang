import {existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const memo=new Map(),clean=v=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80);
export function wechatIdentity(account,data){
 const file=join(data,'wechat-cache',createHash('sha256').update(account.path).digest('hex').slice(0,12),'contact_contact.db');
 if(!existsSync(file))return{};let db;try{
  const s=statSync(file),signature=s.size+':'+s.mtimeMs;if(memo.get(file)?.signature===signature)return memo.get(file).info;
  db=new DatabaseSync(file,{readOnly:true});const cols=new Set(db.prepare('PRAGMA table_info(contact)').all().map(x=>x.name));if(!cols.has('username')||!cols.has('nick_name'))return{};
  const ids=[...new Set([account.id,account.id.replace(/_[a-f0-9]{4}$/i,'')])],rows=db.prepare('SELECT username,nick_name'+(cols.has('alias')?',alias':'')+' FROM contact WHERE username IN ('+ids.map(()=>'?').join(',')+')').all(...ids);
  const info=rows.length===1?{nickname:clean(rows[0].nick_name),wechatId:clean(rows[0].alias),identitySource:'local-contact'}:{};memo.set(file,{signature,info});return info;
 }catch{return{};}finally{db?.close();}
}
export function accountInfo(platform,account,data,note=''){
 const identity=platform==='wechat'?wechatIdentity(account,data):{},remark=clean(note),fallback=platform==='qq'?'QQ '+account.id:'微信账号 · '+createHash('sha256').update(account.id).digest('hex').slice(0,4).toUpperCase();
 return{id:account.id,...identity,remark,displayName:remark||identity.nickname||fallback,identified:platform==='qq'||!!identity.nickname};
}
