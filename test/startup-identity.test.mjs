import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
test('Windows PowerShell 5 parses all shipped launch scripts including Chinese messages',{skip:process.platform!=='win32'},async()=>{
 const command=`$e=$null;$t=$null;foreach($name in @('launch.ps1','launch-lanxi.ps1','startup-check.ps1')){[System.Management.Automation.Language.Parser]::ParseFile((Join-Path '${root.replaceAll("'","''")}' $name),[ref]$t,[ref]$e)|Out-Null;if($e.Count){throw ($name+': '+($e.Message -join '; '))}}`;
 await exec('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,timeout:10000});
});
test('startup rejects old and foreign backends, accepts only this installation and window API',{skip:process.platform!=='win32'},async()=>{
 let mode='legacy';const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json; charset=utf-8');if(req.url==='/api/state'){res.end(JSON.stringify({events:[],model:{state:'ready'}}));return;}if(req.url==='/api/health'&&mode!=='legacy'){res.end(JSON.stringify({app:'shiguang-local',apiVersion:1,root:mode==='foreign'?'C:/other/Shiguang':root}));return;}if(req.url==='/api/windows'&&mode==='current'){res.end('{"count":0}');return;}res.writeHead(404);res.end('{"error":"Not found"}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 try{for(const [value,expected]of[['legacy',false],['foreign',false],['missing-window-api',false],['current',true]]){mode=value;const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`. '${root.replaceAll("'","''")}/startup-check.ps1'; Test-ShiguangService -Root '${root.replaceAll("'","''")}' -Port ${port}`],{windowsHide:true,timeout:10000});assert.equal(stdout.trim().toLowerCase(),String(expected),value+' must not be mistaken for a usable native backend');}}finally{await new Promise(r=>server.close(r));}
});
