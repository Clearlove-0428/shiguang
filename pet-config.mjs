import {existsSync} from 'node:fs';
import {join} from 'node:path';
const aliases={classic:'shijian',lanxi:'xibai'};
export function installedPets(root){return ['gojo','miku','ren','haru','shijian','xibai','moli'].filter(id=>existsSync(join(root,'public',id==='gojo'?'pet-assets/gojo-sheet.png':['miku','ren','haru'].includes(id)?'live2d/'+id+'.png':'pet-assets/'+id+'.png')));}
export function desktopAppearance(a={}){
 const requested=aliases[a.petSkin]||a.petSkin;
 const skin=['shijian','xibai','moli','miku','haru','ren','gojo'].includes(requested)?requested:a.pack==='lanxi'?'xibai':a.pack==='folio'?'moli':'shijian';
 return{skin,reduceMotion:!!a.reduceMotion,colorMode:a.theme==='dark'?'dark':'light',fontSize:Number.isInteger(a.fontSize)&&a.fontSize>=14&&a.fontSize<=24?a.fontSize:16,petSize:['small','medium','large'].includes(a.petSize)?a.petSize:'medium',petMotion:a.petMotion==='responsive'?'responsive':'quiet'};
}
