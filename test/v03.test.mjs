import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {parseUpload,FileQueue} from '../file-import.mjs';
import {agendaRows,renderAgenda,priority} from '../public/agenda.js';
test('QQ export preserves each original timestamp and multiline message',()=>{
 const messages=parseUpload(Buffer.from('消息记录\n2026-09-14 08:30:00 小明\n明天交作业\n材料见附件\n2026-09-15 10:00:00 小红\n周五考试'),'QQ.txt','2026-09-20T09:00','QQ');
 assert.equal(messages.length,2);assert.equal(messages[0].sentAt,'2026-09-14T08:30');assert.match(messages[0].text,/材料见附件/);assert.equal(messages[1].sentAt,'2026-09-15T10:00');
});
test('structured uploads, quoted CSV and invalid dates',()=>{
 const csv='text,sentAt,group\n"明天交作业,带材料",2026-09-14 08:00,课程群';assert.equal(parseUpload(Buffer.from(csv),'通知.csv','','QQ')[0].text,'明天交作业,带材料');
 assert.throws(()=>parseUpload(Buffer.from('[{"text":"通知","sentAt":"2026-02-30T09:00"}]'),'x.json','','QQ'),/发送时间/);
 assert.throws(()=>parseUpload(Buffer.from('encrypted'),'x.bak','','QQ'),/暂不支持/);
});
test('file queue persists, deduplicates and restores interrupted work',async()=>{
 const db=new DatabaseSync(':memory:');let calls=0;const q=new FileQueue(db,async()=>{calls++;return{sourceId:'test'}},()=>true),messages=[{text:'明天考试',sentAt:'2026-09-14T08:00',source:'QQ'}];
 assert.equal(q.enqueue(messages).added,1);assert.equal(q.enqueue(messages).duplicate,1);await q.tick();assert.equal(calls,1);assert.equal(q.state()[0].status,'done');
 db.exec("UPDATE file_jobs SET status='processing'");const restored=new FileQueue(db,async()=>{throw Error('模型暂不可用')},()=>true);await restored.tick();assert.equal(restored.state()[0].status,'failed');restored.retry();assert.equal(restored.state()[0].status,'queued');db.close();
});
test('agenda escaping and active selection remain safe after separate-history redesign',()=>{
 const base={id:'1',title:'考试',source:'班级群',evidence:'<script>考试通知</script>',status:'pending',date:'2026-09-14'};
 const events=[base,{...base,id:'2',date:'2026-09-18',status:'confirmed'},{...base,id:'3',status:'done'},{...base,id:'4',status:'dismissed'}];
 assert.equal(agendaRows(events).length,2);assert.equal(priority(base),true);const html=renderAgenda(events,'2026-09-15');assert.doesNotMatch(html,/schedule-history/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/data-row-id="4"/);
});
