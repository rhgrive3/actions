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
import {RoomDurableObject} from '../server/src/index.js';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const option=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],n+' required');return path.resolve(process.argv[i+1]);};
const baseline=process.argv.includes('--baseline');
const lagIndex=process.argv.indexOf('--delay-frames'),delayFrames=lagIndex<0?0:Number(process.argv[lagIndex+1]);assert(Number.isSafeInteger(delayFrames)&&delayFrames>=0&&delayFrames<=30);
const site=option('--site'),evidence=option('--evidence-dir'),profile=option('--profile-dir');
const physical=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physical(path.dirname(p)),path.basename(p));
for(const p of [evidence,profile]){assert(physical(p).startsWith('/mnt/workspace/'),'Persistent workspace required');fs.mkdirSync(p,{recursive:true});}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(build.schema,1);assert.equal(hash(JSON.stringify(build.files)),build.inputHash);assert.equal(hash(JSON.stringify(build.artifacts)),build.contentHash);
for(const [f,h]of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,f))),h,f);
let sourceSha=null;
if(process.argv.includes('--exact-source')){
 sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 const tree=new Map(execFileSync('git',['ls-tree','-r','-z',sourceSha],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean).map(r=>{const [m,f]=r.split('\t');return[f,m.split(' ')[2]];}));
 const roots={'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/','local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/','loading-cache/':'patches/loading-cache/','practice-range/':'patches/practice-range/'};
 const files=Object.entries(build.files).map(([k,h])=>{const prefix=Object.keys(roots).find(p=>k.startsWith(p));assert(prefix,k);const f=roots[prefix]+k.slice(prefix.length);assert.equal(hash(fs.readFileSync(path.join(ROOT,f))),h,f);return f;});
 assert.equal(hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs'))),build.build.script);files.push('scripts/build-inkwave.mjs','scripts/check-inkwave-network-browser.mjs','patches/network-replication/tests/browser-fixture.mjs','server/src/index.js');
 const blobs=execFileSync('git',['hash-object','--',...files],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');files.forEach((f,i)=>assert.equal(blobs[i],tree.get(f),f+' must match commit'));
}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const fixtureFile=path.join(ROOT,'patches/network-replication/tests/browser-fixture.mjs');
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
relay.on('connection',(ws,req)=>{const url=new URL(req.url,'http://localhost'),code=url.pathname.split('/')[2];let room=rooms.get(code);if(!room)rooms.set(code,room=new RoomDurableObject({},{}));
 const bridge={send:s=>{if(delayFrames&&s.startsWith('m|')&&JSON.parse(s.slice(s.indexOf('|',2)+1)).k==='t')pending.push({ws,text:s,due:wireFrame+delayFrames});else ws.send(s);},addEventListener:(n,fn)=>ws.on(n,n==='message'?data=>{const s=data.toString();wire.push({at:Date.now(),bytes:Buffer.byteLength(s),text:s});fn({data:s});}:fn)};
 room.handleSession(bridge,url.searchParams.get('name')||'Player');
});
const address='http://127.0.0.1:'+server.address().port+'/network-fixture.html?relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port);
const contexts=[],pages=[],errors=[],receipts=new Set();let result;
try{
 for(let i=0;i<2;i++){
  const context=await chromium.launchPersistentContext(path.join(profile,'player-'+i),{headless:true,viewport:{width:1000,height:700},args:['--no-sandbox','--disable-features=LocalNetworkAccessChecks','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});contexts.push(context);await context.grantPermissions(['local-network-access']);
  const page=await context.newPage();pages.push(page);page.on('console',m=>{if(m.type()==='error')console.log('browser console: '+m.text().slice(0,800));});page.on('pageerror',e=>{errors.push('player'+i+': '+e.message);page.evaluate(()=>globalThis.networkArenaError=true).catch(()=>{});});
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false})));
  await page.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1)||'index.html';if(build.artifacts[key])assert.equal(hash(body),build.artifacts[key],key);receipts.add(key);await route.fulfill({response,body});});
  console.log('network browser boot player '+i);await page.bringToFront();await page.goto(address,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>globalThis.networkArenaReady||globalThis.networkArenaError,null,{timeout:90000});
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('network browser ready player '+i);
  await page.evaluate(()=>{NG.game.profile.weapon='roller';NG.game.menus.launchLobby=async()=>{};});
 }
 console.log('network browser rooms');const code=await pages[0].evaluate(()=>NG.net.create('Network Host'));
 await pages[1].evaluate(c=>NG.net.join(c,'Network Guest'),code);
 await pages[0].waitForFunction(()=>NG.net.lobby.players.length===2);
 await pages[1].waitForFunction(()=>NG.net.lobby.players.length===2);
 await pages[1].evaluate(()=>NG.net.setMe({weapon:'roller',ready:true}));
 await pages[0].evaluate(()=>{NG.net.setMe({weapon:'roller',ready:true});NG.net.setSettings({bots:false});NG.net.start();});
 await Promise.all(pages.map(p=>p.waitForFunction(()=>NG.game.match?.state==='playing'&&NG.net.active,null,{timeout:180000})));
 console.log('network browser match ready');for(const page of pages)await page.evaluate(baseline=>{
  globalThis.isBaseline=baseline;
  const G=NG,g=G.game;g.debug.freeze();G.projectiles.clear();G.fx.clear();G.netm.peers.clear();G.netm.out=[];G.netm.tickT=0;
  globalThis.clock=100000;Object.defineProperty(performance,'now',{configurable:true,value:()=>globalThis.clock});
  globalThis.trace={births:[],steps:[],paint:[],maxProjectiles:0,maxFx:0,linkedFrames:0,invalidLinkedVisible:0,maxEnvelopeError:0,maxPuffs:0,maxRemote:0,projectileAllocations:0,puffLinkedFrames:0,remoteDropLinks:0,remotePuffLinks:0,curtains:0,unboundCurtains:0,puffEnvelopeError:0,invalidPuffVisible:0};
  for(const a of G.actors){a.net.buf=[];a.weaponRunner.reset();a.ink=100;a.aimPitch=.05;}
  const P=G.projectiles,record=p=>({owner:p.owner.nid,id:p._netId??p._comparisonId,ghost:p.ghost,vertical:p.s3Vertical,grav:p.grav,drag:p.drag,life:p.life,delay:p.delay,start:p.start.toArray(),vel:p.vel.toArray(),age:p.age,pos:p.pos.toArray(),seed:p.seed,straight:p.straight,fidelityPhase:p.fidelityPhase,fidelityMode:p.fidelityMode,fidelityMove:p.fidelityMove,fidelityPlayerCollision:p.fidelityPlayerCollision,fidelityFieldCollision:p.fidelityFieldCollision});
  let ownedBirth=0,remoteBirth=0;const fresh=P._new.bind(P);P._new=()=>{if(!P.pool.length)trace.projectileAllocations++;return fresh();};
  const push=P._push.bind(P);P._push=p=>{push(p);p._comparisonId=++ownedBirth;trace.births.push(record(p));};
  const ghost=P.ghostProjectile.bind(P);P.ghostProjectile=(a,e)=>{const p=ghost(a,e)||P.list.at(-1);p._comparisonId=++remoteBirth;trace.births.push(record(p));return p;};
  const curtain=G.fx.flickCurtain.bind(G.fx);G.fx.flickCurtain=(...args)=>{trace.curtains++;if(!Array.isArray(args.at(-1))||!args.at(-1).length)trace.unboundCurtains++;return curtain(...args);};
  const step=P._step.bind(P);P._step=(p,dt)=>{const dead=step(p,dt);trace.steps.push({...record(p),dead});return dead;};
  const splat=G.paint.splat.bind(G.paint);G.paint.splat=(c,r,t,o={})=>{if(!G.netm.mute)trace.paint.push({pos:c.toArray(),radius:r,team:t,applying:G.netm.applying});return splat(c,r,t,o);};
  globalThis.advance=()=>{
   clock+=1000/60;G.net.update(1/60);G.time+=1/60;
   for(const a of G.actors){if(a.remote)G.netm.applyRemote(a,1/60);else a.weaponRunner.update(1/60,{fire:false,firePressed:false});}
   P.update(1/60);G.fx.update(1/60,G.camera);g.fxHooks?.update(1/60);
   trace.maxProjectiles=Math.max(trace.maxProjectiles,P.list.length);trace.maxFx=Math.max(trace.maxFx,G.fx.dN);trace.maxRemote=Math.max(trace.maxRemote,P.list.filter(p=>p.ghost).length);trace.maxPuffs=Math.max(trace.maxPuffs,G.fx.puffs.n);
   const puff=G.fx.puffs,PS=puff.geo.getAttribute('aPosSize').array;
   for(let i=0;i<puff.n;i++){const src=puff._netSource?.[i];if(!src)continue;trace.puffLinkedFrames++;if(src.ghost)trace.remotePuffLinks++;const visible=PS[i*4+3]>0;if((src._qualityDead||src._qualityGeneration!==puff._netGeneration[i])&&visible)trace.invalidPuffVisible++;if(visible&&!src._qualityDead)trace.puffEnvelopeError=Math.max(trace.puffEnvelopeError,Math.hypot(PS[i*4]-src.pos.x,PS[i*4+1]-src.pos.y,PS[i*4+2]-src.pos.z));}
   const A=G.fx.dGeo.getAttribute('aPosR')?.array;
   if(A)for(let i=0;i<G.fx.dN;i++){const s=G.fx._qualityDropSource?.[i];if(!s)continue;trace.linkedFrames++;if(s.ghost)trace.remoteDropLinks++;const visible=A[i*4+3]>0;if((s._qualityDead||s._qualityGeneration!==G.fx._qualityDropGeneration[i])&&visible)trace.invalidLinkedVisible++;
    if(visible&&!s._qualityDead){const p=new G.camera.position.constructor(A[i*4],A[i*4+1],A[i*4+2]),ab=s.pos.clone().sub(s.prev),k=ab.lengthSq()?Math.max(0,Math.min(1,p.clone().sub(s.prev).dot(ab)/ab.lengthSq())):0;trace.maxEnvelopeError=Math.max(trace.maxEnvelopeError,p.distanceTo(s.prev.clone().addScaledVector(ab,k)));}}
  };
 },baseline);
 // The input starts on both owners in the same simulation tick. Alternate mode
 // while retaining the prior volley; immutable projectile metadata must win.
 const runFrames=async n=>{for(let i=0;i<n;i++){await Promise.all(pages.map(p=>p.evaluate(()=>advance())));flushWire();await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,0)))));}};
 await runFrames(15);
 for(const vertical of [false,true,false,true,false]){
  await Promise.all(pages.map(p=>p.evaluate(v=>{const a=NG.game.match.local;a.weaponRunner.cooldown=0;a.grounded=!v;a.ink=100;a.weaponRunner.update(1/60,{fire:true,firePressed:true});},vertical)));
  await runFrames(35);if(vertical)for(let i=0;i<2;i++){await pages[i].evaluate(()=>NG.renderer.render(NG.scene,NG.camera));await pages[i].screenshot({path:path.join(evidence,'vertical-player-'+i+'.png'),timeout:90000});}await runFrames(20);
 }
 await runFrames(120);
 for(let i=0;i<2;i++){await pages[i].evaluate(()=>{NG.renderer.render(NG.scene,NG.camera);});await pages[i].screenshot({path:path.join(evidence,'player-'+i+'.png'),timeout:90000});}
 const traces=await Promise.all(pages.map(p=>p.evaluate(()=>({trace,remaining:NG.projectiles.list.filter(p=>p.ghost).length,myId:NG.net.myId,actors:NG.actors.map(a=>({nid:a.nid,owner:a.owner,remote:a.remote})),stats:NG.netm.stats,puffSourceSlots:NG.fx.puffs._netSource?.length||0,puffGenerationBytes:NG.fx.puffs._netGeneration?.byteLength||0}))));
 // Keep raw evidence before any acceptance assertion can throw.
 fs.writeFileSync(path.join(evidence,'network-traces.json'),JSON.stringify(traces));
 let paired=0,maxPositionError=0,maxVelocityError=0,maxSpawnError=0,worstPosition=null;
 for(let i=0;i<2;i++){
  const local=traces[i].trace,remote=traces[1-i].trace;
  for(const birth of local.births.filter(p=>!p.ghost)){
   const b=remote.births.find(p=>p.ghost&&p.owner===birth.owner&&p.id===birth.id);assert(b,'missing remote birth '+birth.owner+'/'+birth.id);paired++;
   if(!baseline)for(const f of ['vertical','grav','drag','life','seed'])assert.equal(b[f],birth[f],f);
   const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));maxSpawnError=Math.max(maxSpawnError,distance(b.start,birth.start));maxVelocityError=Math.max(maxVelocityError,distance(b.vel,birth.vel));
   const source=local.steps.filter(p=>!p.ghost&&p.owner===birth.owner&&p.id===birth.id),target=remote.steps.filter(p=>p.ghost&&p.owner===birth.owner&&p.id===birth.id);
   assert(target.length,'remote never advanced');
   for(const s of target){const l=source.find(p=>Math.abs(p.age-s.age)<1e-8);if(!baseline)assert(l,'remote physics age absent from authoritative trace '+s.age);if(l){const delta=distance(l.pos,s.pos);if(delta>maxPositionError){maxPositionError=delta;worstPosition={ownerPlayer:i,birth,remoteBirth:b,authoritative:l,reconstructed:s,delta};}}}
  }
  assert.equal(traces[i].remaining,0,'remote projectile residue');if(!baseline){assert.equal(local.invalidLinkedVisible,0,'dead projectile left visible curtain');assert.equal(local.invalidPuffVisible,0,'dead projectile left visible puff');assert(local.remoteDropLinks>0&&local.remotePuffLinks>0,'remote render linkage was not exercised');assert.equal(local.unboundCurtains,0,'a roller curtain bypassed authoritative sources');assert.equal(local.curtains,10,'both owners must render all five volleys');assert(local.maxEnvelopeError<.001&&local.puffEnvelopeError<.001,'rendered curtain outside source segment');}
 }
 fs.writeFileSync(path.join(evidence,'network-comparison-diagnostic.json'),JSON.stringify({sourceSha,contentHash:build.contentHash,paired,maxSpawnError,maxVelocityError,maxPositionError,worstPosition}));
 assert(paired>0);assert(maxSpawnError<.01);assert(maxVelocityError<.01);if(!baseline)assert(maxPositionError<.08,'trajectory quantization tolerance');assert.equal(errors.length,0,JSON.stringify(errors));
 const ticks=wire.filter(p=>p.text.startsWith('b|')&&JSON.parse(p.text.slice(2)).k==='t');
 result={status:baseline?'baseline-reproduced':'passed',baseline,delayFrames,sourceSha,contentHash:build.contentHash,fixtureHash:hash(fixtureCode),transport:'real WebSocket + production RoomDurableObject.handleSession',arena:'native replication modules and physics; UI/character meshes/audio omitted',players:2,attacksPerPlayer:5,paired, maxSpawnError,maxVelocityError,maxPositionError,virtualSeconds:(15+275+120)/60,tickPackets:ticks.length,tickBytes:ticks.reduce((s,p)=>s+p.bytes,0),traces:traces.map(x=>({actors:x.actors,remaining:x.remaining,stats:x.stats,puffSourceSlots:x.puffSourceSlots,puffGenerationBytes:x.puffGenerationBytes,maxProjectiles:x.trace.maxProjectiles,maxFx:x.trace.maxFx,maxPuffs:x.trace.maxPuffs,maxRemote:x.trace.maxRemote,projectileAllocations:x.trace.projectileAllocations,puffLinkedFrames:x.trace.puffLinkedFrames,remoteDropLinks:x.trace.remoteDropLinks,remotePuffLinks:x.trace.remotePuffLinks,curtains:x.trace.curtains,unboundCurtains:x.trace.unboundCurtains,puffEnvelopeError:x.trace.puffEnvelopeError,invalidPuffVisible:x.trace.invalidPuffVisible,linkedFrames:x.trace.linkedFrames,maxEnvelopeError:x.trace.maxEnvelopeError})),loadedArtifacts:[...receipts],errors};
}catch(error){const diagnostic=await Promise.all(pages.map(async p=>{const d=await p.evaluate(()=>({mode:globalThis.NG?.mode,s3:globalThis.NG?.s3,game:!!globalThis.NG?.game,bootError:document.querySelector('#boot-error')?.textContent,base:document.baseURI})).catch(e=>({error:e.message}));await p.screenshot({path:path.join(evidence,'failure-'+pages.indexOf(p)+'.png'),timeout:15000}).catch(()=>{});return d;}));result={diagnostic,status:'failed',sourceSha,contentHash:build.contentHash,error:error.stack,errors};process.exitCode=1;}
finally{for(const c of contexts)await c.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}
const out=path.join(evidence,'network-browser-result.json');fs.writeFileSync(out+'.pending',JSON.stringify(result,null,2)+'\n');fs.renameSync(out+'.pending',out);console.log(JSON.stringify({...result,loadedArtifacts:result.loadedArtifacts?.length}));
