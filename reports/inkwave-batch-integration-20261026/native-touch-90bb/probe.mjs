// Narrow adaptation of existing shipping-menu/touch QA. Observation only:
// native Actor/charge/time/pose/fire/animation clocks are never assigned.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {enterRangeFromMenu,rangeMenuControlReady} from '/workspace/actions/scripts/lib/inkwave-range-menu-entry.mjs';
const {chromium}=createRequire('/workspace/actions/package.json')('playwright');
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(build.contentHash!=='6a41bfa4a334910e156f484fee14e5e09f4bba5b210a18bdffbe1d53057168a5')throw Error('Expected fixed integration build');
for(const [file,hash]of Object.entries(build.artifacts))if(sha(fs.readFileSync(path.join(site,file)))!==hash)throw Error('Artifact mismatch: '+file);
const result={status:'running',sourceHead:'90bb98c2ffbbe0fdaf959001808d6dd43e085f90',contentHash:build.contentHash,inputHash:build.inputHash,
 sandbox:true,configuration:{viewport:{width:960,height:640},isMobile:true,hasTouch:true,quality:'low',lang:'en'},cases:[],errors:[],warnings:[],requestFailures:[],verified:[],
 limits:['Chromium mobile/touch emulation is not iPad/Switch hardware or original-game parity.','Only normal trusted touch menus, loadout and held Fire drive gameplay. Observers forward original methods unchanged.','PCM is actual live graph output; physical speaker output is not measured.','No actor/charge/time/pose writes, manual frames or direct playback calls. Short flight may be missed.']};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page,cdp,touchHeld=false;
