import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {FileQueue} from '../file-import.mjs';
import {acceptMobileDocument,mobileImportStatus} from '../mobile-import.mjs';
const document={id:'synthetic-mobile-import',name:'手机通知.txt',text:'2026-09-26 16:00前提交合成课程报告',sentAt:'2026-09-20T10:00',platform:'wechat',account:'synthetic-account',mode:'rules'};
test('mobile upload reuses file queue, preserves provenance, retries idempotently and runs rules without model',async()=>{
 const db=new DatabaseSync(':memory:');let called=[];const q=new FileQueue(db,async d=>{called.push(d);return {sourceId:'source-test'};},()=>false);
 try{const first=acceptMobileDocument(document,q),retry=acceptMobileDocument(document,q);assert.equal(first.added,1);assert.equal(retry.added,0);assert.equal(retry.duplicate,1);assert.deepEqual(first.jobIds,retry.jobIds);await q.tick();assert.equal(called.length,1);assert.equal(called[0].mode,'rules');assert.equal(called[0].account,'synthetic-account');assert.equal(called[0].sentAt,document.sentAt);assert.equal(called[0].text,document.text);assert.equal(mobileImportStatus(first.jobIds,db)[0].status,'done');}finally{db.close();}
});
test('model upload stays queued while model unavailable; malformed inputs cannot create jobs',async()=>{
 const db=new DatabaseSync(':memory:');const q=new FileQueue(db,async()=>{throw Error('must not run');},()=>false);
 try{acceptMobileDocument({...document,mode:'model'},q);await q.tick();assert.equal(q.state()[0].status,'queued');for(const d of [{...document,name:'private.db'},{...document,text:'x'.repeat(50001)},{...document,sentAt:'not-a-date'},{...document,name:'bad.json',text:'{}'}])assert.throws(()=>acceptMobileDocument(d,q));assert.equal(db.prepare('SELECT COUNT(*) n FROM file_jobs').get().n,1);}finally{db.close();}
});
test('structured file uses each message timestamp rather than replacing it with import time',()=>{
 const db=new DatabaseSync(':memory:');const q=new FileQueue(db,()=>{},()=>false);
 try{acceptMobileDocument({...document,name:'导出.json',text:JSON.stringify([{text:'明天交合成作业',sentAt:'2026-09-10 08:00',group:'合成群'}])},q);const p=JSON.parse(db.prepare('SELECT payload FROM file_jobs').get().payload);assert.equal(p.sentAt,'2026-09-10T08:00');assert.match(p.source,/合成群/);}finally{db.close();}
});
