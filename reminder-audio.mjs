import {voicePlan,soundPacks} from './public/sound-palette.js';
export const validSound=id=>soundPacks.some(([key])=>id===key);
export function reminderWav(pack,volume=.6){
 if(!validSound(pack)||!Number.isFinite(volume)||volume<0||volume>1)throw Error('提示音设置无效');
 const plan=voicePlan(pack,'reminder'),rate=22050,count=Math.ceil((Math.max(...plan.map(n=>n.offset+n.length))+.1)*rate),b=Buffer.alloc(44+count*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++){let value=0;const t=i/rate;for(const n of plan){const dt=t-n.offset;if(dt<0||dt>n.length)continue;const phase=2*Math.PI*(n.hz*dt+(n.endHz-n.hz)*dt*dt/(2*n.length)),wave=n.type==='triangle'?2/Math.PI*Math.asin(Math.sin(phase)):Math.sin(phase),envelope=Math.min(1,dt/.01)*Math.pow(1-dt/n.length,2);value+=wave*envelope*n.gain*volume;}b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+i*2);}
 return b;
}
