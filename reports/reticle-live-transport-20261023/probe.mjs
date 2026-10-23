import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from '/workspace/actions/node_modules/playwright/index.mjs';
import {WebSocketServer} from '/workspace/actions/node_modules/ws/wrapper.mjs';
import {createLocalRelay} from '/workspace/reticle-final-main7e027/scripts/lib/inkwave-local-relay-fixture.mjs';
import {adaptBuildSource} from '/workspace/reticle-final-main7e027/scripts/inkwave-source-composition.mjs';
import {parse} from '/workspace/reticle-final-main7e027/patches/loading-cache/vendor/acorn.mjs';
const root='/workspace/reticle-final-main7e027',site='/workspace/scratch/reticle-final-main7e027-site';
assert(process.argv[2],'Pass a new evidence directory; original runs must not be overwritten');
const out=path.resolve(process.argv[2]);assert(!fs.existsSync(out),'Evidence directory already exists; stop');fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(new URL(import.meta.url),path.join(out,'probe-snapshot.mjs'));
const head='f72ccdb4b11cb76b01dd0567975924cbd6d83c60',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const tree=git('rev-parse',head+'^{tree}');assert.equal(tree,'2b1fe89dcf4ffa078ee7d91cdd95292cdcf20756');
assert.equal(tree,git('rev-parse','HEAD^{tree}'));
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
for(const [file,digest]of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
for(const file of ['server/src/index.js','scripts/lib/inkwave-local-relay-fixture.mjs'])assert.equal(hash(fs.readFileSync(path.join(root,file))),hash(execFileSync('git',['show',head+':'+file],{cwd:root})),file);
const composed=adaptBuildSource('src/main.js',fs.readFileSync(path.join(root,'inkwave-public/src/main.js'),'utf8'));
const ast=parse(composed,{ecmaVersion:'latest',sourceType:'module'});let registration;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&n.key.name==='_bindEvents'){
 function find(x){if(!x||typeof x!=='object')return;if(x.type==='CallExpression'&&x.callee.name==='on'&&x.arguments[0]?.value==='hit')registration=composed.slice(x.start,x.end)+';';for(const v of Object.values(x))if(Array.isArray(v))v.forEach(find);else if(v&&typeof v==='object')find(v);}find(n);
}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(ast);assert(registration);
fs.writeFileSync(path.join(out,'main-hit-registration.js.txt'),registration);
const prefix='/_versions/'+build.build.revision;
const fixture=`
import * as THREE from 'three';
import {G,on} from '${prefix}/src/core/ctx.js';
import {Actor} from '${prefix}/src/game/actor.js';
import {Projectiles} from '${prefix}/src/game/weapons.js';
import {NetSession} from '${prefix}/src/net/session.js';
import {HUD} from '${prefix}/src/ui/hud.js';
import {install} from '${prefix}/patches/splatoon3/runtime/install.mjs';
import {installQuality} from '${prefix}/patches/local-quality/install.mjs';
import {sourceChargerHitCue} from '${prefix}/patches/splatoon3/runtime/audio/combat-hit-classifier.mjs';
import {blasterHitCueKind} from '${prefix}/patches/splatoon3/runtime/audio/blaster-hit.mjs';
const profile=await fetch('${prefix}/patches/splatoon3/profile.json').then(r=>r.json());install(profile);installQuality(profile);
globalThis.G=G;globalThis.trace=[];globalThis.phase='setup';
const push=(kind,data={})=>trace.push({kind,phase,at:performance.now(),...data});
G.time=0;G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#ff8800'),new THREE.Color('#0033ff')];G.teamHex=['#ff8800','#0033ff'];
G.camera=new THREE.PerspectiveCamera(55,1024/640,.1,100);G.camera.position.set(0,2,-5);G.camera.lookAt(0,1,3);
G.level={blocks:[],groundHeight:()=>0};G.physics={los:()=>true,raycast:(_a,_b,_c,h)=>{h.hit=false;return h;},segment:(_a,_b,h)=>{h.hit=false;return h;}};
G.paint={sample:()=>0,splat:()=>0};G.projectiles=new Projectiles(G.scene);G.actors=[];
class Display{constructor(a){this.actor=a;this.root=new THREE.Group();}_owner(){return this.actor;}_runner(){return this.actor.weaponRunner;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new THREE.Vector3(0,1.05,.3));}}
G.game={profile:{weapon:'shooter',name:'Reticle probe'},settings:{},menus:{launchLobby:async()=>{}},
 async startNetMatch(cfg,nm){
  G.actors=cfg.roster.map(r=>{const a=new Actor({team:r.team,name:r.name,weapon:r.weapon,CharacterClass:Display});a.character.actor=a;Object.assign(a,{owner:r.owner,nid:r.nid,isLocal:r.owner===G.net.myId,netLife:1});a.grounded=true;a.ground.hit=true;a.ground.face=0;a._spawnBarrier=()=>{};a._integrate=()=>{};a._finishFrame=()=>{};a.pos.set(0,0,r.team?3:0);a.aimDir.set(0,0,r.team?-1:1);a.aimPoint.set(0,1,r.team?0:3);return a;});
  G.local=G.actors.find(a=>a.isLocal);G.match=this.match={actors:G.actors,local:G.local,state:'init',mode:'turf',time:180,attract:false,playing:()=>true,canRespawn:()=>false};nm.bind(G.match);
  const rec=nm._rec;nm._rec=function(row){push('owner-record',{name:row[1],row:JSON.parse(JSON.stringify(row)),hp:G.local.hp});return rec.call(this,row);};
  push('bound',{owner:G.net.myId,actors:G.actors.map(a=>({nid:a.nid,owner:a.owner,remote:a.remote,local:a.isLocal,team:a.team}))});
 },netMatchGo(){G.match.state='playing';G.mode='match';const hud=G.game.hud;hud.setVisible(true);hud.el.classList.add('is-live');hud._updCrosshair({weapon:'shooter',crosshair:{spread:4,inRange:true,onTarget:false},hp:100,ink:1},1/60);hud.ret.style.translate='35px -20px';push('playing');},netMatchAborted(reason){push('aborted',{reason});}};
G.game.hud=new HUD(document.body);G.game.hud.ret.style.translate='35px -20px';
const hud=G.game.hud,marker=hud.hitMarker,restart=hud._restart;
hud._restart=function(el,cls){if(el===this.killEl)push('kill-cue-start');return restart.call(this,el,cls);};
hud.hitMarker=function(kind,feedback){const result=marker.call(this,kind,feedback);const sample=()=>push('marker-style',{markerKind:kind,damage:feedback?.damage,rootOpacity:getComputedStyle(this.el).opacity,xhOpacity:getComputedStyle(this.xh).opacity,hitOpacity:getComputedStyle(this.hitEl.children[0]).opacity,killOpacity:getComputedStyle(this.killEl.querySelector('i')).opacity,killAnimations:this.killEl.getAnimations({subtree:true}).length,reticleChildren:this.ret.children.length});requestAnimationFrame(()=>requestAnimationFrame(sample));push('marker-call',{markerKind:kind,damage:feedback?.damage,localAlive:this._local()?.alive,visible:this._visible,animations:this._hitAnimations?.map(a=>({state:a.playState,time:a.currentTime}))||[],killOn:this.killEl.classList.contains('is-on'),translate:this.hitEl.style.translate});return result;};
const registration=${JSON.stringify(registration)};
Function('on','G','sourceChargerHitCue','blasterHitCueKind','let lastHitSnd=0;'+registration).call(G.game,on,G,sourceChargerHitCue,blasterHitCueKind);
for(const kind of ['hit','combat:confirmed','damage','splatted'])on(kind,e=>push(kind,{attacker:e.attacker?.nid,victim:e.victim?.nid,attackerLocal:e.attacker?.isLocal,damage:e.damage??e.amount,killed:e.killed,hp:e.victim?.hp}));
G.net=new NetSession();
setInterval(()=>{try{const dt=1/60;G.time+=dt;G.net.update(dt);if(G.match?.state==='playing'){G.local.update(dt);G.projectiles.update(dt);}}catch(e){push('step-error',{message:e.stack});}},1000/60);
globalThis.shoot=(miss=false)=>{const a=G.local;a.yaw=a.aimYaw=miss?Math.PI/2:0;a.aimPitch=0;a.aimDir.set(miss?1:0,0,miss?0:1);a.aimPoint.copy(a.pos).add(new THREE.Vector3(miss?10:0,1,miss?0:3));a.weaponRunner.update(1/60,{fire:true,firePressed:true});a.weaponRunner.update(1/60,{fire:false});push('fire',{miss,ink:a.ink});};
globalThis.snapshot=()=>({owner:G.net.myId,state:G.net.state,actors:G.actors.map(a=>({nid:a.nid,hp:a.hp,alive:a.alive,remote:a.remote,owner:a.owner,position:a.pos.toArray()})),trace:trace.slice(),hud:{visible:hud._visible,hitChildren:hud.hitEl.children.length,animationCount:hud._hitAnimations?.length||0,killOn:hud.killEl.classList.contains('is-on')},nativeClock:performance.now.toString()});
globalThis.ready=true;
`;
fs.writeFileSync(path.join(out,'fixture.mjs'),fixture);
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/probe'){
 res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><script type="importmap">'+JSON.stringify({imports:{three:prefix+'/vendor/three/build/three.module.js','three/addons/':prefix+'/vendor/three/jsm/'}})+'</script><link rel="stylesheet" href="'+prefix+'/styles/ui.css"><style>:root{--u:8px}body{margin:0;background:#263544;color:white;font-family:sans-serif}</style></head><body><p>Transport + real HUD diagnostic; controlled arena</p><script type="module" src="/fixture.mjs"></script></body></html>');return;}
 if(url.pathname==='/fixture.mjs'){res.setHeader('content-type','text/javascript');res.end(fixture);return;}
 const file=path.resolve(site,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));
