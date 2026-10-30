// Preserve references before messageText removes transport markup and URLs.
const decode=s=>String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
export function contentLinks(raw){const text=decode(raw),title=decode(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').trim();const out=[];
 for(const m of text.matchAll(/https?:\/\/[^\s<>"'\]]+/gi)){let url=m[0].replace(/[，。；！）、）]+$/g,'');try{const u=new URL(url);if(u.username||u.password)continue;u.hash='';url=u.href;if(/\.(?:png|jpg|jpeg|gif|webp)(?:$|\?)/i.test(url))continue;if(!out.some(r=>r.url===url))out.push({url,title:title||text.replace(/https?:\/\/\S+/g,'').replace(/<[^>]*>/g,'').trim().slice(0,160)||'链接内容',kind:u.hostname==='mp.weixin.qq.com'?'wechat-article':/\.pdf(?:$|\?)/i.test(url)?'pdf':'web'});}catch{}}
 if(!out.length&&(/<appmsg\b|<img\b|<voicemsg\b|<videomsg\b/i.test(text)||/\[(?:图片|文件|视频|语音)\]/.test(text)))out.push({url:'',title:title||'附件或非文本消息',kind:'attachment'});
 return out.slice(0,20);
}
export const hasContentReference=raw=>contentLinks(raw).length>0;
