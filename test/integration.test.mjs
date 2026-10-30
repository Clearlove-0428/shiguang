import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('local workflow persists, deduplicates, updates and protects writes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shiguang-test-')),port=43217,url=`http://127.0.0.1:${port}`;
 const opts={cwd:new URL('..',import.meta.url),env:{...process.env,SHIGUANG_PORT:String(port),SHIGUANG_DATA:dir,SHIGUANG_NO_MODEL:'1',SHIGUANG_REMINDER_INTERVAL:'500'},stdio:'ignore',windowsHide:true};let child=spawn(process.execPath,['server.mjs'],opts);
 const request=async(path,data)=>{const r=await fetch(url+'/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Shiguang':'1'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
 try{
  for(let i=0;i<50;i++){try{await request('state');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  let bad=await fetch(url+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(bad.status,400);
  bad=await fetch(url+'/api/state',{headers:{Origin:'https://example.com'}});assert.equal(bad.status,403);
  const body={text:'9月20日下午5点前提交材料',source:'测试群',sentAt:'2026-09-14T10:00',mode:'rules'};
  assert.equal((await request('import',body)).data.count,1);assert.equal((await request('import',body)).data.duplicate,true);
  let events=(await request('state')).data.events;assert.equal(events.length,1);const id=events[0].id;assert.equal(events[0].status,'pending');
  assert.equal((await request('event/'+id,{status:'confirmed'})).status,200);
  await request('import',{...body,text:'提交材料改到9月22日下午3点',sentAt:'2026-09-15T10:00'});
  events=(await request('state')).data.events;const change=events.find(x=>x.action==='update');assert.ok(change);
  assert.equal((await request('event/'+change.id,{status:'confirmed'})).status,400);
  assert.equal((await request('apply/'+change.id,{targetId:id})).status,200);
  let original=(await request('state')).data.events.find(x=>x.id===id);assert.equal(original.date,'2026-09-22');assert.equal(original.time,'15:00');
  await request('import',{...body,text:'提交材料安排取消',sentAt:'2026-09-16T10:00'});
  const cancel=(await request('state')).data.events.find(x=>x.action==='cancel');await request('apply/'+cancel.id,{targetId:id});
  original=(await request('state')).data.events.find(x=>x.id===id);assert.equal(original.status,'cancelled');
  assert.equal((await request('history/'+id)).data.length,3);
  assert.equal((await request('event/'+id,{date:'2026-02-30'})).status,400);
  const pdf='%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 60>>stream\nBT /F1 12 Tf 50 700 Td (Meeting on September 20 at 17:00) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF';
  const pr=await fetch(url+'/api/pdf',{method:'POST',headers:{'X-Shiguang':'1','Content-Type':'application/pdf'},body:pdf});const pj=await pr.json();assert.equal(pr.status,200,JSON.stringify(pj));assert.match(pj.text,/Meeting on September/);
  const exp=await request('export');assert.equal(exp.data.sources.length,3);assert.equal(exp.data.history.length,3);
  await request('settings',{nativeReminders:false});
  await request('import',{...body,text:'1月1日上午9点开会',sentAt:'2020-01-01T08:00'});
  const overdue=(await request('state')).data.events.find(x=>x.date==='2020-01-01');await request('event/'+overdue.id,{status:'confirmed'});
  await new Promise(r=>setTimeout(r,800));assert.equal((await request('state')).data.notifications.length,1);
  await request('shutdown',{});await new Promise(r=>setTimeout(r,500));child=spawn(process.execPath,['server.mjs'],opts);
  for(let i=0;i<50;i++){try{await request('state');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  await new Promise(r=>setTimeout(r,700));const persisted=(await request('state')).data;assert.equal(persisted.notifications.length,1);assert.equal(persisted.events.find(x=>x.id===id).status,'cancelled');
 }finally{await request('shutdown',{}).catch(()=>{});await new Promise(r=>setTimeout(r,500));child.kill();rmSync(dir,{recursive:true,force:true});}
});
