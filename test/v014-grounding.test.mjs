import test from 'node:test';import assert from 'node:assert/strict';import{validateExtract,supportedSchedule}from'../extract.mjs';import{notificationScore}from'../wechat-reader.mjs';
test('v014 time must be grounded in the matching event evidence',()=>{const r=validateExtract([{title:'开会',date:'2026-09-23',time:'16:00',evidence:'明天15:00开会'}],'明天15:00开会，后天16:00提交材料','2026-09-21T10:00');assert.notEqual(r[0]?.date,'2026-09-23');});
test('v014 Chinese numeric dates use the shared normalization',()=>assert.ok(supportedSchedule('九月二十八日提交材料','2026-09-21T10:00').dates.has('2026-09-28')));
test('v014 article without date remains a candidate',()=>assert.ok(notificationScore('学院通知 https://mp.weixin.qq.com/s/example')>=4));
