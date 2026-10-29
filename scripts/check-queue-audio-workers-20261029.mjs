import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),at=process.argv.indexOf('--evidence');
if(at<0||!process.argv[at+1])throw Error('--evidence required');const evidence=path.resolve(process.argv[at+1]);
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Queue audio worker verification</title>');return;}if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root))throw Error('path');const body=fs.readFileSync(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {WeaponSoundBank,AUDIO_RECIPES}=await import('/patches/splatoon3/runtime/audio/bank.mjs');
  const {renderSound}=await import('/patches/splatoon3/runtime/audio/render.mjs');
  const {PitchPreservingChargeCache,stretchChargerPCM}=await import('/patches/splatoon3/runtime/audio/pitch-preserving-charge.mjs');
  const check=(v,message)=>{if(!v)throw Error(message);};
  const equal=(a,b,label)=>{check(a.length===b.length,label+' length');const x=new Uint32Array(a.buffer,a.byteOffset,a.length),y=new Uint32Array(b.buffer,b.byteOffset,b.length);for(let i=0;i<x.length;i++)check(x[i]===y[i],label+' sample '+i);};
  const wait=async(fn,label)=>{const end=performance.now()+20000;while(!fn()){if(performance.now()>end)throw Error(label+' timeout');await new Promise(r=>setTimeout(r,10));}};
  const rows=[];
  for(const rate of [44100,48000,96000]){
   const ctx=new AudioContext({sampleRate:rate}),bank=new WeaponSoundBank(ctx,{workerTimeoutMs:10000,workerIdleMs:60}),charge=new PitchPreservingChargeCache(ctx,{workerTimeoutMs:10000,workerIdleMs:60});
   let silentUrl;
   try{
    bank.warm('shooter',{events:['fire']});await wait(()=>bank.pending.size===0,'authored warm');check(bank.generatedOffThread===3,'three real Worker jobs');
    let samples=0;for(let v=0;v<3;v++){const actual=bank.get('shooter','fire',v).getChannelData(0),expected=renderSound(AUDIO_RECIPES.shooter,'fire',v,rate);equal(actual,expected,'worker PCM');samples+=actual.length;}
    const ready=bank.get('shooter','fire');await wait(()=>bank.worker===null,'authored idle retire');check(bank.get('shooter','fire')===ready,'AudioBuffer identity after retirement');
    bank.warm('roller',{events:['fire']});await wait(()=>bank.pending.size===0,'new authored Worker');check(bank.generatedOffThread===6,'replacement Worker makes remaining jobs');
    const source=ctx.createBuffer(2,Math.round(rate*.24),rate);for(let c=0;c<2;c++){const data=source.getChannelData(c);for(let i=0;i<data.length;i++)data[i]=Math.sin(i*.07+c*.3)*.25;}
    check(charge.prepare('charger',source,.5),'WSOLA admitted');await wait(()=>charge.lookup('charger',source,.5),'WSOLA complete');const stretched=charge.lookup('charger',source,.5),expected=stretchChargerPCM([source.getChannelData(0),source.getChannelData(1)],rate,.5);
    for(let c=0;c<2;c++){equal(stretched.getChannelData(c),expected[c],'WSOLA PCM');samples+=expected[c].length;}
    await wait(()=>charge.worker===null,'WSOLA idle retire');check(charge.lookup('charger',source,.5)===stretched,'WSOLA ready identity');
    silentUrl=URL.createObjectURL(new Blob(['self.onmessage=()=>{}'],{type:'text/javascript'}));charge.workerFactory=()=>new Worker(silentUrl);charge.workerTimeoutMs=180;
    for(const [i,time] of [.4,.6,.7,.8].entries())check(charge.prepare('silent-'+i,source,time),'silent WSOLA slot '+i);
    check(charge.pending.size===4,'four slots owned');await wait(()=>charge.workerTimeouts===1&&charge.pending.size===0,'silent WSOLA deadline');
    check(charge.worker===null,'silent Worker retired');check(charge.prepare('retry',source,.4)===false,'explicit retry respects backoff');check(charge.lookup('charger',source,.5)===stretched,'ready buffer survives timeout');
    const failed=new WeaponSoundBank(ctx,{workerFactory:()=>new Worker(silentUrl),workerTimeoutMs:180,workerIdleMs:60});try{
     failed.warm('shooter',{events:['fire']});await wait(()=>failed.workerFailed&&failed.pending.size===0,'silent authored fallback');check(failed.cache.size===3&&failed.worker===null,'fallback drained bounded queue');
     for(let v=0;v<3;v++)equal(failed.get('shooter','fire',v).getChannelData(0),renderSound(AUDIO_RECIPES.shooter,'fire',v,rate),'fallback PCM');
    }finally{failed.dispose();}
    rows.push({sampleRate:ctx.sampleRate,authoredWorkerJobs:bank.generatedOffThread,comparedSamples:samples,bitExact:true,idleRetirement:true,bufferIdentityRetained:true,stalledAuthoredRecovery:true,stalledWsolaSlotsReleased:4,retryBackoff:true});
   }finally{bank.dispose();charge.dispose();if(silentUrl)URL.revokeObjectURL(silentUrl);await ctx.close();}
  }
  const {readEncodedAudioResponse}=await import('/patches/splatoon3/runtime/audio/encoded-response.mjs');
  const file='/inkwave-public/assets/audio/charger-first-splatune2-reference.mp3';
  const original=await (await fetch(file)).arrayBuffer(),bounded=await readEncodedAudioResponse(await fetch(file),512*1024,{minBytes:10000});
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const sha=await digest(bounded);check(sha==='4ccd52136e6240c788b68c4def7b7f46642b8b9cfc70b97772b1dce4c10e6a1d'&&sha===await digest(original),'original recorded MP3 unchanged');
  const decoder=new OfflineAudioContext(2,128,48000),before=await decoder.decodeAudioData(original),after=await decoder.decodeAudioData(bounded);
  check(before.numberOfChannels===after.numberOfChannels,'recorded channels');for(let ch=0;ch<before.numberOfChannels;ch++)equal(before.getChannelData(ch),after.getChannelData(ch),'recorded stream decode');
  let sent=0,cancelled=0;const oversized=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(sent++?1:512*1024));},cancel(){cancelled++;}},{highWaterMark:0}));
  let rejected=false;try{await readEncodedAudioResponse(oversized,512*1024);}catch{rejected=true;}check(rejected&&cancelled===1&&!oversized.body.locked,'browser oversized stream cancelled');
  return {userAgent:navigator.userAgent,rows,encodedResponse:{bytes:36571,sha256:sha,decodedFrames:after.length,channels:after.numberOfChannels,bitExact:true,oversizedStreamCancelled:true},passed:true};
 });
 if(errors.length)throw Error(errors.join('\n'));result.pageErrors=errors;
 fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
