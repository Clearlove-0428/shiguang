// Lanxi is an entry point to the same local service, never a second database.
import http from 'node:http';
const port=Number(process.env.LANXI_PORT||43537),upstream=Number(process.env.SHIGUANG_UPSTREAM_PORT||43527),host='127.0.0.1:'+port,origin='http://'+host;
const server=http.createServer((req,res)=>{
 if(req.headers.host!==host||!req.url.startsWith('/')||req.url.startsWith('//')||(['POST','PUT','DELETE','PATCH'].includes(req.method)&&(req.headers['x-shiguang']!=='1'||req.headers.origin&&req.headers.origin!==origin))){res.writeHead(403);res.end('Local origin required');return;}
 const headers={...req.headers,host:'127.0.0.1:'+upstream};if(headers.origin)headers.origin='http://127.0.0.1:'+upstream;
 const request=http.request({hostname:'127.0.0.1',port:upstream,path:req.url,method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
 request.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('本地服务尚未启动，请使用启动蓝汐。');});req.on('aborted',()=>request.destroy());req.pipe(request);
});server.listen(port,'127.0.0.1',()=>console.log('Lanxi shared service entry: '+origin));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
// This proxy owns no data. Exit once its shared backend has stopped.
let connected=false,failures=0;
setInterval(async()=>{try{const r=await fetch('http://127.0.0.1:'+upstream+'/api/windows',{signal:AbortSignal.timeout(1500)});if(r.ok){connected=true;failures=0;}}catch{if(connected&&++failures>=2){server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();}}},1500).unref();
