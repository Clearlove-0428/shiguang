export function accountProgress(db,p,account,status={},jobs=[],enabled=true){
 const counts={queued:0,processing:0,done:0,failed:0,ignored:0};
 if(jobs.length&&db.prepare("SELECT 1 FROM sqlite_master WHERE name='file_jobs'").get())for(const r of db.prepare('SELECT status,count(*) n FROM file_jobs WHERE id IN (SELECT value FROM json_each(?)) GROUP BY status').all(JSON.stringify(jobs)))if(r.status in counts)counts[r.status]=r.n;
 const total=Object.values(counts).reduce((a,b)=>a+b,0),completed=counts.done+counts.ignored,base={platform:p,account,scanned:status.readThisPass??status.scanned??0,total,completed,failed:counts.failed,waiting:counts.queued,processing:counts.processing,skipped:counts.ignored,startedAt:status.startedAt||null,lastScan:status.lastScan||null};
 let phase,label,percent=null;
 if(status.phase==='error'){phase='error';label='读取失败：'+status.message;}
 else if(status.phase==='scanning'){phase=status.step||'reading';label=phase==='connecting'?'正在连接已登录的客户端':'正在读取本机聊天记录';}
 else if(counts.processing){phase='extracting';label=`正在提取日程 · 已处理 ${completed} / ${total} 条通知`;percent=Math.floor(completed/total*100);}
 else if(counts.queued){phase='queued';label=`等待提取日程 · ${counts.queued} 条通知排队中`;percent=Math.floor(completed/total*100);}
 else if(counts.failed){phase='attention';label=`${completed} 条已处理，${counts.failed} 条解析失败`;percent=Math.floor(completed/total*100);}
 else if(status.more){phase='reading';label='本批记录已读取，正在等待读取下一批';}
 else if(status.phase==='watching'||total){phase='complete';label=total?`本批 ${completed} 条通知已分析，可到待确认核对结果`:`本轮读取 ${base.scanned} 条消息，没有新的时间通知`;percent=100;}
 else{phase=enabled?'waiting':'paused';label=enabled?'等待开始读取':'尚未开始读取';}
 return{...base,phase,label,percent,readingPaused:!enabled};
}
