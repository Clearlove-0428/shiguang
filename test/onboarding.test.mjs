import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
test('new user can find chat connection, inspect directories, select an account and explicitly start reading',{skip:process.env.SHIGUANG_UI_TESTS!=='1',timeout:90000},async()=>{
 const script=resolve(import.meta.dirname,'helpers/onboarding-ui.mjs'),app=resolve(import.meta.dirname,'..'),child=spawn(process.execPath,[script,app],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});assert.equal(code,0,out);
});
