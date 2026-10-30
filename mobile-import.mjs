import {parseUpload} from './file-import.mjs';
import {createHash} from 'node:crypto';
export function acceptMobileDocument(document,queue){
 const d=document;
 if(!d||typeof d.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(d.id)||typeof d.text!=='string'||!d.text.trim()||d.text.length>50000||typeof d.name!=='string'||d.name.length>120||!['txt','md','csv','json'].includes(d.name.split('.').pop().toLowerCase())||!['file','qq','wechat'].includes(d.platform)||typeof d.account!=='string'||d.account.length>150||!['rules','model'].includes(d.mode))throw Error('手机文件格式无效；支持5万字以内TXT、MD、CSV或消息JSON');
 const messages=parseUpload(Buffer.from(d.text,'utf8'),d.name,d.sentAt,d.platform==='qq'?'QQ':d.platform==='wechat'?'微信':'文件').map(m=>({...m,platform:d.platform,account:d.account,mode:d.mode}));
 // Same canonical payload as FileQueue.enqueue: retry/ACK loss cannot create duplicate jobs.
 const ids=messages.map(m=>createHash('sha256').update(JSON.stringify(m)).digest('hex'));
 return {id:d.id,...queue.enqueue(messages),jobIds:ids};
}
export function mobileImportStatus(ids,db){
 if(!Array.isArray(ids)||ids.length>3000||ids.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)))throw Error('导入状态请求无效');
 return ids.map(id=>db.prepare('SELECT id,status,error,source_id AS sourceId FROM file_jobs WHERE id=?').get(id)||{id,status:'missing',error:'电脑未找到此导入记录，请核对'});
}
