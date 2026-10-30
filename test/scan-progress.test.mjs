import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SyncHub} from '../sync-hub.mjs';
import {FileQueue} from '../file-import.mjs';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('reading progress follows actual connection, reading and queue completion; failures never become success',async()=>{
 const db=new DatabaseSync(':memory:'),dir=mkdtempSync(join(tmpdir(),'sg-progress-')),account={id:'100001',path:join(dir,'100001/nt_qq/nt_db')};mkdirSync(account.path,{recursive:true});writeFileSync(join(account.path,'nt_msg.db'),'fixture');
 let analyzeGate=gate(),fail=false;const files=new FileQueue(db,async()=>{await analyzeGate.promise;if(fail)throw Error('合成解析失败');return{sourceId:'synthetic'};},()=>true),h=new SyncHub({db,root:dir,data:dir,enqueue:m=>files.enqueue(m)});h.configure('qq',{root:dir,accounts:[account.id],enabled:true,days:1});const connect=gate(),read=gate();
 h.run=async(exe,args)=>{if(exe==='powershell.exe'){await connect.promise;return{ok:true};}await read.promise;const input=JSON.parse((await import('node:fs')).readFileSync(args[1],'utf8'));writeFileSync(input.output,JSON.stringify({groups:[{id:'group1',name:'合成课程群',scanned:9,candidates:2}],items:[1,2].map(n=>({id:'message'+n,text:'2026年10月28日18:00前提交合成报告'+n,groupId:'group1',groupName:'合成课程群',sentAt:1792476000})),cursors:{},scanned:9,more:false}));return{ok:true};};
 const flight=h.scan('qq',account);const progress=()=>h.progress().platforms.qq[account.id];assert.equal(progress().phase,'connecting');assert.equal(progress().percent,null);connect.resolve();await new Promise(r=>setImmediate(r));assert.equal(progress().phase,'reading');read.resolve();await flight;
 assert.equal(progress().phase,'queued');assert.equal(progress().total,2);assert.equal(progress().scanned,9);const first=files.tick();await new Promise(r=>setImmediate(r));assert.equal(progress().phase,'extracting');assert.equal(progress().completed,0);analyzeGate.resolve();await first;assert.equal(progress().completed,1);assert.equal(progress().percent,50);
 fail=true;await files.tick();assert.equal(progress().phase,'attention');assert.equal(progress().failed,1);assert.notEqual(progress().percent,100);fail=false;files.retry();await files.tick();assert.equal(progress().phase,'complete');assert.equal(progress().completed,2);assert.equal(progress().percent,100);assert.deepEqual(h.config.qq.accounts,[account.id]);db.close();
});
