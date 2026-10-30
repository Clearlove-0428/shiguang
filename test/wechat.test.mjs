import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes,createCipheriv,createHmac,pbkdf2Sync} from 'node:crypto';
import {zstdCompressSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {decryptPage,committedFrames,readGroups,decodeText,isPromotional,notificationScore} from '../wechat-reader.mjs';
test('tutoring orders do not enter the notice queue; class notices remain eligible',()=>{assert.equal(isPromotional('家教需求编号 123，下周三上课，课时费200元','招聘群'),true);assert.equal(notificationScore('家教需求编号 123，下周三上课，课时费200元','招聘群'),0);assert.ok(notificationScore('通知：9月18日下午2点班会，请准时集合','班级通知群')>=4);});
import {AutoEngine} from '../auto-engine.mjs';
test('structured teacher adverts without the word tutoring are filtered',()=>{assert.equal(isPromotional('【年级】：4岁【科目】：英语启蒙【课次】：一周2次【报价】：200元','群聊'),true);});
test('SQLCipher page validates MAC, preserves usable page size and rejects tampering',()=>{
 const key=randomBytes(32),salt=randomBytes(16),ms=Buffer.from(salt.map(b=>b^0x3a)),macKey=pbkdf2Sync(key,ms,2,32,'sha512'),page=Buffer.alloc(4096),plain=Buffer.alloc(4000);plain[4]=80;plain.write('fixture payload',100);salt.copy(page);const iv=randomBytes(16);iv.copy(page,4016);const c=createCipheriv('aes-256-cbc',key,iv);c.setAutoPadding(false);Buffer.concat([c.update(plain),c.final()]).copy(page,16);const idx=Buffer.alloc(4);idx.writeUInt32LE(1);createHmac('sha512',macKey).update(page.subarray(16,4032)).update(idx).digest().copy(page,4032);
 const out=decryptPage(page,key,macKey,1);assert.equal(out.subarray(0,16).toString(),'SQLite format 3\0');assert.equal(out[20],80);assert.equal(out.subarray(16,4016).equals(plain),true);page[77]^=1;assert.throws(()=>decryptPage(page,key,macKey,1),/校验失败/);
});
function sum(b,s=[0,0]){let[a,c]=s;for(let i=0;i<b.length;i+=8){a=(a+b.readUInt32LE(i)+c)>>>0;c=(c+b.readUInt32LE(i+4)+a)>>>0;}return[a,c];}
test('WAL ignores uncommitted or stale frames and verifies checksums',()=>{
 const h=Buffer.alloc(32);h.writeUInt32BE(0x377f0682);h.writeUInt32BE(3007000,4);h.writeUInt32BE(4096,8);randomBytes(8).copy(h,16);let s=sum(h.subarray(0,24));h.writeUInt32BE(s[0],24);h.writeUInt32BE(s[1],28);
 const frames=[];for(let i=1;i<=2;i++){const f=Buffer.alloc(4120);f.writeUInt32BE(i,0);f.writeUInt32BE(i===1?1:0,4);h.copy(f,8,16,24);f.fill(i,24);s=sum(f.subarray(0,8),s);s=sum(f.subarray(24),s);f.writeUInt32BE(s[0],16);f.writeUInt32BE(s[1],20);frames.push(f);}
 const wal=Buffer.concat([h,...frames]);const parsed=committedFrames(wal);assert.equal(parsed.frames.size,1);assert.equal(parsed.dbSize,1);assert.equal(parsed.frames.get(1)[0],1);wal[32+4120+10]^=1;assert.equal(committedFrames(wal).frames.size,1);wal[28]^=1;assert.throws(()=>committedFrames(wal),/日志头校验失败/);
});
test('real SQLite group reader discovers groups, decodes compressed text and advances cursors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'shiguang-reader-')),files={'contact/contact.db':join(dir,'contact.db'),'session/session.db':join(dir,'session.db'),'message/message_0.db':join(dir,'message.db')};
 const group='test@chatroom',table='Msg_'+createHash('md5').update(group).digest('hex');
 let d=new DatabaseSync(files['contact/contact.db']);d.exec('CREATE TABLE contact(username TEXT,nick_name TEXT,remark TEXT);CREATE TABLE chat_room_info_detail(username_ TEXT,announcement_ TEXT,announcement_publish_time_ INTEGER)');d.prepare('INSERT INTO contact VALUES(?,?,?)').run(group,'通知测试群','');d.close();
 d=new DatabaseSync(files['session/session.db']);d.exec('CREATE TABLE SessionTable(username TEXT,last_timestamp INTEGER)');d.close();
 d=new DatabaseSync(files['message/message_0.db']);d.exec(`CREATE TABLE "${table}"(local_id INTEGER PRIMARY KEY,server_id INTEGER,local_type INTEGER,create_time INTEGER,message_content BLOB,compress_content BLOB)`);const add=d.prepare(`INSERT INTO "${table}" VALUES(?,?,?,?,?,NULL)`);add.run(1,101,1,1000,Buffer.from('好的收到'));add.run(2,102,1,1001,zstdCompressSync(Buffer.from('请于9月20日下午5点前提交材料')));d.close();
 const r=readGroups(files,'test',{since:1});assert.equal(r.groups.length,1);assert.equal(r.scanned,2);assert.equal(r.items.length,1);assert.match(r.items[0].text,/提交材料/);assert.equal(decodeText(zstdCompressSync(Buffer.from('中文'))),'中文');
 assert.equal(readGroups(files,'test',{since:1,cursors:r.cursors}).scanned,0);
 d=new DatabaseSync(files['message/message_0.db']);d.prepare(`INSERT INTO "${table}" VALUES(?,?,?,?,?,NULL)`).run(3,103,1,1002,Buffer.from('明天下午3点集合'));d.close();const n=readGroups(files,'test',{since:1,cursors:r.cursors});assert.equal(n.scanned,1);assert.equal(n.items.length,1);assert.match(n.items[0].id,/\|3$/);
});
test('automatic queue survives interruptions, respects selected groups and deduplicates copies',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shiguang-queue-')),db=new DatabaseSync(':memory:');writeFileSync(join(dir,'wechat-keys.dpapi'),'fixture-not-a-real-key');let imports=0;
 const e=new AutoEngine({db,root:dir,data:dir,model:()=>({state:'ready',busy:false}),classify:async batch=>batch.map((j,id)=>({id,relevant:!j.text.includes('广告')})),analyzeImport:async()=>{imports++;return{sourceId:'source-test',count:1};}});
 e.runScript=async()=>({running:true});e.configure({enabled:true,root:dir,account:'owner',scope:'selected',selectedGroups:['group-A']});e.lastScan=Date.now();
 const add=db.prepare('INSERT INTO auto_jobs(id,account,group_id,group_name,text,sent_at,score,content_hash,status) VALUES(?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<310;i++)add.run('excluded-'+i,'owner','group-B','B','普通通知',5000+i,4,'excluded-'+i,'queued');
 add.run('wanted','owner','group-A','A','9月20日提交材料',1000,4,'same','queued');await e.tick();assert.equal(db.prepare('SELECT status FROM auto_jobs WHERE id=?').get('wanted').status,'extract');await e.tick();assert.equal(imports,1);
 add.run('copy','owner','group-A','A','9月20日提交材料',1001,4,'same','extract');await e.tick();assert.equal(imports,1);assert.equal(db.prepare('SELECT status FROM auto_jobs WHERE id=?').get('copy').status,'duplicate');
 add.run('interrupted','owner','group-A','A','明天集合',1002,4,'other','extracting');new AutoEngine({db,root:dir,data:dir,model:()=>({}),classify:async()=>[],analyzeImport:async()=>({})});assert.equal(db.prepare('SELECT status FROM auto_jobs WHERE id=?').get('interrupted').status,'extract');e.stop();db.close();
});
test('monitor waits for WeChat and scans automatically when it opens',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shiguang-watch-')),db=new DatabaseSync(':memory:');writeFileSync(join(dir,'wechat-keys.dpapi'),'fixture');
 const e=new AutoEngine({db,root:dir,data:dir,model:()=>({state:'missing'}),classify:async()=>[],analyzeImport:async()=>({})});e.configure({enabled:true,root:dir});let running=false,scans=0;e.runScript=async()=>({running});e.scan=async()=>{scans++;e.lastScan=Date.now();};
 await e.tick();assert.equal(e.phase,'waiting_client');assert.equal(scans,0);running=true;e.lastProcessCheck=0;await e.tick();assert.equal(scans,1);db.close();
});
test('automatic legacy queue continues in rule fallback without calling the model classifier',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shiguang-rule-queue-')),db=new DatabaseSync(':memory:');writeFileSync(join(dir,'wechat-keys.dpapi'),'fixture');const imports=[];
 const e=new AutoEngine({db,root:dir,data:dir,model:()=>({state:'rules',busy:false}),classify:async()=>{throw Error('Rule fallback must not call model classification');},analyzeImport:async payload=>{imports.push(payload);return{sourceId:'rule-source'};}});
 e.runScript=async()=>({running:true});e.configure({enabled:true,root:dir,account:'owner'});e.lastScan=Date.now();db.prepare('INSERT INTO auto_jobs(id,account,group_id,group_name,text,sent_at,score,content_hash,status) VALUES(?,?,?,?,?,?,?,?,?)').run('notice','owner','class','班级群','明天下午3点集合',1791529200,4,'rule-notice','queued');
 try{await e.tick();assert.equal(db.prepare('SELECT status FROM auto_jobs WHERE id=?').get('notice').status,'extract');await e.tick();assert.equal(imports.length,1);assert.equal(imports[0].mode,'rules');assert.equal(db.prepare('SELECT status FROM auto_jobs WHERE id=?').get('notice').status,'done');}finally{e.stop();db.close();}
});
