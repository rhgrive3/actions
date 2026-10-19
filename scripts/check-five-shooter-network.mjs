#!/usr/bin/env node
// Two isolated real browsers, real Transport, and the production relay session
// handler. Only the Cloudflare WebSocket upgrade is adapted to Node's ws server.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {WebSocketServer} from 'ws';
import {createLocalRelay} from './lib/inkwave-local-relay-fixture.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const option=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],n+' required');return path.resolve(process.argv[i+1]);};
const baseline=process.argv.includes('--baseline'),novaMouth=process.argv.includes('--nova-mouth'),traceFlight=process.argv.includes('--trace-flight');
const idsIndex=process.argv.indexOf('--ids'),selectedIds=idsIndex<0?null:process.argv[idsIndex+1]?.split(',');
const lagIndex=process.argv.indexOf('--delay-frames'),delayFrames=lagIndex<0?0:Number(process.argv[lagIndex+1]);assert(Number.isSafeInteger(delayFrames)&&delayFrames>=0&&delayFrames<=30);
const site=option('--site'),evidence=option('--evidence-dir'),profile=option('--profile-dir');
const physical=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physical(path.dirname(p)),path.basename(p));
for(const p of [evidence,profile]){assert(physical(p).startsWith(ROOT),'Evidence/profile must remain in checked-out source workspace');fs.mkdirSync(p,{recursive:true});}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(build.schema,1);assert.equal(hash(JSON.stringify(build.files)),build.inputHash);assert.equal(hash(JSON.stringify(build.artifacts)),build.contentHash);
for(const [f,h]of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,f))),h,f);
let sourceSha=null;
if(process.argv.includes('--exact-source')){
 sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 const tree=new Map(execFileSync('git',['ls-tree','-r','-z',sourceSha],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean).map(r=>{const [m,f]=r.split('\t');return[f,m.split(' ')[2]];}));
 const roots={'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/','local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/','loading-cache/':'patches/loading-cache/','practice-range/':'patches/practice-range/','build-script/':'scripts/','native-stages/':'patches/native-stages/'};
 const files=Object.entries(build.files).map(([k,h])=>{const prefix=Object.keys(roots).find(p=>k.startsWith(p));assert(prefix,k);const f=roots[prefix]+k.slice(prefix.length);assert.equal(hash(fs.readFileSync(path.join(ROOT,f))),h,f);return f;});
 assert.equal(hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs'))),build.build.script);files.push('scripts/build-inkwave.mjs','scripts/check-five-shooter-network.mjs','scripts/fixtures/five-shooter-network.mjs','server/src/index.js');
 const blobs=execFileSync('git',['hash-object','--',...files],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');files.forEach((f,i)=>assert.equal(blobs[i],tree.get(f),f+' must match commit'));
}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const fixtureFile=path.join(ROOT,'scripts/fixtures/five-shooter-network.mjs');
const fixtureCode=fs.readFileSync(fixtureFile,'utf8').replaceAll('/ASSET/','/_versions/'+build.build.revision+'/');
const server=http.createServer((req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/network-fixture.html'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><head><base href="/_versions/'+build.build.revision+'/"><script type="importmap">'+JSON.stringify({imports:{three:'/_versions/'+build.build.revision+'/vendor/three/build/three.module.js','three/addons/':'/_versions/'+build.build.revision+'/vendor/three/jsm/'}})+'</script></head><body style="margin:0"><script type="module" src="/network-fixture.js"></script></body></html>');return;}
 if(pathname==='/network-fixture.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(fixtureCode);return;}
 const f=path.resolve(site,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(!f.startsWith(site+path.sep)||!fs.statSync(f).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(f).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));
const rooms=new Map(),wire=[],pending=[];let wireFrame=0;
const flushWire=()=>{wireFrame++;while(pending.length&&pending[0].due<=wireFrame){const p=pending.shift();if(p.ws.readyState===1)p.ws.send(p.text);}};
const connectRelay=createLocalRelay({rooms});
relay.on('connection',(ws,req)=>connectRelay(ws,req,{send:(s,deliver)=>{if(delayFrames&&s.startsWith('m|')&&JSON.parse(s.slice(s.indexOf('|',2)+1)).k==='t')pending.push({ws,text:s,due:wireFrame+delayFrames});else deliver(s);},receive:s=>wire.push({at:Date.now(),bytes:Buffer.byteLength(s),text:s})}));
const address='http://127.0.0.1:'+server.address().port+'/network-fixture.html?relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port)+(novaMouth?'&novaMouth=1':'');
const contexts=[],pages=[],errors=[],receipts=new Set();let result;
// This arena contains only the native WebGL canvas. Read its rendered pixels
// directly, avoiding a background-page compositor screenshot timeout.
const capture=async(page,file)=>{await page.bringToFront();const data=await page.evaluate(()=>NG.renderer.domElement.toDataURL('image/png').split(',')[1]);fs.writeFileSync(file,Buffer.from(data,'base64'));};
try{
 for(let i=0;i<2;i++){
  const context=await chromium.launchPersistentContext(path.join(profile,'player-'+i),{headless:true,viewport:{width:1000,height:700},args:['--no-sandbox','--disable-features=LocalNetworkAccessChecks','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});contexts.push(context);await context.grantPermissions(['local-network-access']);
  const page=await context.newPage();pages.push(page);page.on('console',m=>{if(m.type()==='error')console.log('browser console: '+m.text().slice(0,800));});page.on('pageerror',e=>{errors.push('player'+i+': '+e.message);page.evaluate(()=>globalThis.networkArenaError=true).catch(()=>{});});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false})));
  await page.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1)||'index.html';if(build.artifacts[key])assert.equal(hash(body),build.artifacts[key],key);receipts.add(key);await route.fulfill({response,body});});
  console.log('network browser boot player '+i);await page.bringToFront();await page.goto(address,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>globalThis.networkArenaReady||globalThis.networkArenaError,null,{timeout:90000});
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('network browser ready player '+i);
  await page.evaluate(()=>{NG.game.profile.weapon='s3-shooter-heavy';NG.game.menus.launchLobby=async()=>{};});
 }
 console.log('network browser rooms');const code=await pages[0].evaluate(()=>NG.net.create('Network Host'));
 await pages[1].evaluate(c=>NG.net.join(c,'Network Guest'),code);
 await pages[0].waitForFunction(()=>NG.net.lobby.players.length===2);
 await pages[1].waitForFunction(()=>NG.net.lobby.players.length===2);
 // #1039/#1103: setting weapons and room rules invalidates readiness. The
 // host must confirm assignments, then BOTH participants ready up before Turf.
 await pages[1].evaluate(()=>NG.net.setMe({weapon:'s3-shooter-heavy'}));
 await pages[0].evaluate(()=>{NG.net.setMe({weapon:'s3-shooter-heavy'});NG.net.setSettings({bots:false});});
 await pages[0].waitForFunction(()=>NG.net.lobby.players.length===2 &&
   NG.net.lobby.players.every(p=>p.weapon==='s3-shooter-heavy'),null,{timeout:30000});
 await pages[0].evaluate(()=>{
   if(!NG.net.confirmTeams())throw Error('Network host could not confirm Turf teams');
 });
 await pages[1].waitForFunction(()=>NG.net.lobby.teamsConfirmed===true,null,{timeout:30000});
 await pages[1].evaluate(()=>NG.net.setMe({ready:true}));
 await pages[0].evaluate(()=>NG.net.setMe({ready:true}));
 await pages[0].waitForFunction(()=>NG.net.canStart(),null,{timeout:30000});
 await pages[0].evaluate(()=>{
   if(!NG.net.start())throw Error('Confirmed and ready Turf match did not start');
 });
 await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.game.match?.state==='playing'&&NG.net.active,null,{timeout:180000})));
 console.log('network browser match ready');
 for(const page of pages)await page.evaluate(()=>{
  const G=NG;G.projectiles.clear();G.fx.clear();G.netm.peers.clear();G.netm.out=[];G.netm.tickT=0;for(const a of G.actors){a.net.buf=[];a.weaponRunner.reset();}
  globalThis.clock=100000;Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
  globalThis.shotTrace=[];globalThis.shotSequence=new Map();globalThis.projectileTags=new WeakMap();globalThis.flightFrames=[];globalThis.frameTrace={maxGrip:0,nonFinite:0,maxLabelError:0};
  // Native transport retains per-owner event order, not a stable projectile id.
  const record=p=>{const key=p.owner.nid+'/'+!!p.ghost,id=(shotSequence.get(key)||0)+1;shotSequence.set(key,id);return {weapon:p.owner.weaponId,owner:p.owner.nid,id,start:p.start.toArray(),velocity:p.vel.toArray(),ghost:!!p.ghost};};
  const push=G.projectiles._push.bind(G.projectiles);G.projectiles._push=p=>{push(p);if(!p.ghost){const s=record(p);shotTrace.push(s);projectileTags.set(p,s);}};
  const ghost=G.projectiles.ghostProjectile.bind(G.projectiles);G.projectiles.ghostProjectile=(a,e)=>{const p=ghost(a,e)||G.projectiles.list.at(-1);if(p){const s=record(p);shotTrace.push(s);projectileTags.set(p,s);}return p;};
  globalThis.advance=fire=>{
   clock+=1000/60;G.net.update(1/60);G.time+=1/60;
   for(const a of G.actors){if(a.remote)G.netm.applyRemote(a,1/60);else{a.ink=100;a.intent.fire=fire;a.weaponRunner.update(1/60,{fire,firePressed:fire&&!a._reviewWasFire});a._reviewWasFire=fire;a._finishFrame(1/60);}
    const ch=a.character;ch.root.updateMatrixWorld(true);if(!Array.from(ch.P).every(Number.isFinite))frameTrace.nonFinite++;
    if(ch.P[NC.IKL]>.99&&ch.P[NC.LTW]<.001)frameTrace.maxGrip=Math.max(frameTrace.maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new NTHREE.Vector3())));
    const cp=ch.weapon.parts.can,lp=ch.weapon.parts.canLabel;if(lp&&ch.weapon.near)frameTrace.maxLabelError=Math.max(frameTrace.maxLabelError,cp.scale.distanceTo(lp.scale),cp.position.distanceTo(lp.position));
   }
   G.projectiles.update(1/60);G.fx.update(1/60,G.camera);G.game.fxHooks?.update(1/60);
  };
 });
 const runFrames=async(n,fire)=>{for(let i=0;i<n;i++){await Promise.all(pages.map(p=>p.evaluate(f=>advance(f),fire)));flushWire();await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,0)))));}};
 const allIds=['s3-shooter-heavy','s3-shooter-quicklong','s3-shooter-triplequick','s3-shooter-triplemiddle','s3-shooter-flash'],ids=selectedIds||allIds,rows=[];assert(ids.length&&ids.every(id=>allIds.includes(id)),'Only scoped five-shooter ids');
 const trace=async(id,frame)=>{for(let i=0;i<2;i++){
  await pages[i].evaluate(frame=>{NG.camera.position.set(-4.4,2.6,5);NG.camera.lookAt(0,.9,.25);NG.renderer.render(NG.scene,NG.camera);flightFrames.push({frame,inkVolumes:NG.fx.inkVolumes?{...NG.fx.inkVolumes.metrics}:null,inkVolumeReady:!!NG.fx.inkVolumes,inkVolumeError:NG.fx.inkVolumeError||null,projectiles:NG.projectiles.list.map(p=>({tag:projectileTags.get(p)||null,wid:p.wid,type:p.type,ghost:!!p.ghost,age:p.age,delay:p.delay,pos:p.pos.toArray(),start:p.start.toArray(),vel:p.vel.toArray(),recipe:p._inkVolumeRecipe,asset:p._inkVolumeAssetName,catalog:p.catalog?.r?.id||null,drawRadius:p.catalog?.descriptor?.b?.DrawSizeParam||p.fidelityDrawRadius||null,vis:p.vis,size:p.size,tail0:p.tail0,tailK:p.tailK,qualityDead:!!p._qualityDead}))});},frame);
  await capture(pages[i],path.join(evidence,id+'.player'+i+'.frame'+frame+'.png'));
 }};
 for(const id of ids){
  await Promise.all(pages.map(p=>p.evaluate(id=>{NG.projectiles.clear();shotTrace.length=0;shotSequence.clear();flightFrames.length=0;frameTrace={maxGrip:0,nonFinite:0,maxLabelError:0};for(const a of NG.actors){a.setWeapon(id);a.character.setLod('game');a._reviewWasFire=false;a.ink=100;}},id)));
  await runFrames(30,false);if(traceFlight){await runFrames(54,true);for(let frame=55;frame<=60;frame++){await runFrames(1,true);await trace(id,frame);}}else await runFrames(60,true);
  for(let i=0;i<2;i++){
   await pages[i].evaluate(()=>{NG.camera.position.set(-4.4,2.6,5);NG.camera.lookAt(0,.9,.25);NG.renderer.render(NG.scene,NG.camera);});await capture(pages[i],path.join(evidence,id+'.player'+i+'.near.png'));
   await pages[i].evaluate(()=>{for(const a of NG.actors){a.character.setLod('far');a._finishFrame(1/60);}NG.renderer.render(NG.scene,NG.camera);});await capture(pages[i],path.join(evidence,id+'.player'+i+'.far.png'));
   await pages[i].evaluate(()=>{for(const a of NG.actors){a.character.setLod('game');a._finishFrame(1/60);}});
  }
  if(traceFlight){for(let frame=61;frame<=66;frame++){await runFrames(1,false);await trace(id,frame);}await runFrames(114,false);}else await runFrames(120,false);
  const traces=await Promise.all(pages.map(p=>p.evaluate(()=>({flightFrames,shots:shotTrace,frames:frameTrace,models:NG.actors.map(a=>({id:a.weaponId,model:a.character.weaponModel,remote:a.remote,motion:a.character.sourceMotion.status})),remaining:NG.projectiles.list.length}))));
  let paired=0,maxSpawn=0,maxVelocity=0;
  for(let owner=0;owner<2;owner++)for(const shot of traces[owner].shots.filter(s=>!s.ghost)){
   const remote=traces[1-owner].shots.find(s=>s.ghost&&s.owner===shot.owner&&s.id===shot.id);assert(remote,'missing remote shot '+id+'/'+shot.id);paired++;
   maxSpawn=Math.max(maxSpawn,Math.hypot(...shot.start.map((v,k)=>v-remote.start[k])));maxVelocity=Math.max(maxVelocity,Math.hypot(...shot.velocity.map((v,k)=>v-remote.velocity[k])));
  }
  const row={id,paired,maxSpawn,maxVelocity,traces};rows.push(row);fs.writeFileSync(path.join(evidence,id+'.json'),JSON.stringify(row,null,2));
  for(let owner=0;owner<2;owner++){const local=traces[owner].shots.filter(s=>!s.ghost),remote=traces[1-owner].shots.filter(s=>s.ghost);assert(local.length>0,id+' each owner actually emits');assert.equal(remote.length,local.length,id+' every ordered event is replayed');}
  assert(paired>0,id+' both owners actually emit');assert(maxSpawn<.01&&maxVelocity<.01,id+' serialized shot geometry');
  for(const t of traces){assert.equal(t.frames.nonFinite,0);assert(t.frames.maxGrip<.008,id+' grip');assert(t.frames.maxLabelError<1e-8,id+' label');assert(t.models.every(m=>m.id===id&&m.model===id&&m.motion==='ready'));}
 }
 assert.equal(errors.length,0,JSON.stringify(errors));result={status:'passed',capture:'native rendered WebGL canvas PNG, no model overlay',baseline,traceFlight,novaMouthCandidate:novaMouth,sourceSha,contentHash:build.contentHash,fixtureHash:hash(fixtureCode),transport:'real WebSocket and production RoomDurableObject/NetSession/NetMatch',scope:'Two real Actors and Characters in controlled arena; five fixed equip cases, not a full live stage or network weapon-switch UI test',rows,loadedArtifacts:[...receipts],errors};
}catch(error){const diagnostic=await Promise.all(pages.map(async p=>{const d=await p.evaluate(()=>({mode:globalThis.NG?.mode,s3:globalThis.NG?.s3,game:!!globalThis.NG?.game,bootError:document.querySelector('#boot-error')?.textContent,base:document.baseURI})).catch(e=>({error:e.message}));await p.screenshot({path:path.join(evidence,'failure-'+pages.indexOf(p)+'.png'),timeout:15000}).catch(()=>{});return d;}));result={diagnostic,status:'failed',sourceSha,contentHash:build.contentHash,error:error.stack,errors};process.exitCode=1;}
finally{for(const c of contexts)await c.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}
const out=path.join(evidence,'five-shooter-network-result.json');fs.writeFileSync(out+'.pending',JSON.stringify(result,null,2)+'\n');fs.renameSync(out+'.pending',out);console.log(JSON.stringify({...result,loadedArtifacts:result.loadedArtifacts?.length}));
