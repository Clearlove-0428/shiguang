import {voicePlan,themeVoicePlan} from '/sound-palette.js';
import {soundChoices} from '/experience-ui.js';
const $=s=>document.querySelector(s);
let lastAppearance='';
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const entry=location.port==='43137'||new URLSearchParams(location.search).get('theme')==='lanxi'?'lanxi':'classic';
let prefs={},audio,frame,last=0,phase=0,dateTimer,introTimer,initialized=false,audioGeneration=0,hostHidden=false;
const pageAnimations=new Set(),voices=new Set();
const reduced=()=>!!prefs.reduceMotion||motionPreference.matches;
const hidden=()=>document.hidden||hostHidden;
const soundEnabled=()=>prefs.uiSound!==false&&(prefs.uiVolume??.3)>0&&!hidden();

export function applyTheme(a={}){
 const signature=JSON.stringify(a);if(initialized&&signature===lastAppearance)return;lastAppearance=signature;
 document.documentElement.dataset.density=a.density||'comfortable';document.documentElement.dataset.art=(a.pack||entry)==='lanxi'?'lanxi-restored':'studio';if(a.accent&&a.accent.toLowerCase()!=='#2674ed')document.documentElement.style.setProperty('--art-user-accent',a.accent);else document.documentElement.style.removeProperty('--art-user-accent');
 const previousSkin=prefs.pack||entry;prefs=a;const skin=a.pack||entry;
 document.documentElement.dataset.skin=skin;document.documentElement.dataset.font=a.font||'system';document.documentElement.dataset.palette=a.palette||'tidal';decorateChrome();
 for(const [id,href] of [['themeStyle','/theme.css'],['folioStyle','/folio.css'],['experienceStyle','/experience.css']])if(!$('#'+id)){const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.append(l);}
 if(!$('#themeBackdrop')){const c=document.createElement('canvas');c.id='themeBackdrop';c.className='theme-wallpaper';c.setAttribute('aria-hidden','true');document.body.prepend(c);}
 const brand=$('.brand div');if(brand){brand.firstChild.textContent='拾光';$('.brand img').src='/icon.svg';}
 document.title='拾光 · 本地日程助手';
 if(previousSkin!==skin){cancelPageAnimations();stopAudio();removeIntro();}
 ensureDate();syncInteraction();document.querySelectorAll('[data-art-pack]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.artPack===skin)));const packSelect=$('#themePack');if(packSelect)packSelect.value=skin;
 // Saved shared appearance is known before deciding whether to show the entry intro.
 if(!initialized){initialized=true;if(entry==='lanxi'&&skin==='lanxi'&&!reduced()&&!hidden()){const intro=document.createElement('div');intro.className='theme-intro';intro.innerHTML='<strong>拾光</strong><span>把重要的事，留在眼前。</span>';document.body.append(intro);introTimer=setTimeout(removeIntro,850);}}
}
function cancelPageAnimations(){for(const animation of pageAnimations)animation.cancel();pageAnimations.clear();}
function removeIntro(){clearTimeout(introTimer);$('.theme-intro')?.remove();}
function stopAudio(){audioGeneration++;for(const voice of voices){try{voice.oscillator.stop();}catch{}voice.oscillator.disconnect();voice.gain.disconnect();}voices.clear();if(audio&&audio.state!=='closed')audio.suspend().catch(()=>{});}
function syncInteraction(){
 document.documentElement.classList.toggle('reduce-motion',reduced());document.documentElement.classList.toggle('theme-background',hidden());
 if(reduced()||hidden()){cancelPageAnimations();removeIntro();}
 if(!soundEnabled())stopAudio();scheduleBackdrop();scheduleDate();
}
function scheduleBackdrop(){
 cancelAnimationFrame(frame);frame=undefined;const c=$('#themeBackdrop');if(!c)return;
 const enabled=document.documentElement.dataset.skin==='lanxi'&&!reduced()&&!hidden()&&!document.body.classList.contains('has-wallpaper');c.hidden=!enabled;if(!enabled)return;
 const draw=t=>{if(t-last>33){last=t;phase+=.018;const w=Math.round(Math.min(innerWidth,1600)*.55),h=Math.round(Math.min(innerHeight,1000)*.55);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}const ctx=c.getContext('2d');ctx.fillStyle='#064bcb';ctx.fillRect(0,0,w,h);for(let i=0;i<4;i++){const x=w*(.45+.48*Math.sin(phase*.43+i*1.7)),y=h*(.4+.6*Math.cos(phase*.3+i*2)),r=w*(.30+.1*Math.sin(phase*.4+i));const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,i%2?'#43eeffc0':'#3324fbcc');g.addColorStop(1,'#001a5900');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}ctx.save();ctx.translate(w/2,h/2);ctx.rotate(Math.sin(phase*.2)*.35);for(let i=-2;i<3;i++){ctx.fillStyle='#93efff0c';ctx.fillRect(i*w*.3-w*.12,-h,w*.06,h*3);}ctx.restore();}frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);
}
export function animatePage(){
 cancelPageAnimations();const content=$('#content');if(!content||hidden()||reduced())return;
 if(document.documentElement.dataset.skin==='lanxi'){
  playMotion(content,[{opacity:.35,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:({quick:150,balanced:240,relaxed:360})[prefs.motionTempo||'balanced'],easing:'ease-out'});
 }else artMotion(content);
}
export function themePanel(a={}){return `<section class="panel settings-card"><h3>主题与交互</h3>${artThemeChoices(a.pack||entry)}<div class="form-grid"><label>主题包<select id="themePack"><option value="classic" ${(a.pack||entry)==='classic'?'selected':''}>拾光 · 简洁</option><option value="lanxi" ${(a.pack||entry)==='lanxi'?'selected':''}>拾光 · P3R风格</option><option value="folio" ${(a.pack||entry)==='folio'?'selected':''}>纸上编年 · 阅读主题</option></select></label><label>配色变体<select id="themePalette">${[['tidal','蓝青'],['archive','墨色'],['pop','紫黄']].map(([v,t])=>`<option value="${v}" ${(a.palette||'tidal')===v?'selected':''}>${t}</option>`).join('')}</select></label></div><p class="hint">P3R是拾光的界面主题，共用日程与设置。简洁和纸面界面保留为可选样式。切换主题会使用配套界面音效，保留静音和音量；也可另选独立音色。</p>${soundChoices(a)}<label>界面音效<input id="uiSound" type="checkbox" ${a.uiSound!==false?'checked':''}></label><label>音量 <output id="volumeValue">${Math.round((a.uiVolume??.3)*100)}%</output><input id="volume" aria-label="界面音效音量" type="range" min="0" max="100" step="1" value="${Math.round((a.uiVolume??.3)*100)}"></label><div class="art-sound-demo" role="group" aria-label="试听界面声音"><button type="button" class="secondary" id="audition">试听整组声音</button><button type="button" class="secondary" data-art-sound="tap">轻触</button><button type="button" class="secondary" data-art-sound="nav">切页</button><button type="button" class="secondary" data-art-sound="done">完成</button></div><label>减少动态背景与过渡<input id="reduceMotion" type="checkbox" ${a.reduceMotion?'checked':''}></label></section>`;}
export function wireTheme({api,toast,refresh,appearance={}}){
 if(!$('#themePack'))return;
 const save=async b=>{try{await api('appearance',b);await refresh(false);toast('外观设置已保存');}catch(e){await refresh(false);toast(e.message);}};
 document.querySelectorAll('[data-sound-pack]').forEach(button=>button.onclick=()=>{stopAudio();prefs={...prefs,soundPack:button.dataset.soundPack};document.querySelectorAll('[data-sound-pack]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));save({soundPack:button.dataset.soundPack});tone('preview');if(!soundEnabled())toast('音色已选择；开启界面音效后可试听');});
 document.querySelectorAll('[data-art-pack]').forEach(button=>button.onclick=()=>save({pack:button.dataset.artPack,soundPack:'theme'}));
 document.querySelectorAll('[data-art-sound]').forEach(button=>button.onclick=()=>tone(button.dataset.artSound));
 $('#themePack').onchange=e=>save({pack:e.target.value,soundPack:'theme'});$('#themePalette').onchange=e=>save({palette:e.target.value});
 $('#uiSound').onchange=e=>{prefs={...prefs,uiSound:e.target.checked};syncInteraction();save({uiSound:e.target.checked});};
 $('#reduceMotion').onchange=e=>{prefs={...prefs,reduceMotion:e.target.checked};syncInteraction();save({reduceMotion:e.target.checked});};
 $('#volume').oninput=e=>{const n=Number(e.target.value);prefs={...prefs,uiVolume:n/100};if(!soundEnabled())stopAudio();$('#volumeValue').textContent=n+'%';};
 $('#volume').onchange=e=>save({uiVolume:Number(e.target.value)/100});$('#audition').onclick=()=>tone('preview');
}
async function tone(kind){
 if(!soundEnabled())return;
 const generation=audioGeneration,skin=document.documentElement.dataset.skin;
 try{
  audio??=new AudioContext();await audio.resume();
  if(!soundEnabled()||generation!==audioGeneration||skin!==document.documentElement.dataset.skin){if(!soundEnabled())stopAudio();return;}
  const notes=prefs.soundPack&&prefs.soundPack!=='theme'?voicePlan(prefs.soundPack,kind):skin==='lanxi'?originalLanxiVoice(kind):themeVoicePlan(skin,kind);
  if(voices.size>16)return;
  const start=audio.currentTime;
  for(const note of notes){
   const oscillator=audio.createOscillator(),gain=audio.createGain(),t=start+note.offset,voice={oscillator,gain};voices.add(voice);
   oscillator.type=note.type;oscillator.frequency.setValueAtTime(note.hz,t);oscillator.frequency.exponentialRampToValueAtTime(note.endHz,t+note.length);
   gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime((prefs.uiVolume??.3)*note.gain,t+(note.attack??.01));gain.gain.exponentialRampToValueAtTime(.0001,t+note.length);
   oscillator.connect(gain);gain.connect(audio.destination);oscillator.onended=()=>{voices.delete(voice);oscillator.disconnect();gain.disconnect();};oscillator.start(t);oscillator.stop(t+note.length+.01);
  }
 }catch{/* Optional audio must not interrupt business controls. */}
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b.id!=='audition'&&!b.dataset.soundPack&&!b.dataset.artSound&&!b.dataset.artPack&&!b.disabled)tone(b.dataset.quick==='done'?'done':b.dataset.view?'nav':'tap');},true);
document.addEventListener('visibilitychange',syncInteraction);motionPreference.addEventListener('change',syncInteraction);
window.chrome?.webview?.addEventListener('message',event=>{if(event.data?.type==='host-visibility'&&typeof event.data.hidden==='boolean'){hostHidden=event.data.hidden;syncInteraction();}});
function ensureDate(){if(!$('#themeDate')){const b=document.createElement('button');b.id='themeDate';b.className='theme-date';b.setAttribute('aria-label','查看本月日历');$('.page-heading').insertBefore(b,$('#newImport'));b.onclick=openCalendar;}}
function scheduleDate(){clearInterval(dateTimer);if(hidden()||!$('#themeDate'))return;updateDate();dateTimer=setInterval(updateDate,60000);}
function updateDate(){const d=new Date();$('#themeDate').innerHTML='<strong>'+d.getDate()+'</strong><span>'+d.getFullYear()+' / '+String(d.getMonth()+1).padStart(2,'0')+'</span><small>'+d.toLocaleDateString('zh-CN',{weekday:'long'})+'</small>';}
function openCalendar(){let dialog=$('#themeCalendar');if(!dialog){dialog=document.createElement('dialog');dialog.id='themeCalendar';dialog.className='theme-calendar';document.body.append(dialog);}const d=new Date(),last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(),first=new Date(d.getFullYear(),d.getMonth(),1).getDay();dialog.innerHTML='<h2>'+d.getFullYear()+'年'+(d.getMonth()+1)+'月</h2><div class="theme-calendar-grid">'+['日','一','二','三','四','五','六'].map(s=>'<span>'+s+'</span>').join('')+'<span></span>'.repeat(first)+Array.from({length:last},(_,i)=>i+1).map(n=>n===d.getDate()?'<b>'+n+'</b>':'<span>'+n+'</span>').join('')+'</div><button class="secondary" id="closeMonth">关闭</button>'+(window.chrome?.webview?'<button class="primary" id="systemCalendar">打开系统日历</button>':'');$('#closeMonth').onclick=()=>dialog.close();if($('#systemCalendar'))$('#systemCalendar').onclick=()=>window.chrome.webview.postMessage({action:'calendar'});dialog.showModal();}

// Original outline icons keep the product's existing labels and handlers.
function decorateChrome(){
 const paths={reading:'M5 4h14v16l-7-4-7 4z M8 8h8 M8 11h5',overview:'M4 5h16v14H4z M4 9h16 M9 9v10',pending:'M5 4h14v16H5z M8 11l3 3 5-6',archive:'M12 4a8 8 0 1 1-6 2 M4 3v5h5 M12 7v5l3 2',groups:'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',courses:'M4 5h16v15H4z M4 10h16 M9 5v15 M15 5v15',notifications:'M6 16h12l-2-3V9a4 4 0 0 0-8 0v4z M10 20h4',audit:'M5 4h14v16H5z M8 8h8 M8 12h5 M8 16h7',sources:'M4 8h6l2-3h8v14H4z M12 11v5 M9.5 13.5l2.5 2.5 2.5-2.5',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4'};
 for(const b of document.querySelectorAll('.sidebar nav button[data-view]')){
  const path=paths[b.dataset.view==='content'?'reading':b.dataset.view],span=b.firstElementChild;if(!span)continue;
  if(!span.dataset.artOriginal)span.dataset.artOriginal=span.innerHTML;
  if(document.documentElement.dataset.skin==='lanxi'){span.innerHTML=span.dataset.artOriginal;span.classList.remove('nav-art-icon');delete span.dataset.artIcon;continue;}
  if(!path||span.dataset.artIcon)continue;
  span.dataset.artIcon='1';span.classList.add('nav-art-icon');span.setAttribute('aria-hidden','true');span.innerHTML='<svg viewBox="0 0 24 24"><path d="'+path+'"/></svg>';
 }
}
function artThemeChoices(selected){
 return '<div class="art-theme-choices" role="group" aria-label="选择主题风格">'+[
  ['classic','拾光 · 简洁','保留的简洁样式稿','尚未完成整套美术设计','SHIGUANG'],
  ['lanxi','拾光 · P3R风格','恢复亮蓝流光、斜切导航与倾斜日期','原版渐入与界面提示音','LANXI'],
  ['folio','纸上编年','保留的纸面样式稿','整套配图、拟音与动作待重做','拾光手记']
 ].map(([id,title,look,feel,word])=>'<button type="button" class="art-theme-choice" data-art-pack="'+id+'" aria-pressed="'+(selected===id)+'"><span class="art-mini '+id+'" aria-hidden="true"><em>'+word+'</em><i></i></span><span class="art-theme-copy"><b>'+title+'</b><small>'+look+'<br>'+feel+'</small></span></button>').join('')+'</div>';
}
function playMotion(target,frames,options){
 if(!target||hidden()||reduced())return;
 const animation=target.animate?.(frames,options);if(animation){pageAnimations.add(animation);animation.onfinish=animation.oncancel=()=>pageAnimations.delete(animation);}return animation;
}
function artMotion(target,role='page',delay=0){
 const skin=document.documentElement.dataset.skin,base=({quick:155,balanced:235,relaxed:330})[prefs.motionTempo||'balanced']||235;
 const frames=skin==='lanxi'?[{opacity:.25,transform:role==='dialog'?'translateY(12px) scale(.985)':'translateX(16px)'},{opacity:1,transform:'none'}]
  :skin==='folio'?[{opacity:.35,transform:'translateY(8px) rotate(-.3deg)',transformOrigin:'15% 0%'},{opacity:1,transform:'none',transformOrigin:'15% 0%'}]
  :[{opacity:.4,transform:role==='dialog'?'translateY(5px) scale(.985)':'translateY(4px)'},{opacity:1,transform:'none'}];
 return playMotion(target,frames,{duration:base*(role==='dialog'?1.05:1),delay,easing:skin==='lanxi'?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.2,.7,.25,1)'});
}
// Observe only dialog opening, with no business or layout mutation.
new MutationObserver(records=>{
 for(const record of records){const node=record.target;if(node instanceof HTMLDialogElement&&node.open)artMotion(node,'dialog');}
}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});

// Restore the former Lanxi UI sweep; this is not a full P3R soundtrack or foley pack.
function originalLanxiVoice(kind){return [{hz:kind==='done'?1100:kind==='nav'?660:850,endHz:kind==='done'?1500:kind==='nav'?950:500,offset:0,length:.13,gain:.12,type:'sine',attack:.001}];}
