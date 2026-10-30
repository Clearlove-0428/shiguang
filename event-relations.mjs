import {normalizedNotice} from './notice-filter.mjs';
import {supportedSchedule} from './extract.mjs';
export function milestoneLabel(e,text,sentAt){
 if(!e.date||!e.title)return e.title;
 text=e.evidence||text;
 const dates=[...supportedSchedule(text,sentAt).dates];
 if(dates.length<2||!/至|到|—|～|~/u.test(text))return e.title;
 if(/报名/.test(e.title)){if(e.date===dates[0])return e.title.replace(/(?:开始|截止|时间|安排)$/,'')+'开始';if(e.date===dates.at(-1))return e.title.replace(/(?:开始|截止|时间|安排)$/,'')+'截止';}
 if(/考核|考试/.test(e.title)){if(e.date===dates[0])return e.title.replace(/(?:开始|截止|时间|安排)$/,'')+'开始';if(e.date===dates.at(-1))return e.title.replace(/(?:开始|截止|时间|安排)$/,'')+'截止';}
 return e.title;
}
export function exactRelated(a,b){return normalizedNotice(a.title)===normalizedNotice(b.title)&&a.date===b.date&&a.time===b.time&&a.action===b.action&&a.location===b.location&&a.audience===b.audience&&normalizedNotice(a.text)===normalizedNotice(b.text);}
