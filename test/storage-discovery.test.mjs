import test from 'node:test';
import assert from 'node:assert/strict';
import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';
import{join}from'node:path';import{tmpdir}from'node:os';
import{discoverStorage,inspectStorage,discoveryChoice}from'../storage-discovery.mjs';
const fixture=async t=>{const root=await mkdtemp(join(tmpdir(),'sg-discovery-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;};
const account=async(root,p,id)=>{const f=join(root,id,p==='qq'?'nt_qq/nt_db/nt_msg.db':'db_storage/message/message_0.db');await mkdir(join(f,'..'),{recursive:true});await writeFile(f,'synthetic-marker');};
test('find both stores and all accounts without reading message contents',async t=>{
 const root=await fixture(t),wx=join(root,'资料','微信存储'),qq=join(root,'资料','QQ记录');await account(wx,'wechat','wxid-fixture');await account(qq,'qq','10001');await account(qq,'qq','10002');
 const r=await discoverStorage({locations:{direct:[],search:[root]}});assert.equal(r.platforms.wechat[0].root,wx);assert.deepEqual(r.platforms.qq[0].accounts,['10001','10002']);assert.equal(r.platforms.qq.length,1);
});
test('matching folder names without actual database markers do not count',async t=>{const root=await fixture(t);await mkdir(join(root,'wxid-fake','db_storage','message'),{recursive:true});assert.equal(await inspectStorage(root,'wechat'),null);assert.equal(await inspectStorage(root,'qq'),null);});
test('account and parent discoveries collapse to one candidate',async t=>{const root=await fixture(t);await account(root,'wechat','wxid-fixture');const r=await discoverStorage({locations:{direct:[join(root,'wxid-fixture'),root],search:[]}});assert.equal(r.platforms.wechat.length,1);assert.equal(r.platforms.wechat[0].root,root);});
test('ambiguous roots, saved accounts and disabled synchronization remain user controlled',()=>{
 const current={root:'missing',accounts:['10001'],enabled:false,days:7},c={root:'found',accounts:['10001','10002']};assert.deepEqual(discoveryChoice(current,[c]),{...current,root:'found'});
 assert.equal(discoveryChoice(current,[c,c]),null);assert.equal(discoveryChoice(current,[{...c,accounts:['20000']}]),null);
 assert.deepEqual(discoveryChoice({...current,accounts:[]},[c]).accounts,[]);assert.deepEqual(discoveryChoice({...current,accounts:[]},[{...c,accounts:['10001']}]).accounts,['10001']);
});
test('bounded search reports partial scope and cancellation',async t=>{const root=await fixture(t);await mkdir(join(root,'one','two'),{recursive:true});const r=await discoverStorage({locations:{direct:[],search:[root]},maxDirectories:1});assert.equal(r.checked,1);assert.equal(r.limited,true);const c=new AbortController();c.abort();const a=await discoverStorage({locations:{direct:[root],search:[root]},signal:c.signal});assert.equal(a.checked,0);assert.deepEqual(a.platforms.qq,[]);});
