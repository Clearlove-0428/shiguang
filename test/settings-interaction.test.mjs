import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const app=resolve(import.meta.dirname,'..'),script=resolve(app,'test/helpers/settings-ui.mjs'),edge=resolve(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe');
test('settings section links scroll correctly and saved palettes change rendered colors',{skip:process.env.SHIGUANG_UI_TESTS!=='1',timeout:45000},async()=>{
 const child=spawn(process.execPath,[script,app,'palette-regression'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});assert.equal(code,0,output);
});
