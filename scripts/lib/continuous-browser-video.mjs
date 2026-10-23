// QA-only recorder primitive. Requires a separately reviewed rendered scenario adapter.
// Does not launch a browser, build a site, encode stills, or authorize delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export async function verifyBuild(site,pin){
 assert.match(pin.head,/^[a-f0-9]{40}$/);for(const k of ['inputHash','contentHash','proofSha256'])assert(digest(pin[k]),'missing independently approved '+k);
 const root=await fs.realpath(site),manifest=JSON.parse(await fs.readFile(path.join(root,'inkwave-build.json'),'utf8'));
 assert.equal(sha256(JSON.stringify(manifest.files)),pin.inputHash,'input map drift');
 assert.equal(sha256(JSON.stringify(manifest.artifacts)),pin.contentHash,'artifact map drift');
 assert.equal(manifest.inputHash,pin.inputHash);assert.equal(manifest.contentHash,pin.contentHash);
 assert(Object.keys(manifest.artifacts).length>0,'empty build');
 for(const [rel,expected]of Object.entries(manifest.artifacts)){
  assert(!path.isAbsolute(rel)&&!rel.split(/[\\/]/).includes('..'),'unsafe artifact path');assert(digest(expected));
  const file=await fs.realpath(path.join(root,rel));assert(file.startsWith(root+path.sep),'artifact escapes site');
  assert.equal(sha256(await fs.readFile(file)),expected,'artifact bytes drift: '+rel);
 }
 return {head:pin.head,inputHash:pin.inputHash,contentHash:pin.contentHash,proofSha256:pin.proofSha256,artifactCount:Object.keys(manifest.artifacts).length};
}
export function validateProgress(samples,{minimumSeconds=4,minimumRenderedFrames=20,minimumSimulationTicks=120,minimumActivitySamples=2}={}){
 assert(samples.length>=3,'missing actual renderer/tick observations');
 for(let i=0;i<samples.length;i++){
  const r=samples[i];for(const k of ['wallMs','renderedFrames','simulationTicks'])assert(Number.isFinite(r[k])&&r[k]>=0,'invalid '+k);
  assert(Number.isInteger(r.renderedFrames)&&Number.isInteger(r.simulationTicks));assert(typeof r.activity==='boolean');
  if(i){const p=samples[i-1];assert(r.wallMs>p.wallMs&&r.renderedFrames>=p.renderedFrames&&r.simulationTicks>=p.simulationTicks,'clock/counter regression');}
 }
 {for(const r of samples){assert(Number.isFinite(r.gameTime)&&r.playing&&!r.paused&&r.alive,'paused/nonlive gameplay');assert.equal(r.camera,samples[0].camera,'camera drift');assert.equal(r.lights,samples[0].lights,'light drift');}assert(samples.at(-1).gameTime-samples[0].gameTime>=2,'gameplay time stalled');assert(new Set(samples.map(s=>s.world)).size>=3,'projectile state stalled');}
 const first=samples[0],last=samples.at(-1),seconds=(last.wallMs-first.wallMs)/1000;
 const frames=last.renderedFrames-first.renderedFrames,ticks=last.simulationTicks-first.simulationTicks;
 assert(seconds>=minimumSeconds&&frames>=minimumRenderedFrames&&ticks>=minimumSimulationTicks&&frames/seconds>=5,'blank/stalled/too-short scenario');
 assert(samples.filter(s=>s.activity).length>=minimumActivitySamples,'projectile/paint activity not observed');
 return {wallSeconds:seconds,renderedFrameDelta:frames,simulationTickDelta:ticks,observedRenderHz:frames/seconds,observedSimulationHz:ticks/seconds};
}
export function validateDecodedVideo(report){
 assert(report.stream==='continuous-playwright-webm','not a continuous browser recording');
 assert(report.originalSpeed===true&&report.interpolated===false,'retimed/interpolated input rejected');
 for(const k of ['durationSeconds','decodedFrames','distinctFrameHashes','blackFraction','longestFreezeSeconds','actionStartSeconds'])assert(Number.isFinite(report[k]),'missing decoded '+k);
 assert(report.actionStartSeconds>=0&&report.actionStartSeconds<report.durationSeconds-4,'missing media-time action marker');
 assert(report.durationSeconds>=4&&report.decodedFrames>=20&&report.distinctFrameHashes>=10,'insufficient decoded motion');
 assert(report.blackFraction>=0&&report.blackFraction<.5,'blank majority');
 assert((report.frozenFraction??0)>=0&&(report.frozenFraction??0)<.5,'cumulative frozen majority');
 assert(report.longestFreezeSeconds>=0&&report.longestFreezeSeconds<Math.min(2,(report.analysisSeconds||report.durationSeconds)*.25),'stalled majority');
 return report;
}
export function validatePair(before,after){
 for(const row of [before,after]){assert.equal(row.status,'recorded-not-delivery-verified');assert.deepEqual(row.errors,[],'late browser errors');validateProgress(row.samples);validateDecodedVideo(row.decoded);assert(digest(row.rawSha256));}
 assert.notEqual(before.identity.head,after.identity.head,'same before/after head');
 for(const key of ['scenarioHash','cameraHash','lightingHash','inputScheduleHash','viewportHash','seed'])assert.equal(before[key],after[key],'unpaired '+key);
 for(const key of ['scenarioHash','cameraHash','lightingHash','inputScheduleHash','viewportHash'])assert(digest(before[key]));
 assert(Number.isSafeInteger(before.seed));assert.equal(before.simulationClock,'fixed-60Hz-from-wall-RAF');assert.equal(after.simulationClock,before.simulationClock);
 assert(Math.abs(validateProgress(before.samples).wallSeconds-validateProgress(after.samples).wallSeconds)<=.5,'unaligned recording windows');
 return {status:'pair-ready-for-original-speed-composition',before:before.rawSha256,after:after.rawSha256,deliveryVerified:false};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function deadline(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('capture deadline')),ms);})]);}finally{clearTimeout(timer);}}