const deadline=setTimeout(()=>{result.deadlineExceeded=true;void browser?.close();server.close();},240000);
try{
 // Keep Chromium's own sandbox; do not weaken security or alter host permissions.
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,
  ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings']});
 result.browser=browser.version();
 const context=await browser.newContext({viewport:result.configuration.viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});page=await context.newPage();
 page.setDefaultTimeout(20000);cdp=await context.newCDPSession(page);
 const pending=new Set(),verified=new Set();
 page.on('pageerror',e=>result.errors.push(e.stack||e.message));
 page.on('console',e=>{if(e.type()==='warning'||e.type()==='error')result.warnings.push({type:e.type(),text:e.text()});});
 page.on('requestfailed',r=>result.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
 page.on('response',response=>{
  const rel=new URL(response.url()).pathname.slice(1);
  if(!build.artifacts[rel]||!/(?:src\/audio\/audio\.js|src\/core\/mobile\.js|src\/ui\/hud\.js|charger-charge-rise|pitch-preserving-charge|audio\/runtime|catalog-charge-stages|stringer-charge-hud|main-weapon-catalog)\.(?:mjs|js)$/.test(rel))return;
  const work=(async()=>{if(sha(await response.body())!==build.artifacts[rel])throw Error('Loaded runtime mismatch: '+rel);verified.add(rel);})();
  pending.add(work);work.catch(e=>result.errors.push(e.message)).finally(()=>pending.delete(work));
 });
 await page.addInitScript(()=>{
  // Isolated QA preference only; all weapon selection uses the visible loadout.
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en'}));
  window.nativeTouchGestures=[];window.nativeTouchPointerErrors=0;
  document.addEventListener('pointerlockerror',()=>window.nativeTouchPointerErrors++);
  for(const type of ['pointerdown','pointerup','pointercancel','click'])document.addEventListener(type,event=>{
   const el=event.target?.closest?.('[data-c],[data-id]');if(!el)return;
   window.nativeTouchGestures.push({type,trusted:event.isTrusted,pointerType:event.pointerType||null,control:el.dataset.c||el.dataset.id,wall:performance.now()});
  },true);
 });
 result.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{touch:true,timeout:90000,onProgress:r=>console.log('entry',r.route.join('/'))});
 await page.locator('[data-c="fire"]').waitFor({state:'visible'});
 result.observer=await page.evaluate(()=>{
  const G=window.__G,g=window.__inkwave,audio=G.audio;
  const q=window.nativeChargeQA={frames:[],events:[],shots:[],captures:[],pcm:[],audioSources:[],inRise:false};
  if(!audio?.ctx||!audio.master||!audio.playChargerChargeRise)throw Error('Live audio engine unavailable after shipping range entry');
  const chargeAnalyzer=audio.ctx.createAnalyser();chargeAnalyzer.fftSize=2048;
  const masterAnalyzer=audio.ctx.createAnalyser();masterAnalyzer.fftSize=2048;audio.master.connect(masterAnalyzer);
  const chargePcm=new Float32Array(chargeAnalyzer.fftSize),masterPcm=new Float32Array(masterAnalyzer.fftSize);
  const source=audio.ctx.createBufferSource;
  audio.ctx.createBufferSource=function(...args){
   const node=source.apply(this,args);if(!q.inRise)return node;
   const connect=node.connect,start=node.start;
   node.connect=function(target,...rest){const output=connect.call(this,target,...rest);target.connect(chargeAnalyzer);return output;};
   node.start=function(...args){q.audioSources.push({weapon:G.local.weaponId,time:G.time,wall:performance.now(),rate:this.playbackRate.value,duration:this.buffer?.duration,length:this.buffer?.length,args});return start.apply(this,args);};
   return node;
  };
  const rise=audio.playChargerChargeRise;
  audio.playChargerChargeRise=function(options){q.inRise=true;try{const h=rise.call(this,options);q.events.push({kind:'recorded-rise',weapon:G.local.weaponId,time:G.time,wall:performance.now(),playing:!!h?.playing,chargeTime:options.chargeTime});return h;}finally{q.inRise=false;}};
  const play=audio.play;audio.play=function(name,options,...rest){const output=play.call(this,name,options,...rest);if(name==='charger_full')q.events.push({kind:name,weapon:G.local.weaponId,time:G.time,wall:performance.now(),pitch:options?.pitch});return output;};
  function pcm(analyser,array){analyser.getFloatTimeDomainData(array);let peak=0,power=0;for(const n of array){peak=Math.max(peak,Math.abs(n));power+=n*n;}return {peak,rms:Math.sqrt(power/array.length)};}
  function frame(){
   const a=G.local,r=a?.weaponRunner;if(!r)return null;
   const ret=document.querySelector('.iw-ret--stringer-charge'),circle=document.querySelector('.iw-ret__charge'),track=document.querySelector('.iw-ret__track');
   return {weapon:a.weaponId,time:G.time,wall:performance.now(),q:r.charge,stage:r.chargeStage,stageProgress:r.chargeStageProgress,charging:r.charging,ink:a.ink,actor:a.pos.toArray(),aimPitch:a.aimPitch,
    fireInput:g.input?.mobile?.buttons?.fire,intentFire:a.intent?.fire,paused:G.match?.paused,frozen:g.frozen,audio:audio.ctx.state,
    heads:G.projectiles.list.filter(p=>p.owner===a).length,drops:G.projectiles.chargerDrops?.length||0,
    hudStage:ret?.dataset.chargeStage||null,offset:circle?.style.strokeDashoffset||null,trackStroke:track?getComputedStyle(track).stroke:null,flash:ret?.classList.contains('is-flash')||false,full:ret?.classList.contains('is-full')||false};
  }
  function capture(row,label){if(q.captures.some(c=>c.weapon===row.weapon&&c.label===label))return;
   try{q.captures.push({...row,label,dataURL:g.R.renderer.domElement.toDataURL('image/png')});}catch(error){q.events.push({kind:'capture-error',error:error.message});}}
  const render=g.R.render;g.R.render=function(...args){const output=render.apply(this,args),row=frame();if(!row)return output;
   if(q.frames.length<2500)q.frames.push(row);
   if(q.pcm.length<2500)q.pcm.push({weapon:row.weapon,time:row.time,wall:row.wall,q:row.q,charging:row.charging,charge:pcm(chargeAnalyzer,chargePcm),master:pcm(masterAnalyzer,masterPcm)});
   if(row.charging){if(row.stage===0&&row.stageProgress>.2&&row.stageProgress<.85)capture(row,'first-stage');if(row.stage===1&&row.stageProgress>.15&&row.stageProgress<.9)capture(row,'second-stage');if(row.stage===2&&row.full)capture(row,'full');if(!row.hudStage&&row.q>.25&&row.q<.9)capture(row,'charging');}
   if(row.heads||row.drops)capture(row,'flight');return output;
  };
  const draw=G.projectiles._draw;G.projectiles._draw=function(...args){const output=draw.apply(this,args),a=G.local,list=this.list.filter(p=>p.owner===a);if(q.shots.length<1500&&(list.length||this.chargerDrops.length))q.shots.push({weapon:a.weaponId,time:G.time,wall:performance.now(),ink:a.ink,heads:list.map(p=>({age:p.age,pos:p.pos.toArray(),start:p.start?.toArray(),catalog:!!p.catalog})),drops:this.chargerDrops.map(d=>({age:d.age,pos:d.pos?.toArray?.()}))});return output;};
  window.nativeChargeSnapshot=()=>({...frame(),menu:g.menus.current,pointerErrors:window.nativeTouchPointerErrors});
  return {audio:audio.ctx.state,mobile:g.input.mobile.active,touch:g.input.mobile.touch,visible:g.input.mobile.visible,renderer:G.renderer.getContext().getParameter(G.renderer.getContext().RENDERER)};
 });
 async function equip(id){
  await page.locator('[data-c="pause"]').tap();
  await page.waitForFunction(rangeMenuControlReady,{selector:'[data-id="r-tab-weapon"]',menu:'pause'});
  await page.locator('[data-id="r-tab-weapon"]').tap();
  const selector='[data-id="w-'+id+'"]';await page.locator(selector).scrollIntoViewIfNeeded();await page.locator(selector).tap();
  await page.waitForFunction(id=>__G.local.weaponId===id&&!__G.match.paused&&!__inkwave.menus.current,id);
  await page.locator('[data-c="fire"]').waitFor({state:'visible'});
 }
 for(const id of ['s3-charger-long','s3-stringer-normal']){
  result.activeWeapon=id;await equip(id);
  const before=await page.evaluate(()=>nativeChargeSnapshot());await page.screenshot({path:path.join(out,id+'-before.png')});
  const box=await page.locator('[data-c="fire"]').boundingBox();if(!box)throw Error('Visible Fire control has no box');
  const centre={x:box.x+box.width/2,y:box.y+box.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[centre]});touchHeld=true;
  let holdFailure=null;
  try{await page.waitForFunction(id=>__G.local.weaponId===id&&__G.local.weaponRunner.charge>=1&&__G.local.weaponRunner.charging&&(!id.includes('stringer')||document.querySelector('.iw-ret--stringer-charge')?.dataset.chargeStage==='full'),id,{timeout:40000});
   await page.screenshot({path:path.join(out,id+'-held-full.png')});
  }catch(error){holdFailure=error.message;}
  finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touchHeld=false;}
  const releasedAt=await page.evaluate(()=>__G.time);
  await page.waitForFunction(t=>!__G.local.weaponRunner.charging&&__G.time-t>=1.1,releasedAt,{timeout:20000}).catch(error=>{holdFailure||=error.message;});
  const after=await page.evaluate(()=>nativeChargeSnapshot());await page.screenshot({path:path.join(out,id+'-after.png')});
  const row=await page.evaluate(({id,before,after})=>({id,before,after,frames:nativeChargeQA.frames.filter(r=>r.weapon===id&&r.wall>=before.wall),events:nativeChargeQA.events.filter(r=>r.weapon===id&&r.wall>=before.wall),shots:nativeChargeQA.shots.filter(r=>r.weapon===id&&r.wall>=before.wall),pcm:nativeChargeQA.pcm.filter(r=>r.weapon===id&&r.wall>=before.wall),sources:nativeChargeQA.audioSources.filter(r=>r.weapon===id&&r.wall>=before.wall)}),{id,before,after});
  row.holdFailure=holdFailure;row.summary={frames:row.frames.length,maxCharge:Math.max(0,...row.frames.map(r=>r.q||0)),stages:[...new Set(row.frames.map(r=>r.stage))],hudStages:[...new Set(row.frames.map(r=>r.hudStage).filter(Boolean))],headSeen:row.frames.some(r=>r.heads),dropSeen:row.frames.some(r=>r.drops),chargePeak:Math.max(0,...row.pcm.map(r=>r.charge.peak)),chargeRms:Math.max(0,...row.pcm.map(r=>r.charge.rms))};
  result.cases.push(row);console.log('case',id,JSON.stringify(row.summary),'holdFailure',holdFailure);
  if(holdFailure)break;
 }
 const captures=await page.evaluate(()=>nativeChargeQA.captures);result.captures=[];
 for(const {dataURL,...capture}of captures){const name=capture.weapon+'-'+capture.label+'.png',bytes=Buffer.from(dataURL.split(',')[1],'base64');fs.writeFileSync(path.join(out,name),bytes);result.captures.push({...capture,path:name,sha256:sha(bytes)});}
 result.gestures=await page.evaluate(()=>nativeTouchGestures);result.pointerErrors=await page.evaluate(()=>nativeTouchPointerErrors);
 result.end=await page.evaluate(()=>nativeChargeSnapshot());await Promise.allSettled([...pending]);result.verified=[...verified].sort();
 const charger=result.cases.find(r=>r.id==='s3-charger-long'),bow=result.cases.find(r=>r.id==='s3-stringer-normal');
 result.verdict={trustedTouchFire:result.gestures.some(e=>e.control==='fire'&&e.type==='pointerdown'&&e.trusted&&e.pointerType==='touch'),chargerReady:!!charger&&charger.summary.maxCharge>=1,chargerRecordedSource:!!charger?.events.some(e=>e.kind==='recorded-rise'&&e.playing),chargerPcm:!!charger&&charger.summary.chargePeak>1e-4,chargerFire:!!charger&&charger.shots.length>0,bowStages:!!bow&&bow.summary.stages.includes(1)&&bow.summary.stages.includes(2),bowHudStages:!!bow&&['first','second','full'].every(s=>bow.summary.hudStages.includes(s)),bowStageDings:!!bow&&[.8,1].every(p=>bow.events.some(e=>e.kind==='charger_full'&&e.pitch===p))};
 result.status=Object.values(result.verdict).every(Boolean)&&result.errors.length===0?'passed':'incomplete';
}catch(error){result.status='blocked';result.error=error.stack;console.error(error.stack);
 if(page){result.failureState=await page.evaluate(()=>({menu:window.__inkwave?.menus?.current,body:document.body.innerText.slice(0,2500),state:window.nativeChargeSnapshot?.(),frames:window.nativeChargeQA?.frames?.slice(-10),gestures:window.nativeTouchGestures})).catch(e=>({error:e.message}));await page.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});}
}finally{
 clearTimeout(deadline);
 if(touchHeld)await cdp?.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));
}
console.log(JSON.stringify({status:result.status,error:result.error,verdict:result.verdict,cases:result.cases.map(r=>({id:r.id,...r.summary})),errors:result.errors}));
if(result.status!=='passed')process.exitCode=1;
