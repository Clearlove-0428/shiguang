import {createHash,randomUUID} from 'node:crypto';
import {localStamp,validDate} from './extract.mjs';
import {nonScheduleReason} from './message-text.mjs';
export {hasTimeCue} from './message-text.mjs';

export function noiseReason(text,groupName=''){
 text=String(text||'');
 const nonSchedule=nonScheduleReason(text);if(nonSchedule)return nonSchedule;
 if(/接\s*龙|积\s*龙/.test(text))return '接龙刷屏';
 if(/(?:科目|年级)[】\]：:\s]/.test(text)&&/(报价|课次|老师不限|投递简历|每小时|每节课)/.test(text))return '家教订单广告';
 const signals=(text.match(/家教|课时费|时薪|薪资|接单|佣金|介绍费|中介费|辅导老师|找老师|求老师|招聘老师|补差|上门辅导|试课|课酬|薪酬|长期带|需求编号|订单编号/g)||[]).length;
 if(signals>=2||(/家教|兼职|接单|招聘/.test(groupName)&&(signals>=1||/辅导|补课|年级|高一|高二|高三|初一|初二|初三|小学|科目|课次|报价/.test(text))))return '招聘推广';
 if(/优惠券|包邮|下单立减|领券|淘宝口令|出闲置|低价出售|限时抢购|扫码下单|代理加盟|刷单返利|推广返佣/.test(text)&&/元|折|价格|￥|¥|购买|扫码|返佣/.test(text))return '商品推广';
 if(/保过|包过|内部答案|代考|代写论文|代写作业/.test(text)&&/加[我微Vv]|联系|私聊|价格|咨询|优惠|收费/.test(text))return '营销广告';
 return '';
}
export const normalizedNotice=text=>String(text||'').normalize('NFKC').replace(/\s+/g,'').replace(/@所有人|@全体成员/g,'');
export function noticeFingerprint(m){return createHash('sha256').update(JSON.stringify([m.platform||'',m.account||'',m.groupId||m.group_id||m.source||'',normalizedNotice(m.text)])).digest('hex');}
export function candidateReason(e){return ''; // Ambiguous dates stay reviewable; never silently discard them.
}
export function sameCandidate(a,b){return normalizedNotice(a.title)===normalizedNotice(b.title)&&a.action===b.action&&String(a.location||'')===String(b.location||'')&&String(a.audience||'')===String(b.audience||'')&&a.date===b.date&&a.time===b.time&&normalizedNotice(a.evidence)===normalizedNotice(b.evidence);}
export function dismissPending(db,rows,reason){let count=0;for(const row of rows){const old=db.prepare("SELECT * FROM events WHERE id=? AND status='pending'").get(row.id);if(!old)continue;const next={...old,status:'dismissed',updated_at:localStamp(),notes:[old.notes,'自动忽略：'+(typeof reason==='function'?reason(row):reason)].filter(Boolean).join('；')};db.prepare("UPDATE events SET status=?,notes=?,updated_at=? WHERE id=? AND status='pending'").run(next.status,next.notes,next.updated_at,old.id);db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(randomUUID(),old.id,JSON.stringify(old),JSON.stringify(next),next.updated_at);count++;}return count;}
export function cleanPending(db){const rows=db.prepare("SELECT e.*,s.text,s.platform,s.account,s.group_id,s.group_name,s.source FROM events e JOIN sources s ON s.id=e.source_id WHERE e.status IN ('pending','confirmed','done') ORDER BY CASE e.status WHEN 'pending' THEN 1 ELSE 0 END,e.created_at,e.rowid").all(),seen=new Map(),reasons=new Map();for(const e of rows){const scope=JSON.stringify([e.platform,e.account,e.group_id||e.source,e.action,e.date,e.time,normalizedNotice(e.title),normalizedNotice(e.evidence)]);const ignored=db.prepare("SELECT name FROM sqlite_master WHERE name='sync_ignored'").get()&&db.prepare('SELECT 1 FROM sync_ignored WHERE platform=? AND account=? AND id=?').get(e.platform,e.account,e.group_id);const reason=(ignored?'来源群已停止关注':'')||noiseReason(e.text,e.group_name)||candidateReason(e)||(seen.has(scope)?'重复通知':'');if(e.status==='pending'&&reason)reasons.set(e.id,reason);else seen.set(scope,e.id);}db.exec('BEGIN');try{const count=dismissPending(db,rows.filter(e=>reasons.has(e.id)),e=>reasons.get(e.id));db.exec('COMMIT');return {dismissed:count,reasons:Object.fromEntries([...new Set(reasons.values())].map(r=>[r,[...reasons.values()].filter(x=>x===r).length]))};}catch(e){db.exec('ROLLBACK');throw e;}}
