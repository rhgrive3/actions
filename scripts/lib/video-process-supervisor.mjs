import{spawn}from'node:child_process';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';
// Linux subreaper owns even reparented/detached Chromium descendants.
export function supervise(command,args,{ms=600000,maxOutput=1024*1024,onOutput=()=>{}}={}){
 assert.equal(process.platform,'linux','requires Linux child-subreaper/proc ownership');
 return new Promise((resolve,reject)=>{const p=spawn('python3',[fileURLToPath(new URL('./video-process-supervisor.py',import.meta.url)),String(ms),String(maxOutput),command,...args],{stdio:['ignore','pipe','pipe']});let data='',err='';p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');p.stdout.on('data',b=>data+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',(code,signal)=>{if(code||signal){reject(Error('supervisor failed: '+err));return;}try{const result=JSON.parse(data);onOutput(Buffer.from(result.output));delete result.output;if(result.error||result.timedOut||result.overflow||result.signal||result.code!==0||!result.cleanupComplete)reject(Object.assign(Error('owned capture process failed'),{result}));else resolve(result);}catch(e){reject(e);}});});
}
