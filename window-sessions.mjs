// Native hosts register independently. Closing one host must not stop another.
export class WindowSessions {
 constructor({onEmpty,isAlive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}},grace=750,interval=2000}){this.onEmpty=onEmpty;this.isAlive=isAlive;this.grace=grace;this.windows=new Map();this.timer=setInterval(()=>this.reap(),interval);this.timer.unref?.();}
 open({id,pid}){if(typeof id!=='string'||!/^[a-f0-9-]{32,36}$/i.test(id)||!Number.isSafeInteger(pid)||pid<1||!this.isAlive(pid))throw Error('窗口注册无效');clearTimeout(this.pending);this.pending=null;this.windows.set(id,{id,pid});return this.state();}
 close({id,pid}){if(this.windows.get(id)?.pid===pid){this.windows.delete(id);this.maybeExit();}return this.state();}
 reap(){let removed=false;for(const [id,w]of this.windows){if(!this.isAlive(w.pid)){this.windows.delete(id);removed=true;}}if(removed)this.maybeExit();}
 maybeExit(){if(this.windows.size||this.pending)return;this.pending=setTimeout(()=>{this.pending=null;if(!this.windows.size)this.onEmpty();},this.grace);}
 state(){return {count:this.windows.size};}
 stop(){clearInterval(this.timer);clearTimeout(this.pending);this.windows.clear();}
}
