#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const site=path.resolve(process.argv[2]||'_site-native'),evidence=path.resolve(process.argv[3]||'.browser-evidence/native-stage5');fs.mkdirSync(evidence,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const address='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];
try{
 for(const id of (process.env.NATIVE_STAGE_IDS||'scorch,hagglefish,inkblot,mako,brinewater').split(',')){
  const context=await browser.newContext({viewport:{width:960,height:640},deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('page-error '+e.message);});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text().slice(0,1000));console.log('browser-error '+m.text().slice(0,1000));}});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true,musicVolume:0,audioVolume:0})));
  console.log('boot '+id);
  await page.goto(address+'/?map='+id,{waitUntil:'domcontentloaded',timeout:30000});
  await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI).href)).G);
  await page.waitForFunction(()=>NG?.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
  const bootError=await page.locator('#boot-error').textContent();assert.equal(bootError,'',bootError);assert.equal(errors.length,0,JSON.stringify(errors));
  await page.evaluate(async(id)=>{NG.game.debug.freeze();NG.game.menus.wipe.cancel();await NG.game.startMatch({mapId:id,mode:'turf',duration:180,difficulty:'normal'});},id);
  await page.evaluate(()=>{const g=NG.game;g._skipRender=true;for(let i=0;i<300;i++)g._frame(1/60);g._skipRender=false;});
  await page.waitForFunction(()=>NG.game.match?.state==='playing',null,{timeout:60000});
  console.log('match '+id);
  console.log('spawn-before '+JSON.stringify(await page.evaluate(()=>({spawn:NG.local.s3?.squidSpawn,paused:NG.match.paused,controller:NG.match.controller.enabled,blocked:NG.match.controller.menuBlocked,menu:NG.game.menus.current,input:NG.input.mouse}))));
  await page.evaluate(()=>{const g=NG.game;g._skipRender=true;g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);g._skipRender=false;});
  console.log('spawn-after '+JSON.stringify(await page.evaluate(()=>({spawn:NG.local.s3?.squidSpawn,intent:NG.local.intent.fire,paused:NG.match.paused,controller:NG.match.controller.enabled,blocked:NG.match.controller.menuBlocked,menu:NG.game.menus.current,input:NG.input.mouse}))));
  await page.evaluate(()=>{
   const G=NG;globalThis.nativeProfile={};
   const wrap=(obj,name,label)=>{const fn=obj?.[name];if(typeof fn!=='function')return;obj[name]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{const m=nativeProfile[label]||(nativeProfile[label]={milliseconds:0,calls:0});const elapsed=performance.now()-t;m.milliseconds+=elapsed;m.calls++;if(label==='paint._advanceSplatOwnership'){const radius=Math.round(args[0].R*10)/10,key='paint.radius.'+radius,b=nativeProfile[key]||(nativeProfile[key]={milliseconds:0,calls:0,faceVisits:0});b.milliseconds+=elapsed;b.calls++;b.faceVisits+=args[0].entries.length/7;}}};};
   for(const n of ['raycast','collideBody','bodyFits','groundProbe'])wrap(G.physics,n,'physics.'+n);
   for(const n of ['splat','_cpuSplat','advanceSimulation','_advanceSplatOwnership','coverage','flush','_drawQuads','_emitGrowth'])wrap(G.paint,n,'paint.'+n);
   for(const n of ['path','nearest'])wrap(G.nav,n,'nav.'+n);
   for(const a of G.actors){wrap(a,'update','actor.update');wrap(a.character,'update','character.update');wrap(a.bot,'update','bot.update');}
   wrap(G.game,'_updateHud','hud.update');wrap(G.game.minimap,'update','minimap.update');wrap(G.env,'update','environment.update');
   wrap(G.projectiles,'update','projectiles.update');wrap(G.fx,'update','fx.update');
  });
  await page.evaluate(n=>globalThis.nativeTestFrames=n,Number(process.env.NATIVE_TEST_FRAMES||180));
  const report=await page.evaluate(()=>{
   const G=NG,g=G.game;g.debug.freeze();g._skipRender=true;
   const positions=G.actors.map(a=>a.pos.toArray());const times=[];
   for(let frame=0;frame<Number(globalThis.nativeTestFrames||180);frame++){const t=performance.now();g._frame(1/60);times.push(performance.now()-t);}
   g._skipRender=false;const a=g.match.local;
   const physics=G.physics,vec=a.pos.clone(),hit=physics.raycast(vec.clone().setY(vec.y+2),vec.clone().set(0,-1,0),5);
   if(hit.hit)G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),2,a.team,{seed:.25,instant:true});
   g.minimap.ensure();G.paint.flush(1/60);G.renderer.render(G.scene,G.camera);times.sort((a,b)=>a-b);
   return {id:G.level.layout.id,native:G.level.native,actors:G.actors.length,alive:G.actors.filter(a=>a.alive).length,bots:G.actors.filter(a=>!!a.bot).length,
    moved:G.actors.map((a,i)=>a.pos.distanceTo(a.pos.clone().fromArray(positions[i]))),coverage:G.paint.coverage(),turfTotal:G.paint.turfTotal,counts:G.paint.counts,metrics:g.nativeWorld.metrics,
    cpuFrame:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},render:G.renderer.info.render,memory:G.renderer.info.memory,navValid:G.nav.validIds.length,
    local:{pos:a.pos.toArray(),alive:a.alive,grounded:a.grounded},profile:nativeProfile,version1130Verified:G.level.manifest.version1130Verified};
  });
  await page.screenshot({path:path.join(evidence,id+'-game.png'),timeout:60000});
  // Same integrated scene in a top-down reference view, both teams + source scenery.
  await page.evaluate(()=>{const G=NG,B=G.level.bounds,c=G.camera;c.position.set((B.minX+B.maxX)/2,180,(B.minZ+B.maxZ)/2+.01);c.lookAt((B.minX+B.maxX)/2,0,(B.minZ+B.maxZ)/2);G.renderer.render(G.scene,c);});
  await page.screenshot({path:path.join(evidence,id+'-overhead.png'),timeout:60000});
  await page.evaluate(()=>{NG.game.levelMesh.visible=false;for(const a of NG.actors)a.character.root.visible=false;NG.renderer.render(NG.scene,NG.camera);});
  await page.screenshot({path:path.join(evidence,id+'-source-only.png'),timeout:60000});
  await page.evaluate(()=>{NG.game.levelMesh.visible=true;for(const a of NG.actors)a.character.root.visible=true;});
  report.rules=[];reports.push(report);fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));
  for(const mode of ['zones','tower','rainmaker','clams']){
   console.log('rule '+id+' '+mode);
   const capability=await page.evaluate(async({id,mode})=>{const {nativeStageBuild}=await import(new URL('patches/native-stages/runtime/build-config.mjs',document.baseURI));return nativeStageBuild.stages.find(s=>s.id===id)?.ruleAvailability?.[mode]||null;},{id,mode});
   if(capability?.supported===false){
    assert.equal(capability.status,'source-route-unverified');assert.ok(capability.reason);assert.equal(mode,'tower');
    const rejected=await page.evaluate(async({id,mode})=>{
     const G=NG,g=G.game,{nativeStageRuleStatus}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),status=nativeStageRuleStatus(id,mode);
     if(status?.supported!==false)throw Error('Expected qualified unsupported Tower status');
     const match=G.match,level=G.level,physics=G.physics,nav=G.nav,actors=[...G.actors],flow=g._matchFlow;
     const before=()=>G.match===match&&G.level===level&&G.physics===physics&&G.nav===nav&&actors.every((a,i)=>G.actors[i]===a)&&g._matchFlow===flow;
     const api=await g.startMatch({mapId:id,mode});if(api!==false||!before())throw Error('Unsupported offline/API request changed live state');
     const menu=await g._startMenuMatch({mapId:id,mode});if(menu!==false||!before())throw Error('Unsupported menu request changed live state');
     let networkRejected=false;try{await g.startNetMatch({map:id,mode},{});}catch(e){networkRejected=e.name==='RangeError'&&e.message.includes('ガチヤグラ');}if(!networkRejected||!before())throw Error('Unsupported direct online request changed live state');
     return {mode:'tower',supported:false,status:status.status,offlineApiPreserved:true,menuApiPreserved:true,directOnlinePreserved:true,actors:actors.length};
    },{id,mode});
    // Leave the live match through production quit. Menu input/lifecycle guards
    // then own their ordinary screen transitions and physical clicks.
    await page.evaluate(async()=>{const g=NG.game;await g.quitToMenu();g._skipRender=true;g.debug.freezeBots();g.debug.unfreeze();});
    const screen=async name=>page.waitForFunction(name=>NG.mode==='menu'&&NG.game.menus.current===name&&NG.game.menus._scr?.name===name,name,{timeout:30000});
    const click=async key=>{await page.waitForFunction(key=>{const m=NG.game.menus,r=m._scr?.el,t=r?.querySelector('[data-id="'+key+'"]');if(!t||t.disabled||r.inert)return false;let k=1;for(let e=t;e;e=e.parentElement){k*=Number(getComputedStyle(e).opacity);if(e===r)break;}return k>.6;},key,{timeout:30000});await page.locator('.iw-screen:not(.is-leaving) [data-id="'+key+'"]').click({timeout:30000});};
    await screen('main');const baseline=await page.evaluate(()=>({mode:NG.mode,screen:NG.game.menus.current,attract:!!NG.match?.attract}));assert.equal(baseline.mode,'menu');
    // First-main news is scheduled after the wipe (and may await hero images).
    // An immediate DOM count can miss it while it later blocks physical PLAY.
    const newsUnseen=await page.evaluate(async()=>!(await import(new URL('src/ui/news.js',document.baseURI))).newsSeen());
    if(newsUnseen)await page.locator('.iw-news').waitFor({state:'visible',timeout:15000});
    if(await page.locator('.iw-news').count()){await page.locator('.iw-news [data-id="news-skip"],.iw-news [data-id="news-later"]').first().click({timeout:15000});await page.locator('.iw-news').waitFor({state:'hidden',timeout:10000});}
    await click('play');await screen('mode');await click('mode-tower');await screen('setup');await click('map-'+id);
    const disabled=await page.evaluate(()=>{const root=NG.game.menus._scr.el,b=root.querySelector('[data-native-rule-supported="false"]'),r=root.querySelector('[data-native-rule-reason]');return{disabled:b?.disabled,reason:r?.textContent,map:NG.game.menus._setup.mapId,mode:NG.game.menus._setup.mode};});assert.equal(disabled.disabled,true);assert.ok(disabled.reason.includes('ガチヤグラ'));assert.equal(disabled.mode,'tower');
    await page.screenshot({path:path.join(evidence,id+'-tower-unavailable.png'),timeout:60000});await click('map-tidewater');assert.equal(await page.evaluate(()=>NG.game.menus._scr.el.querySelector('[data-native-rule-supported="true"]')?.disabled),false);
    for(const mode of ['turf','zones','rainmaker','clams']){await page.locator('.iw-screen:not(.is-leaving) .iw-backbtn').click();await screen('mode');await click('mode-'+mode);await screen('setup');await click('map-'+id);assert.equal(await page.evaluate(()=>NG.game.menus._scr.el.querySelector('[data-native-rule-supported="true"]')?.disabled),false);assert.equal(await page.evaluate(()=>NG.game.menus._scr.el.querySelector('[data-native-rule-reason]')?.textContent),'');}
    rejected.setupRefreshVerified=true;rejected.genuineMenuFlow={baseline,physicalStageClicks:true,physicalRuleClicks:true};report.rules.push(rejected);await page.evaluate(()=>{NG.game.debug.freeze();NG.game.menus.wipe.cancel();NG.game.menus.show(null);});continue;
   }
   await page.evaluate(async({id,mode})=>{const g=NG.game;g.menus.wipe.cancel();await g.startMatch({mapId:id,mode,difficulty:'easy'});g._skipRender=true;for(let i=0;i<330;i++)g._frame(1/60);g.debug.freezeBots();}, {id,mode});
   let keyboardBoarding=null;
   if(mode==='tower'){
    await page.evaluate(()=>{const G=NG,g=G.game;g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);if(G.local.s3?.squidSpawn||!G.local.grounded)throw Error('Human initial spawn did not land');for(const b of G.actors)if(b!==G.local){b.pos.copy(G.level.spawnPads[b.team]);b.vel.set(0,0,0);b._rankedOnTower=false;}g.menus.show(null);});
    keyboardBoarding=[];
    for(const hz of [30,60,120]){
     await page.keyboard.up('w');await page.keyboard.up('Space');
     const shouldJump=await page.evaluate(hz=>{const G=NG,g=G.game,a=G.local,e=G.match.ranked,w=G.match.rankedWorld,approach=e.stage.tower.boarding.approaches[e.stage.tower.centerIndex];
      if(!approach)throw Error('No source-supported center approach');e.rule.state.position=[...e.stage.tower.path[e.stage.tower.centerIndex]];e.rule.state.progress=w._centerProgress();w._syncTower(e,false);
      a.pos.fromArray(approach.start);a.vel.set(0,0,0);a._rankedOnTower=false;a.grounded=false;a._resolve(false,a.pos.y,false);if(!a.grounded||!a.ground.hit||a.ground.block===w.towerBlockId)throw Error('Boarding starts on an actual source floor');
      g.rig.yaw=Math.atan2(approach.end[0]-a.pos.x,approach.end[2]-a.pos.z);g.rig.pitch=0;globalThis.nativeBoardingApproach={...approach,hz};return approach.jumping;
     },hz);
     await page.keyboard.down('w');if(shouldJump)await page.keyboard.down('Space');
     let proof,totalFrames=0,walking=true;
     while(totalFrames<Math.ceil(hz*1.3)){
      proof=await page.evaluate(({hz,walking})=>{const G=NG,g=G.game,a=G.local,m=G.match,w=m.rankedWorld,e=m.ranked,p=nativeBoardingApproach,dx=p.end[0]-p.start[0],dz=p.end[2]-p.start[2],length=Math.hypot(dx,dz);let boarded=false,frames=0,reachedEnd=false;
       for(;frames<Math.ceil(hz*1.3);frames++){g._frame(1/hz);if(a.grounded&&a.ground.hit&&a.ground.block===w.towerBlockId&&e.rule.state.controllingTeam===a.team){boarded=true;frames++;break;}if(walking&&((a.pos.x-p.start[0])*dx+(a.pos.z-p.start[2])*dz)/length>=length-.15){reachedEnd=true;frames++;break;}}
       return{hz,boarded,frames,reachedEnd,controller:e.rule.state.controllingTeam,grounded:a.grounded,groundHit:a.ground.hit,groundBlock:a.ground.block,towerBlock:w.towerBlockId,position:a.pos.toArray(),approach:p};},{hz,walking});
      totalFrames+=proof.frames;if(proof.boarded)break;if(proof.reachedEnd&&walking){await page.keyboard.up('w');walking=false;}else break;
     }
     proof.frames=totalFrames;
     await page.keyboard.up('Space');await page.keyboard.up('w');assert.equal(proof.boarded,true,'actual keyboard source-floor approach onto tower '+JSON.stringify(proof));keyboardBoarding.push(proof);
    }
   }
   const rule=await page.evaluate(async mode=>{
    const G=NG,m=G.match,e=m.ranked,w=m.rankedWorld,a=m.local;
    if(!e||!w)throw Error('Native ranked systems missing');
    if(mode==='zones'){w.captureZone(0,0);m.advanceRanked(1.2);if(e.counts[0]>98)throw Error('Native zone paint did not score: '+JSON.stringify({cells:w._zoneCells.map(a=>a.length),coverage:w.zoneCoverage(),counts:e.counts,zone:e.stage.zones}));}
    let towerProof=null;
    if(mode==='tower'){
     const span=e.stage.tower.arenaSpan;if(!span?.bothHalvesVerified||!(span.endpointProjection[0]<-span.minimumHalfDepth&&span.endpointProjection[1]>span.minimumHalfDepth))throw Error('Tower vehicle does not enter both source arena halves');
     if(a.s3?.squidSpawn||!a.grounded)throw Error('Actual human keyboard boarding did not land');
     for(const b of G.actors)if(b!==a){b.pos.copy(G.level.spawnPads[b.team]);b._rankedOnTower=false;b.vel.set(0,0,0);}
     const {nativeTowerClearance}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI)),path=e.stage.tower.path,check=nativeTowerClearance(G.level,G.physics.actorBody,e.stage.tower.halfSize),saved=[...e.rule.state.position],samples=path.flatMap((p,i)=>i?[p,...[.25,.5,.75].map(t=>p.map((v,k)=>path[i-1][k]+(v-path[i-1][k])*t))]:[p]);let boarding=0;
     for(let i=0;i<path.length;i++)if(!check.clear(path[i],path[Math.max(0,i-1)]))throw Error('Source swept clearance failed at segment '+i);
     for(const point of samples){e.rule.state.position=[...point];w._syncTower(e,false);for(const sign of [-1,1]){a.pos.fromArray(point).addScaledVector(w.towerBlock.axes[0],sign*.7);a.vel.set(0,0,0);a.grounded=false;a._resolve(false,a.pos.y,false);if(!a.grounded||!a.ground.hit||a.ground.block!==w.towerBlockId)throw Error('Actual capsule deck support failed at '+JSON.stringify(point));boarding++;}}
     e.rule.state.position=saved;w._syncTower(e,false);a.pos.fromArray(saved).addScaledVector(w.towerBlock.axes[0],.7);a.vel.set(0,0,0);a.grounded=false;a._resolve(false,a.pos.y,false);m.advanceRanked(1);if(e.rule.state.controllingTeam!==a.team)throw Error('Native tower rider not counted');
     towerProof={pathNodes:path.length,segmentInteriorSamples:3,actualCapsuleSupports:boarding,halfSize:e.stage.tower.halfSize,localLift:e.stage.tower.localLift,sourceClearance:e.stage.tower.sourceClearance,arenaSpan:e.stage.tower.arenaSpan,liveGroundedHumanCounted:true};
    }
    if(mode==='rainmaker'){m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:2000,kind:'main'});m.advanceRanked(1/60);if(e.rule.state.barrier.active)throw Error('Barrier did not pop');a.pos.fromArray(e.rule.state.pos);m.advanceRanked(1/60);if(e.rule.state.carrier===null)throw Error('Holder pickup failed');}
    if(mode==='clams'){const c=e.rule.state.clams[0];a.pos.fromArray(c.pos);a.grounded=true;m.advanceRanked(1/60);const id=String(a.nid??`${a.team}:${a.slot}`);if(!(e.rule.state.inventories[id]?.small||e.rule.state.inventories[id]?.power))throw Error('Clam pickup failed');}
    const snap=e.snapshot();if(!e.restore(snap))throw Error('Own rule snapshot rejected');
    return {mode,towerProof,state:m.state,actors:m.actors.length,counts:[...e.counts],snapshotBytes:JSON.stringify(snap).length,calibration:e.stage.calibration};
   },mode);if(keyboardBoarding)rule.towerProof.keyboardBoarding=keyboardBoarding;report.rules.push(rule);
  }
  report.errors=errors;fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(report));
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(report.native,true);assert.equal(report.actors,8);assert.equal(report.bots,7);assert.ok(report.moved.some(n=>n>1));assert.ok(report.coverage.some(n=>n>0));
  await context.close();
 }
}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages())){console.log('failure '+JSON.stringify(await page.evaluate(()=>({mode:globalThis.NG?.mode,state:globalThis.NG?.game?.match?.state,boot:document.getElementById('boot-error')?.textContent})).catch(()=>null)));await page.screenshot({path:path.join(evidence,'failure.png'),timeout:15000}).catch(()=>{});}throw error;}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(reports,null,2));}