const rooms=new Map(),wire=[],duplicates=[],errors=[],loaded=new Map();let phase='setup',duplicate=false;
const decode=text=>{if(!text.startsWith('m|'))return null;let i=text.indexOf('|',2),j=i+1;if(text[j]==='@')j=text.indexOf('|',j)+1;try{return {from:text.slice(2,i),data:JSON.parse(text.slice(j))};}catch{return null;}};
const connect=createLocalRelay({rooms});relay.on('connection',(ws,req)=>{const name=new URL(req.url,'http://localhost').searchParams.get('name');connect(ws,req,{receive:text=>wire.push({direction:'client-to-worker',name,phase,at:Date.now(),text}),send:(text,deliver)=>{const row=decode(text);wire.push({direction:'worker-to-client',name,phase,at:Date.now(),text});deliver(text);if(duplicate&&name==='Host'&&(row?.data.k==='hit_ack'||row?.data.k==='t'&&row.data.e?.some(e=>e[1]==='ev'&&['hit','splatted'].includes(e[2])))){duplicates.push({phase,name,sha256:hash(text),kind:row.data.k,text});deliver(text);}}});});
let browser;const pages=[],contexts=[],cases=[];let result;
const address='http://127.0.0.1:'+server.address().port+'/probe?relay='+encodeURIComponent('ws://127.0.0.1:'+relay.address().port);
const save=()=>{fs.writeFileSync(path.join(out,'wire.json'),JSON.stringify(wire,null,2));fs.writeFileSync(path.join(out,'duplicates.json'),JSON.stringify(duplicates,null,2));};
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks']});
 for(let i=0;i<2;i++){const context=await browser.newContext({viewport:{width:1024,height:640}});contexts.push(context);const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push({player:i,message:e.stack}));p.on('response',async r=>{const file=new URL(r.url()).pathname.slice(1);if(build.artifacts[file]&&r.status()===200)try{loaded.set(file,{sha256:hash(await r.body()),expected:build.artifacts[file]});}catch(e){errors.push({response:file,message:e.message});}});await p.goto(address);await p.waitForFunction(()=>ready,{},{timeout:30000});}
 const [host,guest]=pages,code=await host.evaluate(()=>G.net.create('Host'));await guest.evaluate(code=>G.net.join(code,'Guest'),code);await host.waitForFunction(()=>G.net.lobby.players.length===2);
 await host.evaluate(()=>G.net.setSettings({bots:false,mode:'turf'}));await guest.waitForFunction(()=>G.net.lobby.bots===false);assert.equal(await host.evaluate(()=>G.net.confirmTeams()),true);await guest.waitForFunction(()=>G.net.lobby.teamsConfirmed);await Promise.all(pages.map(p=>p.evaluate(()=>G.net.setMe({ready:true}))));await host.waitForFunction(()=>G.net.canStart());
 assert.equal(await host.evaluate(()=>G.net.start()),true);await Promise.all(pages.map(p=>p.waitForFunction(()=>G.match?.state==='playing')));
 const settle=ms=>new Promise(r=>setTimeout(r,ms));await settle(1800);
 const phaseStart=async name=>{phase=name;duplicate=false;await Promise.all(pages.map(p=>p.evaluate(name=>{phase=name;},name)));};
 const take=async(name,before)=>{const after=await Promise.all(pages.map(p=>p.evaluate(()=>snapshot())));const delta=after.map((s,i)=>s.trace.slice(before[i].trace.length));const row={name,before:before.map(x=>({actors:x.actors,hud:x.hud})),after:after.map(x=>({actors:x.actors,hud:x.hud})),events:delta,markerCalls:delta.map(x=>x.filter(e=>e.kind==='marker-call')),killCueStarts:delta.map(x=>x.filter(e=>e.kind==='kill-cue-start').length)};cases.push(row);fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(cases,null,2));return row;};
 await phaseStart('miss');let before=await Promise.all(pages.map(p=>p.evaluate(()=>snapshot())));await host.evaluate(()=>shoot(true));await settle(600);let row=await take('miss',before);assert.equal(row.after[1].actors.find(a=>!a.remote).hp,100);assert.deepEqual(row.markerCalls.map(x=>x.length),[0,0]);
 for(const [name,hp]of [['nonlethal',64],['repeated-nonlethal-duplicate-delivery',28],['lethal',0]]){await phaseStart(name);duplicate=name.includes('duplicate');before=await Promise.all(pages.map(p=>p.evaluate(()=>snapshot())));await host.evaluate(()=>shoot(false));await guest.waitForFunction(hp=>G.local.hp===hp,hp,{timeout:6000});await host.waitForFunction(count=>trace.filter(e=>e.kind==='marker-call').length>=count,cases.filter(x=>x.name!=='miss').length+1,{timeout:6000});await settle(220);row=await take(name,before);assert.equal(row.after[1].actors.find(a=>!a.remote).hp,hp);assert.deepEqual(row.markerCalls.map(x=>x.length),[1,0]);assert.equal(row.markerCalls[0][0].markerKind,hp===0?'kill':'hit');assert.equal(row.killCueStarts[0],hp===0?1:0);assert.equal(row.killCueStarts[1],0);if(hp>0){assert.equal(row.markerCalls[0][0].damage,36);assert.equal(row.markerCalls[0][0].animations.length,4);}else assert.equal(row.markerCalls[0][0].damage,0);duplicate=false;await pages[0].screenshot({path:path.join(out,name+'.png')});}
 assert(duplicates.some(x=>x.kind==='hit_ack'));assert(duplicates.some(x=>x.kind==='t'));
 assert.deepEqual(errors,[]);for(const [file,row]of loaded)assert.equal(row.sha256,row.expected,file);
 const final=await Promise.all(pages.map(p=>p.evaluate(()=>snapshot())));assert(final.every(x=>x.trace.every(e=>e.kind!=='step-error')));
 result={status:'passed',head,tree,contentHash:build.contentHash,revision:build.build.revision,scope:'two isolated Chromium contexts, native browser WebSocket and real minified Actor/Projectiles/NetSession/Transport/HUD; production Worker fetch and RoomDurableObject under existing Node platform adapter',start:'native create/join/setMe/start/ready/go; no manual membership or authority metadata',mainListener:'exact composed main hit registration extracted without booting full Game',nativeClock:final.map(x=>x.nativeClock),cases,duplicateDeliveries:duplicates.map(({text,...x})=>x),loadedArtifacts:[...loaded],browser:browser.version(),errors,limits:['Controlled stationary arena uses minimal Character display and flat/no-wall collision doubles; no full Game/stage render.','Main hit registration is exact composed source; real HUD is the actual minified build, not a count-only substitute.','Local Node adapts Cloudflare platform; deployed relay, hibernation and internet/device latency untested.','No retail motion, physical GPU, Safari or Switch acceptance.','Prior outbound-prefix 42 source tests are separate evidence, not counted as this browser transport result.']};
}catch(e){process.exitCode=1;const states=await Promise.all(pages.map(p=>p.evaluate(()=>typeof snapshot==='function'?snapshot():{ready:globalThis.ready,body:document.body.innerText}).catch(e=>({error:e.message}))));result={status:'failed',head,tree,error:e.stack,errors,states,cases};for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:path.join(out,'failure-'+i+'.png')}).catch(()=>{});
}finally{save();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));await browser?.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:result.status,error:result.error,head,tree,cases:result.cases?.map(c=>({name:c.name,markers:c.markerCalls.map(x=>x.length),killCueStarts:c.killCueStarts})),duplicates:result.duplicateDeliveries?.length,errors:result.errors},null,2));
