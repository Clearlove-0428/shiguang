export const soundPacks=[['soft','柔和水滴'],['bell','清亮风铃'],['wood','轻木敲击'],['digital','电子星光']];
export function voicePlan(pack,kind='tap'){
 const profiles={soft:{notes:[520,780],type:'sine',length:.26,gain:.18},bell:{notes:[880,1320,1760],type:'sine',length:.38,gain:.12},wood:{notes:[340,480],type:'triangle',length:.1,gain:.13},digital:{notes:[660,990,1320],type:'sine',length:.14,gain:.16}};
 const p=profiles[pack]||profiles.soft,full=['done','preview','reminder'].includes(kind),notes=full?p.notes:[p.notes[kind==='nav'?1:0]];
 return notes.map((hz,i)=>({hz,endHz:pack==='soft'?hz*.8:hz,offset:i*(kind==='reminder'?.22:.07),length:kind==='reminder'?p.length*1.4:p.length,gain:p.gain,type:p.type}));
}

// Original UI earcons: airy glass, tidal synth and short wooden plucks.
// All notes have a softened attack and a finite tail. No sampled third-party audio.
export function themeVoicePlan(skin='classic',kind='tap'){
 const full=kind==='done'||kind==='preview';
 const score=skin==='lanxi'?{root:587.33,notes:full?[587.33,880,1174.66]:kind==='nav'?[587.33,880]:[784],step:.058,length:.18,body:.085,type:'sine',overtone:2,gain:.016}
  :skin==='folio'?{root:392,notes:full?[392,523.25]:[kind==='nav'?349.23:440],step:.075,length:.11,body:.095,type:'triangle',overtone:2.76,gain:.013}
  :{root:523.25,notes:full?[523.25,659.25,784]:[kind==='nav'?659.25:523.25],step:.085,length:.23,body:.075,type:'sine',overtone:2,gain:.012};
 const notes=[];
 for(let i=0;i<score.notes.length;i++){
  const hz=score.notes[i],offset=i*score.step,length=full?score.length:score.length*.68;
  notes.push({hz,endHz:skin==='folio'?hz*.82:hz,offset,length,gain:score.body,type:score.type,attack:skin==='folio'?.005:.009});
  notes.push({hz:hz*score.overtone,endHz:hz*score.overtone,offset:offset+.003,length:length*.55,gain:score.gain,type:'sine',attack:.004});
 }
 return notes;
}
