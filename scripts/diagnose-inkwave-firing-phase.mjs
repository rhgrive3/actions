// Native Game diagnostic only. Serves immutable saved builds; never edits their bytes.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const [beforeArg,afterArg,outArg,mode='aligned']=process.argv.slice(2),out=path.resolve(outArg);assert(['aligned','original'].includes(mode));fs.mkdirSync(out,{recursive:true});
const sites=[path.resolve(beforeArg),path.resolve(afterArg)],servers=[],reports=[];let browser;
const shaModule=await import('node:crypto'),hash=b=>shaModule.createHash('sha256').update(b).digest('hex');
for(const site of sites){const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://local'),f=path.resolve(site,u.pathname==='/'?'index.html':'.'+decodeURIComponent(u.pathname));if(!f.startsWith(site+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}const ext=path.extname(f),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.mp3':'audio/mpeg','.woff2':'font/woff2'}[ext];res.setHeader('Content-Type',mime||'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(f).pipe(res);});await new Promise(r=>s.listen(0,'127.0.0.1',r));servers.push(s);}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(let side=0;side<2;side++){
  const page=await browser.newPage({viewport:{width:800,height:450}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.addInitScript(({mode})=>{
   localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,colorblind:true,cameraShake:0,bloom:false,minimap:false}));localStorage.setItem('inkwave.profile',JSON.stringify({name:'Cosmetic QA',weapon:'shooter',style:{hair:0,skin:2,outfit:0,eyes:0,hat:0,brows:0}}));
   let state=mode==='aligned'?0x936aca12:null,n=0,records=[],label='boot',tick=-1;const native=Math.random;
   const wrapper=()=>{if(state===null)return native();state^=state<<13;state^=state>>>17;state^=state<<5;n++;if(label!=='boot'&&records.length<12000)records.push({n,tick,value:(state>>>0)/4294967296,stack:(new Error()).stack.split('\n').slice(2,7)});return(state>>>0)/4294967296;};
   Math.random=wrapper;window.phaseRng={reset(seed,name){state=seed;n=0;records=[];label=name;},at(t){tick=t;},snapshot(){return{state:state>>>0,draws:n,records:[...records]};}};
   // Freeze the existing native loop at its documented debug-hook handoff,
   // before its first scheduled RAF. Do not set Game/Actor/Character clocks.
   if(mode==='aligned'){let game;Object.defineProperty(window,'__inkwave',{configurable:true,get(){return game;},set(value){game=value;value.frozen=true;value._skipRender=true;window.frozenAtNativeHandoff=true;}});}
  },{mode});
  await page.goto(`http://127.0.0.1:${servers[side].address().port}/?range&skipTitle`,{waitUntil:'domcontentloaded'});
  // Node polling avoids a browser RAF poll being starved by SwiftShader startup.
  const deadline=Date.now()+240000;let ready=false;while(Date.now()<deadline){ready=await page.evaluate(()=>!!(window.__G?.match?.range&&window.__G.match.state==='playing'&&window.__inkwave?.debug));if(ready)break;await new Promise(r=>setTimeout(r,150));}
  if(!ready)throw Error('native range admission timed out '+side);
  const init=await page.evaluate(async()=>{
   const G=window.__G,g=window.__inkwave;g.debug.freeze();g.debug.freezeBots();g._skipRender=true;
   await G.local.character._sourceMotionLoader;
   const {on}=await import(new URL('src/core/ctx.js',document.baseURI));
   const vec=v=>v?.toArray?.(),scalar=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>v===null||['number','string','boolean'].includes(typeof v)));
   window.phaseSnapshot=()=>({time:G.time,clock:scalar(g.s3Clock),frame:g._frameN,settings:{quality:G.settings.quality,shadows:G.settings.shadows,colorblind:G.settings.colorblind,cameraShake:G.settings.cameraShake},profile:g.profile,actor:scalar(G.local),pos:vec(G.local.pos),vel:vec(G.local.vel),intent:{...scalar(G.local.intent),move:vec(G.local.intent.move)},runner:scalar(G.local.weaponRunner),s3:scalar(G.local.s3),gear:{loadout:G.local.s3?.loadout,abilityPoints:G.local.s3?.abilityPoints,modifiers:G.local.s3?.modifiers},character:{t:G.local.character.t,phase:G.local.character.phase,style:G.local.character.style,source:scalar(G.local.character.sourceMotion),wAim:G.local.character.wAim,lastShot:G.local.character.lastShot,seed:G.local.character.seed},camera:{pos:vec(G.camera.position),q:G.camera.quaternion.toArray(),fov:G.camera.fov,rig:scalar(g.rig)},fxHooks:scalar(g.fxHooks),fxTime:G.fx._time,palette:G.teamColors.map(c=>c.getHex()),rng:window.phaseRng.snapshot().draws});
   window.phaseVec=vec;window.phaseOn=on;return window.phaseSnapshot();
  });
  console.log(mode,side,'native admitted',JSON.stringify({time:init.time,charT:init.character.t,clock:init.clock,fxTime:init.fxTime}));
  const cases=[];
  for(const id of ['shooter','splatling']){
   const result=await page.evaluate(async({id,mode})=>{
    const G=window.__G,g=window.__inkwave,a=G.local,V=G.camera.position.constructor,vec=window.phaseVec;
    const initial=window.phaseSnapshot(),births=[],fires=[],trace=[],order=[];let tick=-40;
    const projectile=p=>({wid:p.wid,type:p.type,start:vec(p.start),pos:vec(p.pos),vel:vec(p.vel),age:p.age,delay:p.delay,size:p.size,radius:p.radius,damage:p.damage,life:p.life,straight:p.straight,grav:p.grav,drag:p.drag,seed:p.seed});
    const oldPush=G.projectiles._push,oldActorUpdate=a.update,oldPsUpdate=G.projectiles.update;
    G.projectiles._push=function(p){const r=oldPush.call(this,p);if(p.owner===a)births.push({tick,p:projectile(p),rng:window.phaseRng.snapshot().draws,actor:window.phaseSnapshot()});return r;};
    a.update=function(dt){order.push({tick,call:'Actor.update',dt});return oldActorUpdate.call(this,dt);};G.projectiles.update=function(dt){order.push({tick,call:'Projectiles.update',dt});return oldPsUpdate.call(this,dt);};
    const off=window.phaseOn('weapon:fire',e=>{if(e.actor===a)fires.push({tick,weapon:e.weapon,muzzle:vec(e.muzzle),dir:vec(e.dir),charge:e.charge??null,rng:window.phaseRng.snapshot().draws});});
    G.projectiles.clear();G.fx.clear();a.pos.set(23,0,-18);a.vel.set(0,0,0);a.setWeapon(id);a.ink=100;a.weaponRunner.reset();
    g.debug.fire(false);g.debug.key('Space',false);g.debug.key('KeyW',false);g.debug.key('KeyD',false);
    const step=()=>{window.phaseRng.at(tick);g.rig.yaw=0;g.rig.pitch=.06;g._frame(1/60);trace.push({tick,time:G.time,actor:window.phaseSnapshot(),projectiles:G.projectiles.list.filter(p=>p.owner===a).map(projectile)});tick++;};
    for(;tick<0;)step();
    window.phaseRng.reset(0x1234abcd,id);const prepared=window.phaseSnapshot();
    const hold=id==='splatling'?70:4;g.debug.fire(true);for(let i=0;i<hold;i++){a.ink=100;step();}g.debug.fire(false);for(let i=0;i<12;i++)step();
    const rng=window.phaseRng.snapshot(),end=window.phaseSnapshot();
    // The same camera is prescribed directly, never derived from the round.
    G.camera.position.set(14,2,-15);G.camera.up.set(0,1,0);G.camera.lookAt(new V(23,1.2,-13));G.camera.fov=28;G.camera.updateMatrixWorld();G.camera.updateProjectionMatrix();G.projectiles._draw();g.R.render();
    const image=G.renderer.domElement.toDataURL('image/png');
    off();G.projectiles._push=oldPush;a.update=oldActorUpdate;G.projectiles.update=oldPsUpdate;
    return{id,initial,prepared,end,births,fires,trace,order,rng,image,resource:{memory:{...G.renderer.info.memory},render:{...G.renderer.info.render}}};
   },{id,mode});
   fs.writeFileSync(path.join(out,`${side}-${id}.png`),Buffer.from(result.image.split(',')[1],'base64'));delete result.image;cases.push(result);console.log(mode,side,id,'shots',result.births.length,'RNG',result.rng.draws,'origin',JSON.stringify(result.births[0]?.p.start));
  }
  const report={side,mode,build:JSON.parse(fs.readFileSync(path.join(sites[side],'inkwave-build.json'))).contentHash,init,cases,errors};reports.push(report);fs.writeFileSync(path.join(out,`${side}-records.json`),JSON.stringify(report));await page.close();
 }
 const same=x=>JSON.stringify(x);const rows=reports[0].cases.map((b,i)=>{const a=reports[1].cases[i];const norms=r=>r.rng.records.map(v=>({tick:v.tick,value:v.value}));const firstMismatch=(x,y)=>{for(let j=0;j<Math.max(x.length,y.length);j++)if(same(x[j])!==same(y[j]))return j;return null;};return{id:b.id,birthsEqual:same(b.births.map(r=>r.p))===same(a.births.map(r=>r.p)),fireEqual:same(b.fires)===same(a.fires),updateOrderEqual:same(b.order)===same(a.order),rngEqual:same(norms(b))===same(norms(a)),firstRngMismatch:firstMismatch(norms(b),norms(a)),prepared:{before:b.prepared,after:a.prepared},births:{before:b.births.map(r=>({tick:r.tick,p:r.p,rng:r.rng})),after:a.births.map(r=>({tick:r.tick,p:r.p,rng:r.rng}))}};});fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({mode,rows},null,2));console.log(JSON.stringify(rows.map(r=>({id:r.id,birthsEqual:r.birthsEqual,fireEqual:r.fireEqual,updateOrderEqual:r.updateOrderEqual,rngEqual:r.rngEqual,firstRngMismatch:r.firstRngMismatch}))));
}finally{await browser?.close();for(const s of servers)await new Promise(r=>s.close(r));}
