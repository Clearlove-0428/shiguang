import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

// Distribution defaults share the production service; they never replace existing preferences.
export function applyReleaseDefaults({root,setting,saveSetting}){
 const file=join(root,'release-profile.json');
 if(!existsSync(file))return;
 const profile=JSON.parse(readFileSync(file,'utf8'));
 if(profile.schemaVersion!==1||!['p3r-beta','source'].includes(profile.edition)||!['classic','lanxi','folio'].includes(profile.defaultTheme)||!['gojo','shijian','xibai','moli'].includes(profile.defaultPet))throw Error('发行配置无效');
 if(setting('releaseDefaultsApplied',false))return;
 const current=setting('appearance',{});
 if(!current.pack){
  saveSetting('appearance',{theme:'light',font:'system',fontSize:18,uiSound:true,uiVolume:.3,reduceMotion:false,...current,pack:profile.defaultTheme,petSkin:profile.defaultPet,palette:current.palette||'tidal'});
  saveSetting('widgetMode',profile.edition==='source'?'off':'pet');
  if(profile.edition==='source'){saveSetting('backgroundReminders',false);saveSetting('modelPreferences',{profile:'rules',modelFile:'auto',idleSeconds:120});}
 }
 saveSetting('releaseDefaultsApplied',true);
}
