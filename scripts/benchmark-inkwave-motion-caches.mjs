#!/usr/bin/env node
// Compare original packs and real emitted motion modules. Timings are isolated
// pose sampling / spring updates, never whole-game or physical-iPad FPS.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {transform} from 'esbuild';
import {adaptMotionFkHotpath} from '../patches/local-quality/motion-fk-hotpath-adapter.mjs';
import {replaceOnce} from '../patches/local-quality/adapter.mjs';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','motion-cache-browser.json')),browserName=arg('--browser','chromium');
assert.ok(['chromium','webkit'].includes(browserName));
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),base='/_versions/'+manifest.build.revision+'/';
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
const fixtures={};
for(const name of ['root-hair','source-bank'])fixtures[name]=fs.readFileSync(new URL('../patches/local-quality/tests/fixtures/'+name+'-07f44b97.mjs.txt',import.meta.url));
assert.equal(hash(fixtures['root-hair']),'a06dbce59bd1897ed7a9d266378b9a179ffb9cb1b8acfefa7327ae6b21ffb05b');
// The tracked source-bank fixture differs from its original 35a56d8 snapshot only
// by removal of the first-line provenance comment. Preserve exact byte pinning.
assert.equal(hash(fixtures['source-bank']),'e3a5d948780dba4a83624a76e1bf648ed1ab87ebb3800b6b3b983fba7c5f594b');
// Retain the FK optimization that already existed on main. Compile both old
// modules with the production per-file options before comparing to emitted code.
for(const name of Object.keys(fixtures))fixtures[name]=(await transform(adaptMotionFkHotpath('src/game/motion/'+name+'.js',fixtures[name].toString(),replaceOnce),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline'})).code;
const receipts=new Set(),html='<!doctype html><script type="importmap">'+JSON.stringify({imports:{three:base+'vendor/three/build/three.module.js','three/addons/':base+'vendor/three/jsm/'}})+'</script>';
const server=http.createServer((req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(name==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
 const match=name.match(/^\/before\/src\/game\/motion\/(root-hair|source-bank)\.js$/);
 if(match){res.writeHead(200,{'content-type':'text/javascript'});res.end(fixtures[match[1]]);return;}
 const rel=name.startsWith('/before/')?base.slice(1)+name.slice('/before/'.length):name.slice(1),file=path.resolve(site,rel);
 assert.ok(file.startsWith(site+'/')&&manifest.artifacts[rel],rel);const bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[rel]);receipts.add(rel);
 res.writeHead(200,{'content-type':/\.m?js$/.test(rel)?'text/javascript':/\.json$/.test(rel)?'application/json':'application/octet-stream'});res.end(bytes);
 }catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await ({chromium,webkit}[browserName]).launch({headless:true,args:browserName==='chromium'?['--no-sandbox']:[]});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const result=await page.evaluate(async base=>{
  const THREE=await import('three'),modules=await Promise.all([import('/before/src/game/motion/source-bank.js'),import(base+'src/game/motion/source-bank.js')]),roots=await Promise.all([import('/before/src/game/motion/root-hair.js'),import(base+'src/game/motion/root-hair.js')]);
  const equal=(a,b,label)=>{if(a.length!==b.length)throw Error(label+' length');for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))throw Error(label+' '+i+': '+a[i]+' != '+b[i]);};
  const snap=p=>[...p.raw,...p.flags,...p.p.flatMap(v=>v.toArray()),...p.q.flatMap(q=>q.toArray()),...p.s.flatMap(v=>v.toArray()),...p.world.flatMap(m=>m.elements),...p.wp.flatMap(v=>v.toArray()),...p.wq.flatMap(q=>q.toArray())];
  let poses=0,clips=0,cacheBytes=0;const banksByVariant={};
  for(const variant of ['Player00','Player01','Player_Squid']){
   const banks=await Promise.all(modules.map(m=>m.loadSourceBank(variant)));banksByVariant[variant]=banks;
   const outputs=banks.map((b,i)=>new modules[i].SourcePose(b));
   for(const clip of banks[0].meta.clips)for(const [frame,loop]of [[0,false],[clip.frames*.37,false],[-1,true]]){
    for(let k=0;k<2;k++){outputs[k].q[0].set(.3,.5,.7,.9);banks[k].sample(clip.name,frame,outputs[k],loop);}
    equal(snap(outputs[0]),snap(outputs[1]),variant+'/'+clip.name+'/'+frame);poses++;
   }
   clips+=banks[0].meta.clips.length;
  }
  const banks=banksByVariant.Player00,outputs=banks.map((b,i)=>new modules[i].SourcePose(b)),rotationSineCalls=[];
  for(let k=0;k<2;k++){
   const old=Math.sin;let count=0;Math.sin=(...a)=>{count++;return old(...a);};
   try{for(let i=0;i<360;i++)banks[k].sample('WalkHold_Nrml',i*.5,outputs[k],true);}finally{Math.sin=old;}rotationSineCalls.push(count);
  }
  const poseTimes=[[],[]];for(let i=0;i<8;i++){const k=[0,1,1,0][i%4],t=performance.now();for(let j=0;j<1200;j++)banks[k].sample('WalkHold_Nrml',j*.5,outputs[k],true);poseTimes[k].push(performance.now()-t);}
  const make=Root=>{
   const kid=new THREE.Group(),head=new THREE.Bone();kid.add(head);const c={kid,bones:{head},hairMeta:[],_kidXform(b,pos,quat){pos.set(0,0,0);quat.identity();let o=b;while(o&&o!==this.kid){pos.applyQuaternion(o.quaternion).add(o.position);quat.premultiply(o.quaternion);o=o.parent;}return pos;}};
   for(let si=0;si<6;si++){c.hairMeta.push({K:.4+si*.17,len:.09+si*.052});let parent=head;for(let k=0;k<4;k++){const b=new THREE.Bone();b.position.set(.03*(si-2),-.06,.02*k);parent.add(b);parent=b;c.bones[k<3?'hair'+si+'_'+k:'hairTip'+si]=b;}}
   return {c,hair:new Root(c)};
  };
  const pair=roots.map(m=>make(m.RootHairInertia));let hairFrames=0;
  for(const hz of [30,60,120])for(let i=0;i<240;i++){
   const dt=i%31===0?0:i%19===0?.041:1/hz;
   pair.forEach(f=>{f.c.bones.head.rotation.set(Math.sin(i*.11)*.2,i*.031,Math.cos(i*.08)*.1);if(i===87)f.hair.chains[0].K*=1.07;if(i===129)f.hair.reset();f.hair.update(dt,Math.sin(i*.077)*(i%53===0?500:7));});
   equal(pair[0].hair.state,pair[1].hair.state,'hair state');for(const name of Object.keys(pair[0].c.bones))equal(pair[0].c.bones[name].quaternion.toArray(),pair[1].c.bones[name].quaternion.toArray(),name);hairFrames++;
  }
  const hairTimes=[[],[]];for(let i=0;i<8;i++){const k=[0,1,1,0][i%4],t=performance.now();for(let j=0;j<1200;j++)pair[k].hair.update(1/60,Math.sin(j*.1));hairTimes[k].push(performance.now()-t);}
  return {poses,clips,cacheBytes,rotationSineCalls,poseTimesMs:poseTimes,hairFrames,hairTimesMs:hairTimes,cacheRecords:pair[1].hair.chains.length};
 },base);
 // Use separate realms with stable prototypes for the full Character timing.
 // Swapping methods on one prototype invalidates optimized consumer code and
 // is useful for parity diagnostics, but cannot qualify a performance result.
 const owners=[];
 try{
  for(const root of ['/before/',base]){
   const p=await browser.newPage();owners.push(p);p.on('pageerror',e=>errors.push(String(e)));await p.goto('http://127.0.0.1:'+server.address().port+'/');
   await p.evaluate(async root=>{
    const THREE=await import('three'),{install}=await import(root+'patches/splatoon3/runtime/install.mjs'),{Level}=await import(root+'src/world/level.js');
    const api=install(await fetch(root+'patches/splatoon3/profile.json').then(r=>r.json())),G=api.G;
    G.scene=new THREE.Scene();G.settings={quality:'high'};G.mode='match';G.time=0;G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
    G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
    G.physics=new api.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.actors=[];G.projectiles=new api.Projectiles(G.scene);G.match={playing:()=>true,canRespawn:()=>false};Math.random=()=>.4;
    const a=new api.Actor({team:0,name:'motion-calculation-browser',isLocal:true,weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
    ch.actor=a;ch.setLod('hero');a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
    await ch._sourceMotionLoader;await ch.sourceMotion.ready;ch.onEvent=null;G.actors=[a];globalThis.ownerSteps=0;
    globalThis.ownerTick=()=>{const i=ownerSteps++,ang=i*.025;G.time=(i+1)/60;ch.root.position.set(Math.sin(ang)*2,0,Math.cos(ang)*2);ch.root.rotation.y=ang;ch.update(1/60,{form:'kid',grounded:true,speed:4,localMove:{x:Math.sin(ang),z:Math.cos(ang)},firing:i%120>60,ink:1,hp:1,vy:0,aimPitch:.12});ch.root.updateMatrixWorld(true);ch.skeleton.update();};
    globalThis.ownerSnapshot=()=>[...ch.sourceMotion.rootHair.state,...ch.skeleton.boneMatrices,...ch.boneList.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),...ch.getMuzzle(new THREE.Vector3()).toArray()];
    for(let i=0;i<2000;i++)ownerTick();
   },root);
  }
  result.characterTimesMs=[[],[]];
  for(let i=0;i<8;i++){const k=[0,1,1,0][i%4];result.characterTimesMs[k].push(await owners[k].evaluate(()=>{const t=performance.now();for(let j=0;j<600;j++)ownerTick();return performance.now()-t;}));}
  const snapshots=await Promise.all(owners.map(p=>p.evaluate(()=>ownerSnapshot())));assert.deepEqual(snapshots[1],snapshots[0],'independent actual Character final pose/skeleton/muzzle');
  result.characterFramesPerVersion=await owners[0].evaluate(()=>ownerSteps);result.characterMeasurement='Independent browser realms, stable prototypes, 2000 warmup ticks, 600 ticks/window, ABBA x2; no renderer';
 }finally{await Promise.all(owners.map(p=>p.close()));}
 assert.deepEqual(errors,[]);assert.equal(result.poses,1644);assert.equal(result.clips,548);assert.ok(result.rotationSineCalls[1]<result.rotationSineCalls[0]*.75);
 const report={status:'passed',browser:browser.version(),engine:browserName,contentHash:manifest.contentHash,revision:manifest.build.revision,baselineEmissionHashes:Object.fromEntries(Object.entries(fixtures).map(([k,v])=>[k,hash(v)])),scope:'Original motion packs, emitted SourceBank/SourcePose and RootHairInertia with real Three.js bones; exact numeric parity. ABBA timings isolate pose sampling and spring updates. No renderer, full-match FPS, peak RSS or physical-iPad result.',...result,artifacts:[...receipts].sort()};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,artifacts:report.artifacts.length}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
