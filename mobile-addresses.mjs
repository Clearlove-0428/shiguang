// Shared by the PC settings UI and bridge; only orders/labels, never probes or exposes credentials.
export function rankAddresses(values){
 const rank=v=>{const s=typeof v==='string'?v:v.origin;if(s.includes('127.0.0.1'))return 99;if(typeof v==='object'&&v.virtual)return 50;return /http:\/\/192\.168\./.test(s)?0:/http:\/\/10\./.test(s)?1:2;};
 return [...values].sort((a,b)=>rank(a)-rank(b));
}
export function networkChoices(interfaces,port){
 const choices=[];
 for(const [name,rows] of Object.entries(interfaces))for(const row of rows||[]){
  if(row.family!=='IPv4'||row.internal||! /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(row.address))continue;
  if(choices.some(x=>x.address===row.address))continue;
  const virtual=/vethernet|wsl|vgate|vpn|virtual|vmware|vbox|docker|hyper-v|tailscale|zerotier|tun\d|tap\d/i.test(name);
  choices.push({origin:`http://${row.address}:${port}`,address:row.address,name,virtual});
 }
 return [...rankAddresses(choices),{origin:`http://127.0.0.1:${port}`,address:'127.0.0.1',name:'仅本机测试',virtual:true}];
}