export async function recordLane({browser,site,pin,out,scenario,seconds=8}){
 assert.equal(seconds,8,'reviewed input schedule is exactly8 wall seconds');
 for(const k of ['prepare','start','observe','finish'])assert.equal(typeof scenario[k],'function','reviewed adapter missing '+k);
 const identity=await verifyBuild(site,pin);await fs.mkdir(out,{recursive:true});const dir=await fs.mkdtemp(path.join(out,'raw-'));
 const context=await browser.newContext({viewport:{width:960,height:540},recordVideo:{dir,size:{width:960,height:540}}});
 let page,video,scenarioReceipt,samples=[],failure=null,watch,closing=false;const errors=[];
 const cap=async()=>{let bytes=0;for(const f of await fs.readdir(dir)){const st=await fs.stat(path.join(dir,f));bytes+=st.size;}assert(bytes<=32*1024*1024,'recording32MiB cap exceeded');};
 try{
  const capFailure=new Promise((_,reject)=>{watch=setInterval(()=>cap().catch(reject),1000);});
  await deadline(Promise.race([capFailure,(async()=>{
   page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(!closing)errors.push('requestfailed '+r.url());});page.on('response',r=>{if(r.status()>=400)errors.push('HTTP'+r.status()+' '+r.url());});video=page.video();assert(video,'Playwright video unavailable');
   await scenario.prepare(page);await page.evaluate(()=>{const e=document.createElement('div');e.id='__videoMarker';Object.assign(e.style,{position:'fixed',left:'0',top:'0',width:'100%',height:'16px',zIndex:'2147483647',background:'#ff00ff',color:'white',font:'12px monospace',paddingLeft:'24px',pointerEvents:'none'});e.textContent='native range diagnostic | original wall time | source simulation60Hz';document.body.append(e);});await page.waitForTimeout(200);await scenario.start(page);
   const end=performance.now()+seconds*1000;
   do{samples.push(await scenario.observe(page));await cap();assert.equal(errors.length,0,errors.join('\n'));await delay(100);}while(performance.now()<end);
   samples.push(await scenario.observe(page));scenarioReceipt=await scenario.finish(page);await page.waitForTimeout(200);assert(Math.abs(scenarioReceipt.timing.endWallMs-scenarioReceipt.timing.actionWallMs-8000)<500,'action wall schedule drift');
   validateProgress(samples);assert.equal(errors.length,0,errors.join('\n'));await verifyBuild(site,pin);
  })()]),210000);
 }catch(e){failure=e.message;}
 finally{clearInterval(watch);closing=true;try{await deadline(context.close(),10000);}catch(e){failure||=e.message;}}
 // External process/job timeout remains mandatory: Promise deadlines cannot kill a hung browser.
 try{await cap();}catch(e){failure||=e.message;}if(errors.length)failure||=errors.join('\n');let rawPath=null,rawSha256=null;if(video&&!failure){rawPath=await deadline(video.path(),5000);rawSha256=sha256(await fs.readFile(rawPath));}
 const result={...scenarioReceipt,errors,status:failure?'failed':'recorded-not-delivery-verified',failure,identity,rawPath,rawSha256,samples,scenarioReceipt,progress:failure?null:validateProgress(samples),decodedValidation:'pending',deliveryVerified:false};
 await fs.writeFile(path.join(dir,'recording.json'),JSON.stringify(result,null,2));if(failure)throw Error(failure);return result;
}

