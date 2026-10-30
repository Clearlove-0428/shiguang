import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
test('a reminder from a hidden background process is a visible Windows popup',{skip:process.platform!=='win32'||process.env.SHIGUANG_NATIVE_TESTS!=='1',timeout:18000},async()=>{
 const root=resolve(import.meta.dirname,'..'),output=join(mkdtempSync(join(tmpdir(),'sg-visible-reminder-')),'reminder.png'),payload=Buffer.from(JSON.stringify({title:'内测后台提醒',body:'2026-10-23 18:00 · 内测提醒来源',sound:false,popup:true,pack:'lanxi'})).toString('base64');
 const notice=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'notify.ps1'),'-Payload',payload],{windowsHide:true,stdio:'ignore'});
 try{
  const helper=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(root,'test/helpers/capture-reminder.ps1'),'-OwnerProcessId',String(process.pid),'-Root',root,'-OutputPath',output],{windowsHide:true,stdio:['ignore','pipe','pipe']});let result='';helper.stdout.on('data',b=>result+=b);helper.stderr.on('data',b=>result+=b);const code=await new Promise((r,j)=>{helper.once('error',j);helper.once('exit',r);});assert.equal(code,0,result);assert.equal(JSON.parse(result).passed,true);
 }finally{if(notice.exitCode===null)await new Promise(r=>{notice.once('exit',r);setTimeout(()=>{notice.kill();r();},1500).unref();});}
});
