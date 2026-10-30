import test from'node:test';import assert from'node:assert/strict';import{hasTimeCue}from'../notice-filter.mjs';import{validateExtract}from'../extract.mjs';
import {scheduleSlice} from '../public/schedule-policy.js';
import {messageText,scheduleEligible} from '../message-text.mjs';
test('transport XML version, payment decimals and URLs are not schedule dates',()=>{for(const t of ['你要去吗\n<?xml version="1.0"?><msg><img length="20260918" /></msg>','?\n<?xml version="1.0"?><msg><emoji md5="demo"/></msg>','收到转账13.00元','https://example.test/2026/09/18?version=1.0'])assert.equal(hasTimeCue(t),false,t);});
test('untimed conversation is rejected even when the model invents a task',()=>{assert.deepEqual(validateExtract([{title:'参加活动',date:null,time:null,evidence:'你要去吗'}],'你要去吗','2026-09-18T09:00'),[]);});
test('recent, expired, distant and pending are separate without losing future focus',()=>{
 const now=new Date('2026-09-18T12:00:00'),base={status:'confirmed',time:'17:00'},events=[{...base,id:'past',date:'2026-09-17'},{...base,id:'today',date:'2026-09-18'},{...base,id:'last',date:'2026-09-27'},{...base,id:'far',date:'2026-09-28'},{...base,id:'focus',date:'2026-12-01',focus:true},{...base,id:'review',date:'2026-09-19',status:'pending'},{...base,id:'done',date:'2026-09-19',status:'done'}];
 assert.deepEqual(scheduleSlice(events,'recent',now).map(e=>e.id),['today','last','focus']);assert.deepEqual(scheduleSlice(events,'past',now).map(e=>e.id),['past']);assert.deepEqual(scheduleSlice(events,'later',now).map(e=>e.id),['far','focus']);assert.deepEqual(scheduleSlice(events,'done',now).map(e=>e.id),['done']);
});
test('visible quoted notifications survive metadata removal; untimed named cancellations remain reviewable',()=>{
 const t='<msg><appmsg><title><![CDATA[明天下午交实验报告]]></title><img id="20260918" /></appmsg></msg>';
 assert.equal(messageText(t),'明天下午交实验报告');assert.equal(hasTimeCue(t),true);assert.equal(scheduleEligible('班级会议取消'),true);assert.equal(scheduleEligible('你要去吗'),false);
});
