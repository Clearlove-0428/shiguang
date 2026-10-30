import{readdirSync,readFileSync,existsSync,statSync,openSync,closeSync}from'node:fs';import{join,basename}from'node:path';import{freemem,totalmem,availableParallelism}from'node:os';import{spawn,execFile}from'node:child_process';
const mib=1024**2,delay=ms=>new Promise(r=>setTimeout(r,ms));
export const defaultModelPreferences={profile:'auto',modelFile:'auto',idleSeconds:120};
export function modelRuntime(root,file){const catalog=join(root,'models','runtime-catalog.json');if(!existsSync(catalog))return'runtime';const records=JSON.parse(readFileSync(catalog,'utf8')),runtime=records[file]?.runtime||'runtime';if(!/^runtime(?:\/llama-[a-zA-Z0-9_-]+)?$/.test(runtime))throw Error('本地模型运行配置无效');return runtime;}
export function modelInventory(root){return readdirSync(join(root,'models')).filter(name=>name.endsWith('.gguf')&&statSync(join(root,'models',name)).isFile()).map(name=>({name,sizeMiB:Math.ceil(statSync(join(root,'models',name)).size/mib),runtime:modelRuntime(root,name)})).sort((a,b)=>a.sizeMiB-b.sizeMiB);}
export function modelPreferences(value={},files=[]){const p={...defaultModelPreferences,...value};if(!['auto','cpu','quality','rules'].includes(p.profile)||!['auto',...files.map(x=>x.name)].includes(p.modelFile)||p.modelFile!==basename(p.modelFile)||![60,120,300,600].includes(p.idleSeconds))throw Error('模型配置无效，请选择已安装模型及有效空闲时长');return p;}
export function chooseModelPlan(files,h,p){
 const context=p.profile==='quality'?8192:4096,threads=Math.max(1,Math.min(p.profile==='quality'?6:4,Math.max(1,h.threads-2)));
 const gpu=h.gpu,reserve=gpu?Math.max(1536,Math.ceil(gpu.totalMiB*.25)):0,budget=gpu?Math.max(0,gpu.freeMiB-reserve):0;
 const candidates=files.filter(f=>h.freeRamMiB>=f.sizeMiB+context/8+1536);
 const baseline=candidates.find(f=>f.name==='Qwen3-4B-Q4_K_M.gguf');
 const file=p.modelFile!=='auto'?files.find(f=>f.name===p.modelFile):p.profile==='quality'?candidates.at(-1):baseline||candidates[0];
 if(p.profile==='rules'||!file||h.freeRamMiB<file.sizeMiB+context/8+1536)return{fallback:true,reason:p.profile==='rules'?'已选择规则初筛':'可用内存不足或没有可用模型，暂用规则初筛',context,threads};
 const overhead=context/8,full=budget>=file.sizeMiB+overhead+256;
 const gpuLayers=p.profile==='cpu'||!gpu?0:full?99:Math.max(0,Math.min(24,Math.floor((budget-overhead)/file.sizeMiB*24)));
 return{file:file.name,runtime:file.runtime||'runtime',context,threads,gpuLayers,device:gpuLayers?gpu.device||'Vulkan0':'none',reserveMiB:reserve,gpuBudgetMiB:budget,reason:gpuLayers===99?'显存允许，使用GPU并留出其它程序空间':gpuLayers?'显存较紧，部分计算放在CPU':'使用CPU，给其它程序保留显存'};
}
const command=(exe,args)=>new Promise(resolve=>execFile(exe,args,{windowsHide:true,timeout:5000,encoding:'utf8',maxBuffer:256000},(e,out)=>resolve(e?'':out)));
export async function detectHardware(root){
 const h={totalRamMiB:Math.floor(totalmem()/mib),freeRamMiB:Math.floor(freemem()/mib),threads:availableParallelism(),gpu:null};
 const rows=await command('nvidia-smi',['--query-gpu=name,memory.total,memory.free','--format=csv,noheader,nounits']);
 const [name,total,free]=rows.trim().split(/\r?\n/)[0]?.split(/,\s*/)||[];
 if(name&&Number(total)>0&&Number(free)>=0){const devices=await command(join(root,'runtime','llama-server.exe'),['--list-devices']);const device=devices.split(/\r?\n/).find(x=>x.includes(name))?.match(/(Vulkan\d+):/)?.[1];if(device)h.gpu={name,totalMiB:Number(total),freeMiB:Number(free),device};}
 return h;
}
export class LocalModel{
 constructor({root,data,port,key,setting,busy=()=>false,launcher=spawn,fetcher=fetch,hardwareReader=detectHardware,clock=()=>Date.now(),sleep=delay,env=process.env}){Object.assign(this,{root,data,port,key,setting,busy,launcher,fetcher,hardwareReader,clock,sleep,env});this.child=null;this.flight=null;this.lastUsed=clock();this.generation=0;this.state={state:'idle',name:'按需加载',message:'未处理通知时不加载模型；已有日程照常提醒',profile:null,hardware:null};}
 files(){try{return modelInventory(this.root);}catch{return[];}}
 preferences(){const files=this.files(),saved=this.setting('modelPreferences',{});return modelPreferences(saved.modelFile&&saved.modelFile!=='auto'&&!files.some(f=>f.name===saved.modelFile)?{...saved,modelFile:'auto'}:saved,files);}
 touch(){this.lastUsed=this.clock();}
 ensure(){this.touch();if(this.state.state==='ready'||this.state.state==='rules')return Promise.resolve();if(this.flight)return this.flight;if(this.state.state==='error'&&this.clock()<(this.retryAt||0))return Promise.reject(Error(this.state.message));this.flight=this.load().finally(()=>{this.flight=null;});return this.flight;}
 async load(){
  if(this.preferences().profile==='rules'){Object.assign(this.state,{state:'rules',name:'规则初筛',message:'已选择规则初筛，不加载模型'});return;}
  if(this.env.SHIGUANG_NO_MODEL==='1')throw Error('当前运行环境禁用模型，可使用规则初筛');
  const generation=++this.generation;Object.assign(this.state,{state:'loading',message:'按当前可用资源准备本地模型'});
  try{
   if(this.retired)await this.retired;
   const h=await this.hardwareReader(this.root),plan=chooseModelPlan(this.files(),h,this.preferences());if(generation!==this.generation)return;
   Object.assign(this.state,{hardware:h,profile:plan});if(plan.fallback){Object.assign(this.state,{state:'rules',name:'规则初筛',message:plan.reason});return;}
   const runtime=join(this.root,plan.runtime),exe=join(runtime,'llama-server.exe');if(!existsSync(exe))throw Error('未找到本地推理程序');
   const args=['-m',join(this.root,'models',plan.file),'--host','127.0.0.1','--port',String(this.port),'--api-key',this.key,'-c',String(plan.context),'-t',String(plan.threads),'-ngl',String(plan.gpuLayers),'--device',plan.device,'--parallel','1','--jinja','--no-webui','--log-disable'];if(!plan.gpuLayers)args.push('--no-kv-offload');
   const log=openSync(join(this.data,'model.log'),'a');let child;try{child=this.launcher(exe,args,{cwd:runtime,windowsHide:true,stdio:['ignore',log,log]});}finally{closeSync(log);}this.child=child;Object.assign(this.state,{name:plan.file.replace(/\.gguf$/,''),message:'正在载入模型 · '+plan.reason});
   child.on('error',()=>{if(this.child===child){this.child=null;Object.assign(this.state,{state:'error',message:'推理程序启动失败，请检查本地日志'});}});
   child.on('exit',()=>{if(this.child===child){this.child=null;Object.assign(this.state,{state:'error',message:'模型意外停止，可重试或使用规则初筛'});}});
   for(let i=0;i<90&&this.child===child&&generation===this.generation;i++){try{const r=await this.fetcher('http://127.0.0.1:'+this.port+'/health',{headers:{Authorization:'Bearer '+this.key},signal:AbortSignal.timeout(1500)});if(r.ok){Object.assign(this.state,{state:'ready',message:'本地模型已就绪 · '+plan.reason});this.touch();return;}}catch{}await this.sleep(1000);}
   if(generation===this.generation)throw Error('模型载入失败或超时，可重试或选择CPU/规则初筛');
  }catch(e){if(generation===this.generation){const child=this.child;this.child=null;if(child)child.kill();this.retryAt=this.clock()+60000;Object.assign(this.state,{state:'error',message:e.message});}throw e;}
 }
 release(force=false){if(!force&&(this.busy()||this.flight))throw Error('通知正在处理，完成后才能释放模型');++this.generation;const child=this.child;this.child=null;this.retryAt=0;if(child){this.retired=new Promise(r=>{child.once('exit',r);setTimeout(r,3000).unref();child.kill();});}Object.assign(this.state,{state:force?'stopped':'idle',message:force?'模型已退出':'模型已释放，下一次处理通知时重新加载'});this.touch();}
 tick(){if(this.state.state==='ready'&&!this.busy()&&!this.flight&&this.clock()-this.lastUsed>=this.preferences().idleSeconds*1000)this.release();}
 status(){return{...this.state,preferences:this.preferences(),files:this.files()};}
}
