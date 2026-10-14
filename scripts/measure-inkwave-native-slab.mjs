#!/usr/bin/env node
// CPU-only vertical-slab replay of the actual composed Actor/BotBrain, native stage, collision,
// projectiles and paint owners. The renderer implements no GPU work; all native
// atlas attribute generation/upload commands still execute. Not device FPS.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {performance,PerformanceObserver} from 'node:perf_hooks';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const root=path.resolve(get('--root',path.join(path.dirname(fileURLToPath(import.meta.url)),'..')));
const sourceDir=path.resolve(get('--source-dir',path.join(root,'.codex-stage-sources/scorch-source')));
const gcEntries=[],gcObserver=new PerformanceObserver(list=>gcEntries.push(...list.getEntries()));gcObserver.observe({entryTypes:['gc']});
const out=get('--out',null),baseline=args.includes('--baseline'),record=args.includes('--record'),profile=args.includes('--profile');
const hz=Number(get('--hz','60')),seconds=Number(get('--seconds','4')),count=Number(get('--actors','8')),warmup=Number(get('--warmup','1'));
if(![30,60,120].includes(hz)||!(seconds>0&&seconds<=20)||![1,2,4,8].includes(count)||!(warmup>=0&&warmup<=5))throw Error('Invalid bounded replay configuration');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const {SOURCE_STAGES}=await import(pathToFileURL(path.join(root,'patches/native-stages/runtime/source-catalog.mjs')));
const {convertSource}=await import(pathToFileURL(path.join(root,'patches/native-stages/runtime/source-convert.mjs')));
const stage=SOURCE_STAGES.find(s=>s.id==='scorch'),obj=fs.readFileSync(path.join(sourceDir,'Vss_Yunohana.obj')),mtl=fs.readFileSync(path.join(sourceDir,'Vss_Yunohana.mtl')),tree=JSON.parse(fs.readFileSync(path.join(sourceDir,'tree.json')));
if(hash(obj)!==stage.sourceSha256||tree.sha!==stage.tree||tree.truncated)throw Error('Unverified source identity');
const files={};for(const row of tree.tree)if(row.type==='blob')files[row.path]={bytes:row.size,gitSha1:row.sha};
if(mtl.length!==files['Vss_Yunohana.mtl'].bytes||crypto.createHash('sha1').update('blob '+mtl.length+'\0').update(mtl).digest('hex')!==files['Vss_Yunohana.mtl'].gitSha1)throw Error('Unverified MTL identity');
const data=convertSource(stage,obj.toString(),mtl.toString(),files);
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const oldFiles=new Map();
if(baseline){
 if(process.env.INKWAVE_BUILT_SITE)throw Error('--baseline source substitution cannot be used with a built site; provide a separately built baseline checkout');
 for(const name of ['triangle-world']){
  const rel=`patches/native-stages/runtime/${name}.mjs`,old=fs.readFileSync(path.join(root,`patches/native-stages/tests/fixtures/${name}-e57.mjs.txt`),'utf8');
  const expected={
   'triangle-world':'76206bdf0a42a5122759ca0914435e3a3f89da590740253e8c4f18d6127af92f',
   'native-level':'eb9dc9bea68bf981d15a4e532470d1a1c83f267c615e73840da0f304a3fc35c4',
  };
  if(hash(old)!==expected[name])throw Error('Frozen ray oracle identity changed: '+rel);
  oldFiles.set(rel,old);
 }
}
let rngState=0x51700b,randomCalls=0;const random=()=>{randomCalls++;rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};
const {fixture}=await import(pathToFileURL(path.join(root,'patches/splatoon3/tests/source-fixture.mjs')));
const f=await fixture({productionComposition:false,adaptNative:(rel,source)=>{
 let composed=adaptBuildSource(rel,source);
 return composed;
},fullRuntime:true,realProjectiles:true,vmMathRandom:random,adaptRuntime:(rel,s)=>adaptBuildSource(rel,oldFiles.get(rel)||s),extraExports:`
 export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';
 export {BotBrain} from './inkwave-public/src/game/bots.js';
 export {NavGraph} from './inkwave-public/src/game/nav.js';
`});
const {G,THREE}=f;G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);G.nav=new f.NavGraph(G.level,G.physics);G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.camera.position.set(0,10,8);G.mode='match';G.match.mode='turf';G.match.opts={};
const traces={actors:crypto.createHash('sha256'),grid:crypto.createHash('sha256'),orders:crypto.createHash('sha256'),commands:crypto.createHash('sha256'),uploads:crypto.createHash('sha256')};
const counts={quads:0,draws:0,splats:0,hits:0,damage:0,los:0,blocked:0};let paint,active=false;
const view={target:null,viewport:[0,0,2048,2048],scissor:[0,0,2048,2048],scissorTest:false};
const renderer={capabilities:{getMaxAnisotropy:()=>1},getRenderTarget:()=>view.target,setRenderTarget:v=>{view.target=v;},getViewport:o=>o.set(...view.viewport),setViewport(...v){view.viewport=v.length===1?v[0].toArray():v;},getScissor:o=>o.set(...view.scissor),setScissor(...v){view.scissor=v.length===1?v[0].toArray():v;},getScissorTest:()=>view.scissorTest,setScissorTest:v=>{view.scissorTest=v;},getClearColor:o=>o.setHex(0),getClearAlpha:()=>1,setClearColor(){},clear(){},render(){
 if(!active||!paint)return;counts.draws++;
 if(record){traces.uploads.update(JSON.stringify([paint.quads,paint.dryMesh.visible,paint._dryU.uDry.value]));for(const key of ['aPos','aLocal','aSplat','aStretch','aGrow']){const at=paint.geo.attributes[key];traces.uploads.update(Buffer.from(at.array.buffer,at.array.byteOffset,paint.quads*4*at.itemSize*4));}}
}};
paint=G.paint=new f.PaintSystem(renderer,G.level,{atlasSize:2048,maxDensity:18,cell:.25});paint.useFixedPaintClock();
const push=paint._pushQuad,splat=paint.splat;paint._pushQuad=function(...a){if(active){counts.quads++;if(record)traces.commands.update(Buffer.from(new Float64Array([a[0].id,...a.slice(1)]).buffer));}return push.apply(this,a);};paint.splat=function(...a){if(active)counts.splats++;return splat.apply(this,a);};
G.projectiles=new f.Projectiles(G.scene);
const applyHit=G.projectiles.applyHit;G.projectiles.applyHit=function(...a){if(active){counts.hits++;counts.damage+=Number(a[2])||0;}return applyHit.apply(this,a);};
const wet=f.BotBrain.prototype._wet,groundQueries=[];f.BotBrain.prototype._wet=function(x,z,y){const water=wet.call(this,x,z,y);if(active&&args.includes('--ground-out'))groundQueries.push([x,z,y+.6,f.PLAYER.fallDeathY,water]);return water;};
const los=G.physics.los;G.physics.los=function(a,b){const clear=los.call(this,a,b);if(active){counts.los++;if(!clear)counts.blocked++;}return clear;};
const rayQueries=[];if(args.includes('--ray-out')){const ray=G.level.triangleWorld.ray;G.level.triangleWorld.ray=function(o,d,far,opts){if(active)rayQueries.push([o.toArray(),d.toArray(),far,opts||{}]);return ray.apply(this,arguments);};}
const spawn=G.nav.nodes[G.nav.validIds.slice().sort((a,b)=>{const n=G.nav.nodes[a],m=G.nav.nodes[b];return n.x*n.x+n.z*n.z-m.x*m.x-m.z*m.z;})[0]];
for(let i=0;i<count;i++){const a=f.make('shooter');a.team=i%2;a.slot=i;a.isBot=true;a.nid=String(i);a.character.update=()=>{};delete a._integrate;delete a._finishFrame;delete a._spawnBarrier;a.spawnAt(new THREE.Vector3(spawn.x+(i%4)*.55,spawn.y,spawn.z+Math.floor(i/4)*.8),i%2?Math.PI:0);a.invuln=args.includes('--combat')?0:1e9;a.kidT=5;a.bot=new f.BotBrain(a);}
const snapshot=()=>G.actors.map(a=>({id:a.nid,pos:a.pos.toArray(),vel:a.vel.toArray(),hp:a.hp,ink:a.ink,alive:a.alive,form:a.form,grounded:a.grounded,groundTeam:a.groundTeam,yaw:a.yaw,aimYaw:a.aimYaw,aimPitch:a.aimPitch,special:a.special,stats:a.stats,intent:{...a.intent,move:a.intent.move.toArray()},bot:{mode:a.bot.mode,target:a.bot.target?.nid,path:a.bot.path,pi:a.bot.pi,think:a.bot.think},runner:Object.fromEntries(Object.entries(a.weaponRunner).filter(([,v])=>['number','boolean','string'].includes(typeof v)))}));
const timings={};const observe=(o,k)=>{if(!profile)return;const native=o[k];o[k]=function(...a){if(!active)return native.apply(this,a);const t=performance.now();try{return native.apply(this,a);}finally{const row=timings[k]||(timings[k]={calls:0,ms:0});row.calls++;row.ms+=performance.now()-t;}};};
for(const k of ['_steer','_perceive','_tail'])observe(f.BotBrain.prototype,k);for(const k of ['ray','queryBox','_capsuleDistance'])observe(G.level.triangleWorld,k);for(const k of ['groundProbe','los'])observe(G.physics,k);for(const k of ['advanceSimulation','splat','flush'])observe(paint,k);
const frames=[];function step(n){for(let i=0;i<n;i++){const t=performance.now();G.time+=1/hz;for(const a of G.actors){a.bot.update(1/hz);a.update(1/hz);}G.projectiles.update(1/hz);paint.advanceSimulation(1/hz);paint.flush(1/hz);if(active){frames.push(performance.now()-t);if(record){traces.actors.update(JSON.stringify(snapshot()));traces.grid.update(paint.grid);traces.orders.update(Buffer.from(paint._paintOwnershipOrder.buffer));}}}}
step(Math.round(warmup*hz));active=true;const beforeQueries=G.level.triangleWorld.queryCount,beforeTriangles=G.level.triangleWorld.triangleTests,memoryBefore=process.memoryUsage(),cpu0=process.cpuUsage(),t0=performance.now();step(Math.round(seconds*hz));const end=performance.now(),elapsed=end-t0,cpu=process.cpuUsage(cpu0),memoryAfter=process.memoryUsage();active=false;
await new Promise(resolve=>setImmediate(resolve));gcEntries.push(...gcObserver.takeRecords());gcObserver.disconnect();
const observedGc=gcEntries.filter(e=>e.startTime>=t0&&e.startTime<end);
const gc={count:observedGc.length,ms:observedGc.reduce((n,e)=>n+e.duration,0),events:observedGc.map(e=>({kind:e.detail?.kind,ms:e.duration,offset:e.startTime-t0}))};
const quantile=q=>{const sorted=frames.slice().sort((a,b)=>a-b);return sorted[Math.floor(q*(sorted.length-1))];};
const result={schema:1,harnessSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),variant:get('--label',baseline?'ee9-slab-baseline':'slab-candidate'),built:process.env.INKWAVE_BUILT_SITE?JSON.parse(fs.readFileSync(path.join(process.env.INKWAVE_BUILT_SITE,'inkwave-build.json'))).contentHash:null,sourceSha256:stage.sourceSha256,hz,seconds,warmup,actors:count,combat:args.includes('--combat'),record,profile,alive:G.actors.filter(a=>a.alive).length,elapsed,cpu,memory:{before:memoryBefore,after:memoryAfter},gc,frame:{p50:quantile(.5),p95:quantile(.95),p99:quantile(.99)},counts,rays:G.level.triangleWorld.queryCount-beforeQueries,triangleTests:G.level.triangleWorld.triangleTests-beforeTriangles,randomCalls,rngState,timings,final:{actors:snapshot(),grid:hash(paint.grid),orders:hash(Buffer.from(paint._paintOwnershipOrder.buffer)),counts:paint.counts,version:paint.version},trace:record?Object.fromEntries(Object.entries(traces).map(([k,v])=>[k,v.digest('hex')])):null,limits:['CPU fixture, not full game/browser/device FPS.','Character display, audio, FX and GPU raster/driver work absent. Native paint atlas CPU writes and upload arguments execute.','Invulnerable fixture keeps density unless --combat is supplied; combat replay retains ordinary damage and attrition.','Timings include the documented wrappers; record/profile timings are diagnostics, not acceptance comparisons.','GC entries are observed, never forced or subtracted; heap snapshots bracket measured work. Process CPU includes V8 helper threads.']};
if(args.includes('--ray-out'))fs.writeFileSync(get('--ray-out'),JSON.stringify(rayQueries));if(args.includes('--ground-out'))fs.writeFileSync(get('--ground-out'),JSON.stringify(groundQueries));if(out)fs.writeFileSync(out,JSON.stringify(result,null,2));else console.log(JSON.stringify(result));
