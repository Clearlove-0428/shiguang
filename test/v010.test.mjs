import test from'node:test';import assert from'node:assert/strict';import{ruleExtract,validateExtract,supportedSchedule}from'../extract.mjs';import{hasTimeCue}from'../notice-filter.mjs';
import {noiseReason} from '../notice-filter.mjs';
import {WindowSessions} from '../window-sessions.mjs';
test('student number ranges cannot ground January 10 even beside a genuine date',()=>{
 for(const s of['麻烦1-10号同学加一下群','麻烦101-107号的同学加一下群，选一下组长']){assert.equal(hasTimeCue(s),false);assert.equal(supportedSchedule(s,'2026-09-18T09:00').dates.size,0);}
 const s='明天下午，请1-10号同学加群确认分组';assert.ok(!supportedSchedule(s,'2026-09-18T09:00').dates.has('2026-01-10'));
});
test('bare upcoming weekday rolls forward from message day, explicit this/last week remains literal',()=>{
 assert.equal(ruleExtract('周四下午开会','2026-09-18T09:00')[0]?.date,'2026-09-24');
 assert.equal(ruleExtract('有时间的可以带上电脑周四下午到友谊','2026-09-18T09:00')[0]?.date,'2026-09-24');
 assert.equal(ruleExtract('本周四下午开会','2026-09-18T09:00')[0]?.date,'2026-09-17');
 assert.equal(ruleExtract('上周四下午开会','2026-09-18T09:00')[0]?.date,'2026-09-10');
 assert.equal(ruleExtract('会议已经在周四下午结束了','2026-09-18T09:00')[0]?.date,'2026-09-17');
 assert.deepEqual([...supportedSchedule('会议已经在周四下午结束了','2026-09-18T09:00').dates],['2026-09-17']);
});
test('ordinal join requests cannot survive invented model dates; real deadlines remain',()=>{
 for(const evidence of ['麻烦1-10号同学加一下群','麻烦101-107号的同学加一下群，选一下组长','通知1-10号同学加群']){
  assert.ok(noiseReason(evidence));assert.deepEqual(validateExtract([{title:'加群通知',date:'2026-01-10',time:null,evidence}],evidence,'2026-09-18T09:00'),[]);
 }
 const evidence='明天下午18点前加入答辩群并提交论文';assert.equal(noiseReason(evidence),'');
 assert.equal(validateExtract([{title:'提交论文',date:'2026-09-19',time:'18:00',evidence}],evidence,'2026-09-18T09:00')[0].date,'2026-09-19');
 assert.equal(noiseReason('请加入群，论文提交时间待定，另行通知'),'');
});
test('two windows share lifetime; duplicate close is safe; crash cleanup and reopening cancel exit',async()=>{
 let exits=0;const alive=new Set([11,12]);const s=new WindowSessions({onEmpty:()=>exits++,isAlive:p=>alive.has(p),grace:20});
 const a={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',pid:11},b={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',pid:12};
 const wait=()=>new Promise(r=>setTimeout(r,35));
 try{s.open(a);s.open(b);s.close(a);s.close(a);await wait();assert.equal(exits,0);assert.equal(s.state().count,1);
 s.close(b);s.open(a);await wait();assert.equal(exits,0);
 alive.delete(11);s.reap();await wait();assert.equal(exits,1);
 }finally{s.stop();}
});
