import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const app=resolve(process.argv[2]||new URL('../../',import.meta.url).pathname),mode=process.argv[3]||'probe',base='http://127.0.0.1:43421',data=mkdtempSync(join(tmpdir(),'sg-settings-')),errors=[],result={app,mode,isolated:true,checks:[],errors};
const child=spawn(process.execPath,[join(app,'server.mjs')],{cwd:app,windowsHide:true,env:{...process.env,SHIGUANG_DATA:data,SHIGUANG_PORT:'43421',SHIGUANG_MOBILE_PORT:'43423',SHIGUANG_NO_MODEL:'1',SHIGUANG_NO_EXTERNAL:'1',SHIGUANG_DISCOVERY_ROOTS:'[]',SHIGUANG_STARTUP_DIR:join(data,'startup')},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let browser;
const api=async(p,b)=>{const r=await fetch(base+'/api/'+p,{method:b===undefined?'GET':'POST',headers:{'X-Shiguang':'1','Content-Type':'application/json'},...(b===undefined?{}:{body:JSON.stringify(b)})});assert.ok(r.ok);return r.json();};
const wait=async(f)=>{for(let i=0;i<70;i++){try{if(await f())return;}catch{}await delay(100);}throw Error('Timed out');};
try{
 await wait(()=>api('health'));await api('settings',{widgetMode:'off',nativeReminders:false});
 browser=await chromium.launch({...(process.env.SHIGUANG_BROWSER_CHANNEL?{channel:process.env.SHIGUANG_BROWSER_CHANNEL}:{}),headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 if(mode.startsWith('resource')||mode==='palette-regression'){
  let releaseInitial;const gate=new Promise(r=>releaseInitial=r);await page.route('**/api/state',async route=>{await gate;await route.continue();});const initial=page.waitForResponse(r=>r.url()===base+'/api/state');await page.goto(base,{waitUntil:'commit'});await page.waitForFunction(()=>typeof document.querySelector('nav [data-view=settings]')?.onclick==='function');await page.locator('nav [data-view=settings]').click();result.checks.push({kind:'first-render-pets',works:await page.locator('.pet-live-card').count()===0});releaseInitial();await initial;await delay(200);await page.unroute('**/api/state');
 }else{await page.goto(base);await page.locator('nav [data-view=settings]').click();}
 await page.locator('#themePalette').waitFor();
 result.headings=await page.locator('#content h3').allTextContents();result.jumps=await page.locator('[data-settings-jump]').evaluateAll(es=>es.map(e=>({text:e.textContent,value:e.dataset.settingsJump})));
 for(const [label,needle] of [['主题与声音','主题与交互'],['桌面伙伴','桌面伙伴'],['手机同步','手机'],['提醒设置','提醒'],['本地模型','模型']]){
  const target=page.locator('#content .settings-card').filter({has:page.locator('h3').filter({hasText:needle})}).first();
  const before=await target.boundingBox();await page.locator('[data-settings-jump]').filter({hasText:label}).click();await delay(650);const after=await target.boundingBox();
  result.checks.push({kind:'jump',label,beforeY:before?.y,afterY:after?.y,works:!!after&&after.y>=0&&after.y<600});
 }
 await page.locator('[data-settings-jump]').filter({hasText:'更多设置'}).click();await delay(200);result.checks.push({kind:'jump',label:'更多设置',works:await page.locator('#advancedSettings').getAttribute('open')!==null});
 await page.locator('#themePalette').selectOption('pop');await delay(900);const saved=await api('state');result.palette={selected:await page.locator('#themePalette').inputValue(),saved:saved.settings.appearance.palette||null,dom:await page.locator('html').getAttribute('data-palette')};result.checks.push({kind:'palette',works:result.palette.saved==='pop'&&result.palette.dom==='pop'});
 await page.reload();await page.locator('nav [data-view=settings]').click();await page.locator('#themePalette').waitFor();result.checks.push({kind:'palette-reload',works:await page.locator('#themePalette').inputValue()==='pop'});
 if(mode.startsWith('palette')){
  const colors=()=>page.evaluate(()=>Object.fromEntries(['.sidebar','nav button.active','.settings-card .primary','.theme-date'].map(selector=>{const el=document.querySelector(selector),s=el&&getComputedStyle(el);return [selector,s?[s.backgroundColor,s.color,s.borderColor]:null];})));
  result.paletteVisuals=[];
  for(const pack of ['classic','lanxi','folio']){
   if(app.includes('20261010')&&pack!=='classic')continue;
   await api('appearance',{pack,palette:'tidal',reduceMotion:true});await page.reload();await page.locator('nav [data-view=settings]').click();await page.locator('#themePalette').waitFor();await page.waitForTimeout(100);const before=await colors();await page.locator('#themePalette').selectOption('pop');await wait(async()=>(await api('state')).settings.appearance.palette==='pop');await delay(200);const after=await colors();const works=JSON.stringify(before)!==JSON.stringify(after);result.paletteVisuals.push({pack,before,after,works});result.checks.push({kind:'palette-visible',pack,works});
  }
 }
 result.passed=result.checks.every(x=>x.works)&&errors.length===0;mkdirSync(import.meta.dirname,{recursive:true});writeFileSync(join(data,'settings-'+mode+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.equal(result.passed,true,'Settings buttons and palette must work');
}finally{await browser?.close();await api('shutdown',{}).catch(()=>{});if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(()=>{child.kill();r();},2500).unref();});}
