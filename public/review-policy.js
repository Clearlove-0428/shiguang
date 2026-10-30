export const reviewSourceChoices=[['wechat','微信'],['qq','QQ'],['official','公众号'],['web','网页'],['file','文件 / 手动']];
export function reviewSource(e){
 if(e.origin_url){try{return new URL(e.origin_url).hostname.toLowerCase()==='mp.weixin.qq.com'?'official':'web';}catch{return 'web';}}
 return ['wechat','qq'].includes(e.platform)?e.platform:'file';
}
export function migrateReviewSources(saved,legacy=false){return new Set((Array.isArray(saved)?saved:['wechat','qq']).flatMap(k=>legacy&&k==='web'?['official','web']:[k]).filter(k=>reviewSourceChoices.some(([id])=>id===k)));}
export function webSource(e){
 if(reviewSource(e)!=='web')return null;
 try{const host=new URL(e.origin_url).hostname.toLowerCase(),subscription=e.external_id?.match(/^website:([^:]+):/)?.[1];
  return {id:host+(subscription?'|'+subscription:''),label:subscription?(e.group_name||e.source||host)+' · '+host:host};
 }catch{return{id:'unknown',label:'其他网页（地址待核对）'};}
}
export function webSourceChoices(events){return [...new Map(events.map(webSource).filter(Boolean).map(x=>[x.id,x])).values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN'));}
export function matchesReview(e,sources,account='all',website='all'){return sources.has(reviewSource(e))&&(account==='all'||account===(e.platform||'file')+'|'+e.account)&&(website==='all'||webSource(e)?.id===website);}
