import {validDate,validTime} from './extract.mjs';
const escape=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line){let rows=[],part='';for(const c of line){if(Buffer.byteLength(part+c)>75){rows.push(part);part=' ';}part+=c;}rows.push(part);return rows.join('\r\n');}
export function calendarExport(events,now=new Date()){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Xiaoshuaishuai//Shiguang//ZH','CALSCALE:GREGORIAN','X-WR-CALNAME:拾光日程'];
 for(const e of events){if(e.status!=='confirmed'||!validDate(e.date))continue;const date=e.date.replaceAll('-',''),timed=e.time&&validTime(e.time);lines.push('BEGIN:VEVENT','UID:'+escape(e.id)+'@shiguang.local','DTSTAMP:'+now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z'),timed?'DTSTART:'+date+'T'+e.time.replace(':','')+'00':'DTSTART;VALUE=DATE:'+date,'SUMMARY:'+escape(e.title),'DESCRIPTION:'+escape([e.notes,e.range_start?'可办理范围 '+e.range_start+' 至 '+e.range_end:''].filter(Boolean).join('\n')),'LOCATION:'+escape(e.location),'END:VEVENT');}
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
