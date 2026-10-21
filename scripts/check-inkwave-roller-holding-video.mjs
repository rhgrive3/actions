// Native Game/Range entry, then shipped deterministic debug input/60 Hz steps.
// The inspection camera changes only the evidence view. No replacement floor,
// shader, Character, Physics, paint or controller is installed.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { enterRangeFromMenu } from './lib/inkwave-range-menu-entry.mjs';
import { bindRollerComparisonStartup, installRollerComparisonRandom } from './lib/inkwave-roller-comparison-startup.mjs';
const numericOnly=process.argv.includes('--numeric-only');
const site=path.resolve(process.argv[2]||'_site'), out=path.resolve(process.argv[3]||'.browser-evidence/roller-scale/range');
// Fixed inspection views are authored once from the baseline and reused verbatim.
// BEGIN GRIP CAMERA CONTRACT
function validateGripCameras(plan) {
  const names=['rear','side','front-oblique','right-side','right-rear'];
  if(plan?.schema!==1||!Array.isArray(plan.views)||plan.views.length!==5)throw Error('Invalid grip camera plan');
  for(let i=0;i<names.length;i++){
    const v=plan.views[i],vec=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
    if(v.name!==names[i]||!vec(v.position)||!vec(v.target)||v.fov!==45||v.aspect!==1280/840||v.near!==.1||v.far!==100||
       Math.hypot(...v.position.map((n,j)=>n-v.target[j]))<.1)throw Error('Invalid fixed grip view: '+names[i]);
  }
  return plan;
}
function makeGripCameras(anchor){
  if(!Array.isArray(anchor)||anchor.length!==3||!anchor.every(Number.isFinite))throw Error('Invalid baseline camera anchor');
  const views=[['rear',[0,2,-5]],['side',[5,2,0]],['front-oblique',[3,2,4]],['right-side',[-5,2,0]],['right-rear',[-3,2,-4]]].map(([name,offset])=>({
    name,position:offset.map((n,i)=>n+anchor[i]),target:anchor.map((n,i)=>n+[0,.8,.5][i]),fov:45,aspect:1280/840,near:.1,far:100}));
  return validateGripCameras({schema:1,views});
}
// END GRIP CAMERA CONTRACT
const traceRng=process.env.GRIP_RNG_TRACE==='1';
const seedIndex=process.argv.indexOf('--grip-seed');
const gripSeed=seedIndex<0?null:Number(process.argv[seedIndex+1]);
if(seedIndex>=0&&(!/^\d+$/.test(process.argv[seedIndex+1]||'')||!Number.isInteger(gripSeed)||gripSeed<0||gripSeed>0xffffffff))throw Error('Invalid grip seed: expected uint32');
if(gripSeed===null)throw Error('Movie capture requires an explicit --grip-seed');
const cameraIndex=process.argv.indexOf('--grip-camera-reference');
if(cameraIndex>=0&&!process.argv[cameraIndex+1])throw Error('Missing grip camera reference');
const cameraReference=cameraIndex<0?null:validateGripCameras(JSON.parse(fs.readFileSync(process.argv[cameraIndex+1],'utf8')));
// The pinned historical comparison predates player-relative normalization.
// Its explicit expectation must not silently inherit the candidate dimensions.
const widthIndex=process.argv.indexOf('--expected-drum-width');
const expectedDrumWidth=widthIndex<0?2.5712*(1.36/1.72259927):Number(process.argv[widthIndex+1]);
if(!(expectedDrumWidth>0&&Number.isFinite(expectedDrumWidth)))throw Error('Invalid expected drum width');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.css':'text/css','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const servedModules={};
const server=http.createServer((q,r)=>{
  const u=new URL(q.url,'http://localhost'), file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){r.writeHead(404);r.end();return;}
  r.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
  if(/\.m?js$/.test(file)){
    const bytes=fs.readFileSync(file),relative=path.relative(site,file).split(path.sep).join('/');
    servedModules[relative]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    r.end(bytes);
  }else fs.createReadStream(file).pipe(r);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page,diagnosticTimer;
const receipt={numericOnly,expectedDrumWidth,diagnosticOnly:process.env.GRIP_DIAGNOSTIC_ONLY==='1',acceptanceNote:process.env.GRIP_DIAGNOSTIC_ONLY==='1'?'Unchanged-baseline control failed; candidate images are nonaccepting diagnostics.':null,build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,errors:[],requests:[],console:[]};
const snapshot=async()=>page?.evaluate(()=>({mode:window.__G?.mode,match:window.__G?.match?.state,
  menu:window.__inkwave?.menus?.current,layout:window.__G?.level?.layout?.id,
  range:!!window.__G?.match?.range,entryFreeze:window.__gripEntryFreeze,initialState:window.__gripInitialState,text:document.body.innerText.slice(-1800)})).catch(()=>null);
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{}),
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1280,height:840}});
  page.on('pageerror',e=>receipt.errors.push(e.message));
  page.on('requestfailed',r=>{if(receipt.requests.length<30)receipt.requests.push({url:r.url(),failure:r.failure()});});
  page.on('response',r=>{if(r.status()>=400&&receipt.requests.length<30)receipt.requests.push({url:r.url(),status:r.status()});});
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&receipt.console.length<30)receipt.console.push(m.text().slice(0,1500));});
  diagnosticTimer=setInterval(async()=>{receipt.state=await snapshot();fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(receipt,null,2));},15000);
  await page.addInitScript(installRollerComparisonRandom,{seed:gripSeed});
  await page.addInitScript(bindRollerComparisonStartup);
  await page.addInitScript(({seeded})=>{
    // Saved settings/profile were bound before native startup by the companion QA helper.
    // Freeze at the first public game boundary, after native fixed boot warmup
    // and before any variable-duration live/menu RAF. Never rewrite clocks.
    if(seeded){
      window.__rollerVideoClocks=()=>{
        const G=window.__G,g=window.__inkwave;
        const finite=(value,label,required=false)=>{
          if(value===undefined||value===null){if(required)throw Error('Missing clock '+label);return null;}
          if(!Number.isFinite(value))throw Error('Non-finite clock '+label);return value;
        };
        const uniforms=[];
        G.scene.traverse(o=>{
          for(const [slot,m]of (Array.isArray(o.material)?o.material:[o.material]).entries()){
            if(!m)continue;
            for(const [kind,bank]of [['direct',m.uniforms],['userData',m.userData?.uniforms]]){
              for(const [key,u]of Object.entries(bank||{})){
                if(/time|clock/i.test(key)&&typeof u?.value==='number')
                  uniforms.push([o.name||'',m.name||'',slot,kind,key,finite(u.value,key)]);
              }
            }
          }
        });
        uniforms.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return {game:finite(G.time,'game',true),environment:finite(G.env?.time,'environment',true),
          environmentUniform:finite(G.env?.U?.uTime?.value,'environmentUniform',true),
          fx:finite(G.fx?._time,'fx',true),fxHooks:finite(g.fxHooks?.time,'fxHooks'),
          paint:finite(G.paint?.clock,'paint',true),decor:finite(g.decor?.time,'decor'),
          decorUniform:finite(g.decor?.uTime?.value,'decorUniform'),propsUniform:finite(g.props?.uTime?.value,'propsUniform'),
          levelUniform:finite(g.levelMat?.userData?.uniforms?.uTime?.value,'levelUniform'),
          grateUniform:finite(g.grateMat?.userData?.uniforms?.uTime?.value,'grateUniform'),uniforms};
      };
      if(Object.hasOwn(window,'__inkwave'))throw Error('Game was already published before early-freeze hook');
      Object.defineProperty(window,'__inkwave',{configurable:true,set(game){
        Object.defineProperty(window,'__inkwave',{value:game,writable:true,configurable:true,enumerable:true});
        if(!game||typeof game!=='object')throw Error('Invalid native game publication');
        game.frozen=true;
        const boundary=window.__rollerBootFreeze={schema:1,boundary:'first-native-game-publication',clocks:null};
        queueMicrotask(()=>{
          if(window.__G?.game!==game||!game.frozen||typeof game.debug?.freeze!=='function')
            throw Error('Native game publication did not complete before first frame');
          game.debug.freeze();
          boundary.clocks=window.__rollerVideoClocks();
        });
      }});
    }
    // BEGIN TRUSTED ENTRY FREEZE CONTRACT
    if(seeded){
      const freezeAtInput=e=>{
        if(!e.isTrusted||!e.target?.closest?.('.iw-ui [data-id="mode-range"]'))return;
        const g=window.__inkwave;
        if(g?.menus?.current!=='mode'||!g.debug?.freeze)return;
        // Freeze only the native simulation, before the normal trusted menu
        // handler creates its Character and awaits asynchronous shader warmup.
        g.debug.freeze();
        const boot=window.__rollerBootFreeze,entryClocks=window.__rollerVideoClocks?.();
        if(!boot?.clocks||JSON.stringify(entryClocks)!==JSON.stringify(boot.clocks))
          throw Error('Scene clocks changed between game publication and trusted Range entry');
        const loadout={schema:1,requested:'roller',completed:false};
        window.__gripEntryFreeze={schema:1,boundary:'trusted-mode-range-capture',trusted:e.isTrusted,time:window.__G.time,loadout,boot,entryClocks};
        try{
          // Select the ordinary loadout before native startMatch constructs its
          // Character. Its one-shot startup warmup must include this weapon.
          if(typeof g.api?.setLoadout!=='function'||typeof g.api?.getLoadout!=='function')
            throw Error('Missing native loadout API');
          const result=g.api.setLoadout({weapon:'roller'});
          if(result&&typeof result.then==='function')throw Error('Native loadout selection was not synchronous');
          loadout.selected=g.api.getLoadout()?.weapon;
          if(loadout.selected!=='roller')throw Error('Native Roller loadout selection failed');
          loadout.completed=true;
        }catch(error){loadout.error=String(error?.message||error);}
        document.removeEventListener('click',freezeAtInput,true);
      };
      document.addEventListener('click',freezeAtInput,true);
    }
    // END TRUSTED ENTRY FREEZE CONTRACT
  },{seeded:gripSeed!==null});
  receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:240000,
    onProgress:r=>{receipt.entry=r;fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(receipt,null,2));}});
  console.log('Native Range ready');
  receipt.measurement=await page.evaluate(async({cameraReference,gripSeed,traceRng,numericOnly})=>{
    const G=window.__G,g=window.__inkwave,a=G.local;
    const {Vector3,OrthographicCamera,PerspectiveCamera}=await import('three');
    g.debug.freeze();
    // BEGIN NATIVE STARTUP READINESS CONTRACT
    // The menu may finish its bounded loading wait before Character warmup.
    // Await only that already-requested work for the preselected Roller.
    let startupWarmup=null;
    if(gripSeed!==null){
      const loadout=window.__gripEntryFreeze?.loadout;
      if(!loadout?.completed||loadout.requested!=='roller'||loadout.selected!=='roller')
        throw Error('Missing native pre-entry Roller selection: '+JSON.stringify(loadout));
      const isRoller=()=>a.weaponId==='roller'&&a.character.weaponKind==='roller'&&
        a.character.weapon===a.character.weapons?.roller;
      if(!isRoller())throw Error('Native startup did not equip the selected Roller');
      const warm=a.character._warmed;
      if(!warm||typeof warm.then!=='function')throw Error('Missing native Character startup warmup');
      let timeout;
      try{
        const result=await Promise.race([warm,new Promise((_,reject)=>{
          timeout=setTimeout(()=>reject(Error('Native Character startup warmup timed out')),240000);
        })]);
        if(!isRoller())throw Error('Native startup Roller changed during warmup');
        startupWarmup={schema:1,owner:'native-character-startup',completed:true,result:result??null,
          requestedWeapon:loadout.requested,weaponBefore:a.weaponId,characterWeaponBefore:a.character.weaponKind};
      }finally{clearTimeout(timeout);}
    }
    // END NATIVE STARTUP READINESS CONTRACT
    G.match.range.setWeapon('roller');
    await G.audio?.prepareWeapon?.('roller',{urgent:true});
    await a.character.sourceMotion.ready;
    G.match.range.travel('roller');
    a.pos.set(-26.5,.04,4);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=-.3;
    // BEGIN INITIAL CHARACTER CONTRACT
    const c=a.character,boundary=window.__gripEntryFreeze||null;
    const initialState=window.__gripInitialState={schema:1,boundary,gameTime:G.time,startupWarmup,sceneClocks:window.__rollerVideoClocks(),
      character:{name:c.name,seed:c.seed,time:c.t,phase:c.phase,breathPhase:c.brPh,breathNumber:c.brN,
        breathAmplitude:c.brAmp,breathRate:c.brRate,pose:Array.from(c.P)}};
    if(gripSeed!==null&&(!boundary?.trusted||boundary.boundary!=='trusted-mode-range-capture'||
      !g.frozen||G.time!==boundary.time||c.t!==0||c.phase!==0||c.brPh!==0))
      throw Error('Seeded capture missed the native pre-Character input boundary: '+JSON.stringify(initialState));
    const {PRESETS}=await import('/src/game/character-style.js');
    const {COLORBLIND_PALETTE}=await import('/src/config.js');
    const request=window.__rollerComparisonRequest;
    if(JSON.stringify(PRESETS.find(p=>p.id===request.preset)?.style)!==JSON.stringify(request.profile.style)||
       JSON.stringify([COLORBLIND_PALETTE.a,COLORBLIND_PALETTE.b])!==JSON.stringify(request.teamHex))
      throw Error('QA startup profile/palette is not an existing native catalog choice');
    initialState.comparison=window.__beginRollerCharacterObserver();
    if(JSON.stringify(initialState.comparison.state.sceneClocks)!==JSON.stringify(initialState.sceneClocks))
      throw Error('Scene clocks changed while verifying the native startup catalogs');
    // END INITIAL CHARACTER CONTRACT
    g.input.keys.clear();g.debug.key('KeyW',true);g.debug.fire(true);
    // BEGIN SCOPED ROLL RNG CONTRACT
    // Keep the pre-import function identity; module-captured aliases share this phase.
    // No await occurs until both shipped 90-tick batches finish.
    const globalRandom=window.__rollerComparisonRandom;globalRandom.begin('steady-180');
    const originalRandom=Math.random,originalSplat=G.paint.splat;
    const recipeRandom={mode:'stable-global-seeded-native-180-tick',
      algorithm:gripSeed===null?null:'mulberry32-u32-v1',seed:gripSeed,draws:0,restored:false,contactSeeds:[]};
    // BEGIN BOUNDED RNG CALLER TRACE
    // Diagnostic only: optional caller provenance, never a seed/value rewrite.
    const recipeRandomTrace=traceRng&&gripSeed!==null?{schema:1,diagnosticOnly:true,
      limit:256,maxGroups:32,stackLimit:800,totalDraws:0,omittedDraws:0,
      overflowDraws:0,stackTruncatedCalls:0,groups:[],sequence:[]}:null;
    // END BOUNDED RNG CALLER TRACE
    let recipePhase='settle',recipeMeasurement;
    globalRandom.observe(()=>{
      recipeRandom.draws++;
      // BEGIN BOUNDED RNG CALLER RECORD
      if(recipeRandomTrace){
        const trace=recipeRandomTrace;trace.totalDraws=recipeRandom.draws;
        if(recipeRandom.draws<=trace.limit){
          // Keep native caller/function and line/column, but not ephemeral ports.
          const full=String(new Error().stack||'').split('\n').slice(2,7).join('\n')
            .replace(/http:\/\/(?:127\.0\.0\.1|localhost):\d+/g,'<site>');
          const stack=full.slice(0,trace.stackLimit);
          if(full.length>trace.stackLimit)trace.stackTruncatedCalls++;
          let group=trace.groups.findIndex(g=>g.phase===recipePhase&&g.stack===stack);
          if(group<0&&trace.groups.length<trace.maxGroups){
            group=trace.groups.length;
            trace.groups.push({phase:recipePhase,stack,count:0,firstDraw:recipeRandom.draws,lastDraw:recipeRandom.draws});
          }
          trace.sequence.push(group);
          if(group<0)trace.overflowDraws++;
          else{const g=trace.groups[group];g.count++;g.lastDraw=recipeRandom.draws;}
        }else trace.omittedDraws++;
      }
      // END BOUNDED RNG CALLER RECORD
    });
    G.paint.splat=function(at,r,team,o){
      const contact=o?.footprint==='ink-contact'?{order:recipeRandom.contactSeeds.length,
        phase:recipePhase,seed:o.seed,face:o.face??null,kind:o.kind??null,completed:false}:null;
      if(contact)recipeRandom.contactSeeds.push(contact);
      const result=originalSplat.call(this,at,r,team,o);
      if(contact){contact.completed=true;contact.returnedClaimedArea=result;}
      return result;
    };
    try{
    // Batch the shipped 60 Hz debug steps: simulate every tick and draw once,
    // instead of forcing ninety unnecessary full-world software renders.
    a.ink=100;g.debug.step(1500);
    if(!a.weaponRunner.rolling)throw Error('Native controller did not enter rolling');
    G.paint.clear();G.projectiles.clear();
    recipePhase='measurement';
    const start=a.pos.clone(), events=[],splat=G.paint.splat;
    G.paint.splat=function(at,r,team,o){
      if(o?.footprint==='ink-contact'){
        const w=a.character.weapon,b=w.def.drum.boundingBox;
        const centre=w.drum.localToWorld(b.min.clone().add(b.max).multiplyScalar(.5));
        const front=at.clone().addScaledVector(o.stretch,.6*r*(1+o.stretchAmt));
        events.push({at:at.toArray(),r,heading:o.stretch?.toArray(),amount:o.stretchAmt,seed:o.seed,face:o.face,
          drumCentre:centre.toArray(),contactError:Math.hypot(centre.x-front.x,centre.z-front.z)});
      }
      return splat.call(this,at,r,team,o);
    };
    try{a.ink=100;g.debug.step(1500);}
    finally{G.paint.splat=splat;g.debug.fire(false);g.debug.key('KeyW',false);}
    recipeMeasurement={start,events};
    }finally{
      globalRandom.observe(null);recipeRandom.globalPhase=globalRandom.phase();
      G.paint.splat=originalSplat;
      recipeRandom.restored=Math.random===originalRandom&&G.paint.splat===originalSplat;
      g.debug.fire(false);g.debug.key('KeyW',false);
    }
    globalRandom.begin('inspection');
    const {start,events}=recipeMeasurement;
    // END SCOPED ROLL RNG CONTRACT
    const gameplayPng=numericOnly?null:G.renderer.domElement.toDataURL('image/png').split(',')[1];
    G.paint.flush(0);
    const f=G.level.faces[a.ground.face],atlas=f.atlas;
    if(!atlas)throw Error('Native roller court has no paint atlas');
    const pixels=new Uint8Array(G.paint.size**2*4);
    G.renderer.readRenderTargetPixels(G.paint.rt,0,0,G.paint.size,G.paint.size,pixels);
    // BEGIN GPU FOOTPRINT CONTRACT
    // Hash the already-read full GPU atlas, not CPU owners or team RGB.
    // Use the same alpha admission boundary as the existing width/hole probes.
    const gpuMask=new Uint8Array(G.paint.size**2);
    let occupiedPixels=0;
    for(let i=0;i<gpuMask.length;i++)occupiedPixels+=(gpuMask[i]=pixels[4*i+3]>=128?1:0);
    const gpuDigest=await globalThis.crypto.subtle.digest('SHA-256',gpuMask);
    const gpuFootprint={schema:1,width:G.paint.size,height:G.paint.size,alphaThreshold:128,
      encoding:'uint8-row-major-0-or-1',algorithm:'SHA-256',occupiedPixels,
      sha256:Array.from(new Uint8Array(gpuDigest),b=>b.toString(16).padStart(2,'0')).join('')};
    // END GPU FOOTPRINT CONTRACT
    const p=new Vector3(),sample=(x,z)=>{
      p.set(x,f.origin.y,z).sub(f.origin);
      const u=p.dot(f.u),v=p.dot(f.v);
      const col=Math.floor(atlas.x+atlas.pad+u*atlas.ppm),row=Math.floor(atlas.y+atlas.pad+v*atlas.ppm);
      return pixels[4*(row*G.paint.size+col)+3];
    };
    let holes=0,rows=0;const widths=[];
    for(let z=start.z+1;z<a.pos.z-.5;z+=.1){
      rows++;if(sample(a.pos.x,z)<128)holes++;
      let lo=Infinity,hi=-Infinity;
      for(let x=a.pos.x-4;x<=a.pos.x+4;x+=.025)if(sample(x,z)>=128){lo=Math.min(lo,x);hi=Math.max(hi,x);}
      if(hi>=lo)widths.push(hi-lo);
    }
    a.character.root.updateMatrixWorld(true);
    const w=a.character.weapon,box=w.def.drum.boundingBox;
    const centre=w.drum.localToWorld(box.min.clone().add(box.max).multiplyScalar(.5));
    const event=events.at(-1),front=new Vector3(...event.at).addScaledVector(new Vector3(...event.heading),.6*event.r*(1+event.amount));
    const m=w.drum.matrixWorld.elements,drumWidth=(box.max.x-box.min.x)*Math.hypot(m[0],m[2]);
    const halfHeight=7.5,halfWidth=halfHeight*G.renderer.domElement.width/G.renderer.domElement.height;
    const view=new OrthographicCamera(-halfWidth,halfWidth,halfHeight,-halfHeight,.1,100),cz=a.pos.z-3;
    view.up.set(0,0,1);view.position.set(a.pos.x,30,cz);view.lookAt(a.pos.x,0,cz);
    G.renderer.setRenderTarget(null);G.renderer.render(G.scene,view);
    G.renderer.domElement.id='roller-scale-canvas';
    const inspectionPng=numericOnly?null:G.renderer.domElement.toDataURL('image/png').split(',')[1];
    const anchor=a.pos.toArray();
    const cameraPlan=cameraReference||{schema:1,views:[['rear',[0,2,-5]],['side',[5,2,0]],['front-oblique',[3,2,4]],['right-side',[-5,2,0]],['right-rear',[-3,2,-4]]].map(([name,offset])=>({
      name,position:offset.map((n,i)=>n+anchor[i]),target:anchor.map((n,i)=>n+[0,.8,.5][i]),fov:45,aspect:1280/840,near:.1,far:100}))};
    const state=()=>JSON.stringify({time:G.time,pos:a.pos.toArray(),yaw:a.yaw,rolling:a.weaponRunner.rolling,phase:a.character.phase,characterTime:a.character.t,breathPhase:a.character.brPh,sceneClocks:window.__rollerVideoClocks(),pose:Array.from(a.character.P)});
    const frozen=state(),gripViews=[];
    const renderSize={width:G.renderer.domElement.width,height:G.renderer.domElement.height};
    const renderAspect=renderSize.width/renderSize.height;
    if(!Number.isInteger(renderSize.width)||!Number.isInteger(renderSize.height)||renderSize.width<=0||renderSize.height<=0)throw Error('Invalid renderer dimensions');
    for(const spec of cameraPlan.views){
      if(Math.abs(renderAspect-spec.aspect)>1e-10)throw Error('Renderer aspect differs from fixed grip camera');
      const camera=new PerspectiveCamera(spec.fov,spec.aspect,spec.near,spec.far);
      camera.position.fromArray(spec.position);camera.up.set(0,1,0);camera.lookAt(new Vector3(...spec.target));camera.updateMatrixWorld(true);
      G.renderer.render(G.scene,camera);
      if(state()!==frozen)throw Error('Grip inspection advanced or changed simulation');
      gripViews.push({name:spec.name,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),
        png:numericOnly?null:G.renderer.domElement.toDataURL('image/png').split(',')[1]});
    }
    // Preserve the original final overhead canvas and its range.png contract.
    G.renderer.render(G.scene,view);
    if(state()!==frozen)throw Error('Restoring inspection changed simulation');
    return {layout:G.level.layout.id,start:start.toArray(),end:a.pos.toArray(),face:f.id,
      floorTag:G.level.blocks[f.block].tag,drumWidth,paintHalf:event.r,contactDepth:1.2*event.r*(1+event.amount),
      gpuMinWidth:Math.min(...widths),gpuMaxWidth:Math.max(...widths),rows,holes,gpuFootprint,recipeRandom,recipeRandomTrace,initialState,
      contactError:Math.hypot(centre.x-front.x,centre.z-front.z),contactStamps:events,events:events.length,
      debugFixedTicks:180,controller:'shipped KeyW + held fire',inspectionCameraOnly:true,
      gameplayPng,inspectionPng,cameraPlan,gripViews,renderSize,renderAspect,frozenState:JSON.parse(frozen),gripCameraReference:!!cameraReference};
  },{cameraReference,gripSeed,traceRng,numericOnly});
  // Browser evaluation has restored RNG before hashing this bounded diagnostic.
  if(receipt.measurement.recipeRandomTrace){
    const trace=receipt.measurement.recipeRandomTrace;
    trace.digest={algorithm:'SHA-256',encoding:'JSON.stringify-before-digest',
      sha256:createHash('sha256').update(JSON.stringify(trace)).digest('hex')};
  }
  validateGripCameras(receipt.measurement.cameraPlan);
  assert.deepEqual(receipt.measurement.cameraPlan,cameraReference||makeGripCameras(receipt.measurement.end));
  fs.writeFileSync(path.join(out,'grip-cameras.json'),JSON.stringify(receipt.measurement.cameraPlan,null,2)+'\n');
  for(const view of receipt.measurement.gripViews){
    if(numericOnly){delete view.png;continue;}
    fs.writeFileSync(path.join(out,'grip-'+view.name+'.png'),Buffer.from(view.png,'base64'));delete view.png;
  }
  for(const [key,name] of [['gameplayPng','gameplay.png'],['inspectionPng','scene.png']]){
    if(numericOnly){delete receipt.measurement[key];continue;}
    fs.writeFileSync(path.join(out,name),Buffer.from(receipt.measurement[key],'base64'));delete receipt.measurement[key];
  }
  if(!numericOnly)await page.locator('#roller-scale-canvas').screenshot({path:path.join(out,'range.png'),timeout:60000});
  const m=receipt.measurement;
  assert.equal(m.layout,'range');assert.equal(m.floorTag,'floor:roller');
  assert.equal(m.holes,0);assert.ok(m.rows>40);assert.ok(m.contactError<1e-5);
  assert.equal(m.contactStamps.length,m.events);
  for(const stamp of m.contactStamps)assert.ok(stamp.contactError<1e-5,'Every steady stamp follows the actual drum');
  assert.ok(Math.abs(m.drumWidth-expectedDrumWidth)<1e-4);assert.ok(Math.abs(m.paintHalf-2.8*0.8103533592449264)<1e-10);
  assert.ok(Math.abs(m.contactDepth-1.5)<1e-10);
  assert.ok(m.gpuMaxWidth>4.3&&m.gpuMaxWidth<4.8);
  assert.equal(receipt.errors.length,0);
  // Persist the complete steady comparison before any release simulation.
  fs.writeFileSync(path.join(out,'steady-result.json'),JSON.stringify({...receipt,passed:true},null,2)+'\n');
  // A new continuation after the preserved 180-tick acceptance receipt.
  // Every movie image is a real renderer frame after two native 60 Hz ticks.
  const videoViews=['right-rear','side'], frames=[];
  if(!numericOnly)for(const name of videoViews)fs.mkdirSync(path.join(out,'video',name),{recursive:true});
  const initial=await page.evaluate(({expectedState,views,seed})=>{
    const G=window.__G,g=window.__inkwave,a=G.local;
    const state=()=>({time:G.time,pos:a.pos.toArray(),yaw:a.yaw,rolling:a.weaponRunner.rolling,
      phase:a.character.phase,characterTime:a.character.t,breathPhase:a.character.brPh,sceneClocks:window.__rollerVideoClocks(),pose:Array.from(a.character.P)});
    if(JSON.stringify(state())!==JSON.stringify(expectedState))throw Error('Steady state changed before movie continuation');
    const globalRandom=window.__rollerComparisonRandom;globalRandom.begin('movie-180');
    window.__rollerMovie={previous:state(),previousRng:globalRandom.phase(),anchor:a.pos.toArray(),views,seed,draws:0};
    // No simulated release occurred between the accepted held state and this continuation.
    g.debug.key('KeyW',true);g.debug.fire(true);
    return {state:state(),anchor:a.pos.toArray(),seed};
  },{expectedState:m.frozenState,views:m.cameraPlan.views.filter(v=>videoViews.includes(v.name)),seed:gripSeed});
  try{
    for(let index=0;index<90;index++){
      const frame=await page.evaluate(async({index,numericOnly})=>{
        const {Vector3,PerspectiveCamera}=await import('three');
        const G=window.__G,g=window.__inkwave,a=G.local,q=window.__rollerMovie;
    const lighting=()=>{
      const lights=[];G.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,name:o.name,color:o.color?.toArray(),
        intensity:o.intensity,position:o.getWorldPosition(new Vector3()).toArray(),castShadow:o.castShadow});});
      return {lights,background:G.scene.background?.isColor?G.scene.background.toArray():null,
        fog:G.scene.fog?{color:G.scene.fog.color.toArray(),near:G.scene.fog.near??null,far:G.scene.fog.far??null,density:G.scene.fog.density??null}:null,
        toneMapping:G.renderer.toneMapping,outputColorSpace:G.renderer.outputColorSpace,
        exposure:G.renderer.toneMappingExposure,shadowEnabled:G.renderer.shadowMap.enabled,shadowType:G.renderer.shadowMap.type};
    };
        const state=()=>({time:G.time,pos:a.pos.toArray(),yaw:a.yaw,rolling:a.weaponRunner.rolling,
          phase:a.character.phase,characterTime:a.character.t,breathPhase:a.character.brPh,sceneClocks:window.__rollerVideoClocks(),pose:Array.from(a.character.P)});
        if(JSON.stringify(state())!==JSON.stringify(q.previous))throw Error('Frozen simulation drifted between movie frames');
        const globalRandom=window.__rollerComparisonRandom,random=Math.random;
        if(JSON.stringify(globalRandom.phase())!==JSON.stringify(q.previousRng))throw Error('Global RNG changed while native movie was frozen');
        const fire=index<60;g.debug.key('KeyW',true);g.debug.fire(fire);
        g.debug.step(1000/30);q.draws=globalRandom.phase().draws;
        const current=state();
        if(Math.abs(current.time-q.previous.time-2/60)>1e-8)throw Error('Movie must advance exactly two native ticks');
        if(fire&&!current.rolling)throw Error('Rolling movie lost admitted contact');
        a.character.root.updateMatrixWorld(true);
        const hands={right:a.character.bones.handR.getWorldPosition(new Vector3()).toArray(),
          left:a.character.bones.handL.getWorldPosition(new Vector3()).toArray()};
        const rootDelta=a.pos.clone().sub(new Vector3(...q.anchor)),images=[];
        for(const spec of q.views){
          const camera=new PerspectiveCamera(spec.fov,spec.aspect,spec.near,spec.far);
          camera.position.fromArray(spec.position).add(rootDelta);
          camera.up.set(0,1,0);camera.lookAt(new Vector3(...spec.target).add(rootDelta));camera.updateMatrixWorld(true);
          const before=JSON.stringify(state()),randomBefore=JSON.stringify(globalRandom.phase());
          G.renderer.setRenderTarget(null);G.renderer.render(G.scene,camera);
          if(JSON.stringify(state())!==before||JSON.stringify(globalRandom.phase())!==randomBefore)throw Error('Movie inspection changed simulation or stable global RNG');
          images.push({name:spec.name,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),
            projection:camera.projectionMatrix.toArray(),png:numericOnly?null:G.renderer.domElement.toDataURL('image/png').split(',')[1]});
        }
        q.previous=current;q.previousRng=globalRandom.phase();q.draws=q.previousRng.draws;
        return {index,tick:(index+1)*2,fire,state:current,hands,images,rngDraws:q.draws,globalRandom:q.previousRng,
          rngRestored:Math.random===random,lighting:lighting(),renderSize:{width:G.renderer.domElement.width,height:G.renderer.domElement.height}};
      },{index,numericOnly});
      for(const image of frame.images){
        if(numericOnly){delete image.png;continue;}
        const bytes=Buffer.from(image.png,'base64');
        const rel=path.join('video',image.name,'frame-'+String(index).padStart(3,'0')+'.png');
        fs.writeFileSync(path.join(out,rel),bytes);
        image.path=rel;image.sha256=createHash('sha256').update(bytes).digest('hex');delete image.png;
      }
      frames.push(frame);
    }
  }finally{await page.evaluate(()=>{__inkwave.debug.fire(false);__inkwave.debug.key('KeyW',false);});}
  receipt.characterObserver=await page.evaluate(()=>window.__rollerCharacterObserver.restore());
  receipt.globalRandom=await page.evaluate(()=>window.__rollerComparisonRandom.restore());
  assert.equal(receipt.characterObserver.frames.length,360);
  assert.equal(receipt.characterObserver.restored,true);
  for(const frame of receipt.characterObserver.frames)assert.equal(frame.dt,1/60);
  receipt.video={schema:1,numericOnly,framesPerSecond:30,nativeTicksPerSecond:60,frameCount:90,durationSeconds:3,
    controller:'shipped KeyW; held fire for 120 ticks, then released for 60 ticks',
    camera:'same fixed baseline offsets, translated only by each actor root displacement',
    interpolation:false,views:videoViews,initial,frames};
  assert.equal(frames.length,90);
  for(const f of frames){assert.equal(f.images.length,2);assert.equal(f.rngRestored,true);}
  assert.equal(receipt.errors.length,0);
  receipt.passed=true;console.log(JSON.stringify({passed:true,build:receipt.build,video:{frameCount:90,fps:30,nativeHz:60,views:videoViews}}));
}catch(error){receipt.passed=false;receipt.failure=String(error.stack||error);receipt.state=await snapshot();if(!numericOnly)await page?.screenshot({path:path.join(out,'failure.png'),timeout:30000}).catch(()=>{});throw error;}
finally{const cleanup=await page?.evaluate(()=>{let character,global;try{character=window.__rollerCharacterObserver?.restore();}finally{global=window.__rollerComparisonRandom?.restore();}return {character,global};}).catch(()=>null);if(cleanup){receipt.characterObserver??=cleanup.character;receipt.globalRandom??=cleanup.global;}clearInterval(diagnosticTimer);receipt.servedModules=servedModules;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}