// FFmpeg is run only by an explicitly invoked future capture driver.
export function parseMarkers(text){let frame={},armed=false,start=null,end=null;for(const line of text.split('\n')){const m=line.match(/pts_time:([\d.]+)/);if(m)frame={pts:Number(m[1])};const v=line.match(/lavfi.signalstats.([YUV])AVG=([\d.]+)/);if(v)frame[v[1]]=Number(v[2]);if(['pts','Y','U','V'].every(k=>Number.isFinite(frame[k]))){if(frame.Y>70&&frame.Y<135&&frame.U>170&&frame.V>190)armed=true;if(start===null&&armed&&frame.Y>120&&frame.Y<170&&frame.U<90&&frame.V<90)start=frame.pts;if(start!==null&&frame.Y>20&&frame.Y<70&&frame.U>200&&frame.V>80&&frame.V<150){end=frame.pts;break;}}}assert(start!==null,'encoded magenta-to-green action marker absent');return {start,end};}
export function parseMarker(text){return parseMarkers(text).start;}
export function parseDecode({duration,frames,hashes,diagnostics,marker,analysisSeconds=8}){
 const rows=hashes.split('\n').filter(x=>x&&!x.startsWith('#')),unique=new Set(rows.map(x=>x.split(',').at(-1).trim()));
 let black=0;for(const m of diagnostics.matchAll(/black_duration:([\d.]+)/g))black+=Number(m[1]);
 let open=null;const intervals=[];for(const line of diagnostics.split('\n')){let m=line.match(/freeze_start: ([\d.]+)/);if(m)open=Number(m[1]);m=line.match(/freeze_duration: ([\d.]+)/);if(m&&open!==null){intervals.push([open,Math.min(analysisSeconds,open+Number(m[1]))]);open=null;}}if(open!==null)intervals.push([open,analysisSeconds]);
 const merged=[];for(const [start,end]of intervals.sort((a,b)=>a[0]-b[0])){assert(start>=0&&end>=start&&end<=analysisSeconds,'invalid normalized freeze interval');const last=merged.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else merged.push([start,end]);}const freeze=Math.max(0,...merged.map(([a,b])=>b-a)),frozenSeconds=merged.reduce((sum,[a,b])=>sum+b-a,0);

 return validateDecodedVideo({stream:'continuous-playwright-webm',originalSpeed:true,interpolated:false,durationSeconds:duration,decodedFrames:frames,distinctFrameHashes:unique.size,analysisSeconds,frozenFraction:frozenSeconds/analysisSeconds,freezeIntervals:merged,blackFraction:black/analysisSeconds,longestFreezeSeconds:freeze,actionStartSeconds:parseMarker(marker)});
}
