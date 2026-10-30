import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {MobileBridge,sealEnvelope,openEnvelope,validateWindow} from '../mobile-bridge.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE sources(id TEXT PRIMARY KEY,platform TEXT,account TEXT,group_id TEXT,group_name TEXT,sent_at TEXT,text TEXT);CREATE TABLE events(id TEXT PRIMARY KEY,source_id TEXT,title TEXT,date TEXT,time TEXT,status TEXT,focus INTEGER,manual_schedule INTEGER,evidence TEXT,action TEXT);INSERT INTO sources VALUES('s','qq','synthetic-account','g','合成群','2026-09-20T10:00:00+08:00','合成通知');INSERT INTO events VALUES('e','s','合成安排','2026-09-25','18:00','confirmed',0,0,'9月25日18点提交','new');`);
 const args={db,events:()=>db.prepare('SELECT e.*,s.platform,s.account,s.group_id,s.group_name,s.sent_at FROM events e JOIN sources s ON s.id=e.source_id').all(),updateEvent:(id,p)=>{for(const [key,value]of Object.entries(p))db.prepare(`UPDATE events SET ${key==='window'?'mobile_window':key}=? WHERE id=?`).run(key==='window'?(value===null?null:JSON.stringify(value)):typeof value==='boolean'?Number(value):value,id);},timeZone:'Asia/Shanghai'};
 return{db,args,bridge:new MobileBridge(args)};
}
test('mobile revision survives reconstruction and captures PC changes/deletion',()=>{
 const {db,args,bridge}=setup();try{const first=bridge.sync('d',{cursor:0});db.exec("UPDATE events SET title='电脑修正' WHERE id='e'");const next=new MobileBridge(args).sync('d',{cursor:first.cursor});assert.equal(next.changes[0].title,'电脑修正');assert.ok(next.changes[0].revision>first.changes[0].revision);db.exec("DELETE FROM events WHERE id='e'");assert.deepEqual(bridge.sync('d',{cursor:next.cursor}).deleted,['e']);}finally{db.close();}
});
test('mobile operation idempotency and stale revisions preserve PC decision',()=>{
 const {db,bridge}=setup();try{const initial=bridge.sync('d',{cursor:0}),op={operationId:'once',eventId:'e',baseRevision:initial.changes[0].revision,kind:'set-status',patch:{status:'done'}};const first=bridge.sync('d',{cursor:0,operations:[op]}),again=bridge.sync('d',{cursor:0,operations:[op]});assert.deepEqual(again.results,first.results);assert.equal(again.cursor,first.cursor);const conflict=bridge.sync('d',{cursor:0,operations:[{...op,operationId:'other',patch:{status:'confirmed'}}]});assert.equal(conflict.results[0].status,'conflict');assert.equal(db.prepare('SELECT status FROM events').get().status,'done');assert.throws(()=>bridge.sync('d',{cursor:0,operations:[{...op,patch:{status:'confirmed'}}]}),/不同内容/);}finally{db.close();}
});
test('mobile ACK storage failure rolls back event and revision atomically',()=>{
 const {db,bridge}=setup();try{const initial=bridge.sync('d',{cursor:0});db.exec("CREATE TRIGGER reject_ack BEFORE INSERT ON mobile_operations BEGIN SELECT RAISE(ABORT,'simulated write failure'); END");assert.throws(()=>bridge.sync('d',{cursor:0,operations:[{operationId:'fail',eventId:'e',baseRevision:initial.changes[0].revision,kind:'edit',patch:{title:'不能半写入'}}]}),/simulated/);assert.equal(db.prepare('SELECT title FROM events').get().title,'合成安排');assert.equal(bridge.sync('d',{cursor:0}).cursor,initial.cursor);}finally{db.close();}
});
test('mobile pairing expires, replay and revoked devices are denied; status excludes secrets',()=>{
 const {db,bridge}=setup();try{bridge.active=true;const code=bridge.invite('http://127.0.0.1:'+bridge.port).code,p=JSON.parse(Buffer.from(code.slice(14),'base64url')),secret=randomBytes(32).toString('base64url');const payload={action:'pair',deviceId:'phone',deviceName:'合成手机',deviceSecret:secret,sentAt:Date.now()},e=sealEnvelope(p.secret,p.id,payload,'request','');assert.equal(openEnvelope(p.secret,bridge.process(e),'response',e.nonce).deviceId,'phone');assert.throws(()=>bridge.process(e));assert.ok(!JSON.stringify(bridge.status()).includes(secret));bridge.revoke('phone');assert.throws(()=>bridge.process(sealEnvelope(secret,'phone',{action:'sync',cursor:0,sentAt:Date.now()},'request','')));const p2=JSON.parse(Buffer.from(bridge.invite('http://127.0.0.1:'+bridge.port).code.slice(14),'base64url'));db.prepare('UPDATE mobile_pairs SET expires=0 WHERE id=?').run(p2.id);assert.throws(()=>bridge.process(sealEnvelope(p2.secret,p2.id,payload,'request','')));}finally{bridge.stop();db.close();}
});
test('mobile range supports full window and explicit null, rejects inconsistent endpoints',()=>{
 assert.doesNotThrow(()=>validateWindow(null,'2026-09-25','18:00'));
 assert.doesNotThrow(()=>validateWindow({startDate:'2026-09-20',startTime:null,endDate:'2026-09-25',endTime:'18:00'},'2026-09-25','18:00'));
 assert.throws(()=>validateWindow({startDate:'2026-09-20',startTime:null,endDate:'2026-09-25',endTime:'18:00'},'2026-09-26','18:00'));
});
