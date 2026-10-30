const profiles={};
export function setAccountCatalog(platforms){for(const[p,value]of Object.entries(platforms||{})){profiles[p]=Object.fromEntries((value.accounts||[]).map(a=>[a.id,a]));}}
export function accountLabel(platform,id){if(!id)return '账号未标注';return profiles[platform]?.[id]?.displayName||(platform==='qq'?'QQ '+id:platform==='wechat'?'微信账号 · '+String(id).slice(-4).toUpperCase():id);}
export function accountDescription(platform,id){const a=profiles[platform]?.[id];return a?[a.remark&&a.nickname?'昵称：'+a.nickname:'',a.wechatId?'微信号：'+a.wechatId:''].filter(Boolean).join(' · '):'';}
export function sourceLabel(e){return e.account?String(e.source||'').replace(e.account,accountLabel(e.platform,e.account)):e.source||'';}
