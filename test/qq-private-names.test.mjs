import test from 'node:test';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readQQPrivateNames,qqPrivateLabel}from'../qq-reader.mjs';
test('QQ recent conversation name wins; outgoing self nickname cannot become peer name',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE recent_contact_v3_table([40021] TEXT,[40094] TEXT,[40050] INTEGER);CREATE TABLE c2c_msg_table([40021] TEXT,[40020] TEXT,[40093] TEXT,[40050] INTEGER)');
 db.prepare('INSERT INTO recent_contact_v3_table VALUES(?,?,?)').run('u_peer','思政老师',5);
 db.prepare('INSERT INTO c2c_msg_table VALUES(?,?,?,?)').run('u_peer','u_peer','昵称',3);
 db.prepare('INSERT INTO c2c_msg_table VALUES(?,?,?,?)').run('u_other','u_self','自己的昵称',10);
 db.prepare('INSERT INTO c2c_msg_table VALUES(?,?,?,?)').run('u_other','u_other','同学',5);
 const names=readQQPrivateNames(db);assert.equal(names.get('u_peer'),'思政老师');assert.equal(names.get('u_other'),'同学');assert.equal(qqPrivateLabel('u_peer',names.get('u_peer')),'私聊 · 思政老师');assert.doesNotMatch(qqPrivateLabel('u_unknown'),/u_unknown/);
 }finally{db.close();}
});
test('older QQ schema without name tables remains readable',()=>{const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE c2c_msg_table([40021] TEXT)');assert.equal(readQQPrivateNames(db).size,0);assert.match(qqPrivateLabel('u_missing'),/未命名联系人/);}finally{db.close();}});
