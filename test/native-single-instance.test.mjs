import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,copyFileSync,readdirSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
test('repeated native launches, including the other theme, reuse one main window',{skip:process.platform!=='win32'||process.env.SHIGUANG_NATIVE_TESTS!=='1'||!existsSync(resolve(import.meta.dirname,'../native/Shiguang.exe')),timeout:25000},async()=>{
 const folder=mkdtempSync(join(tmpdir(),'sg-single-')),native=join(folder,'native');mkdirSync(native);
 const from=process.env.SHIGUANG_NATIVE_TEST_DIR||resolve(import.meta.dirname,'../native');
 for(const f of readdirSync(from))if(/\.(exe|dll)$/i.test(f))copyFileSync(join(from,f),join(native,f));
 const registrations=new Set(),children=[];
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{if(req.url==='/api/window/open')registrations.add(JSON.parse(body).id);res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=String(server.address().port);
 const start=name=>{const c=spawn(join(native,name+'.exe'),[],{windowsHide:true,env:{...process.env,SHIGUANG_PORT:port,LANXI_PORT:port,SHIGUANG_DATA:join(folder,'data')},stdio:'ignore'});children.push(c);return c;};
 const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out waiting for native host');};
 try{
  const first=start('Shiguang');await wait(()=>registrations.size===1);
  for(const name of ['Shiguang','Lanxi','Shiguang']){const next=start(name);await wait(()=>next.exitCode!==null||registrations.size>1);assert.equal(registrations.size,1,'second launch created another main window');await wait(()=>next.exitCode!==null);assert.equal(next.exitCode,0);}
  const simultaneous=['Shiguang','Lanxi','Shiguang'].map(start);await wait(()=>simultaneous.every(c=>c.exitCode!==null)||registrations.size>1);assert.equal(registrations.size,1,'simultaneous launches created another main window');assert.ok(simultaneous.every(c=>c.exitCode===0));
  assert.equal(first.exitCode,null,'owner main window must stay alive');
 }finally{await Promise.all(children.filter(c=>c.exitCode===null).map(c=>new Promise(r=>{c.once('exit',r);c.kill();})));await new Promise(r=>server.close(r));assert.ok(resolve(folder).startsWith(resolve(tmpdir())+'\\sg-single-'));try{rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:250});}catch(e){if(e.code!=='EPERM'&&e.code!=='EBUSY')throw e;}}
});
