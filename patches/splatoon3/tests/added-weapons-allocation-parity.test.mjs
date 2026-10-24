import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {createTacticooler,disposeSpecialModel} from '../runtime/special-motion.mjs';
import {kitSweepSphereBlocks} from '../runtime/trizooka-collision.mjs';
import {catalogSplashRadius} from '../runtime/catalog-splash-paint.mjs';
import {cloudCoversActor} from '../runtime/storm-effects.mjs';
import {spawnTorpedoSplashes,stepTorpedoSplashes,clearTorpedoSplashes} from '../runtime/torpedo-splashes.mjs';
const oracle=JSON.parse(fs.readFileSync(new URL('./fixtures/added-weapons-original-kernels.json',import.meta.url)));
const runtime=name=>fs.readFileSync(new URL('../runtime/'+name,import.meta.url),'utf8');
const cut=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const json=x=>JSON.parse(JSON.stringify(x));
function compile(source,names,globals={}){return vm.runInNewContext(source+'\n({'+names.join(',')+'})',{THREE,console,...globals});}
let seed=0x214363;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const number=()=>100*(random()-.5);

test('actual rounded OBB candidate t/kind/axis/sign preserves all face/edge/corner and degenerate results',()=>{
 const before=compile(oracle.kernels.obb,['blockCandidates'],{_inv:[0,0,0],_ld:[0,0,0]}).blockCandidates;
 const after=compile(cut(runtime('trizooka-collision.mjs'),'function blockCandidates','// The real closest point'),['blockCandidates'],{_inv:[0,0,0],_ld:[0,0,0]}).blockCandidates;
 for(let i=0;i<12000;i++){
  const yaw=number(),block={center:new THREE.Vector3(number(),number(),number()),half:new THREE.Vector3(random()*5,random()*5,random()*5),
   axes:[new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),new THREE.Vector3(0,1,0),new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw))]};
  const a=new THREE.Vector3(number(),number(),number()),b=i%25===0?a.clone():new THREE.Vector3(number(),number(),number());
  if(i%3===0)a.copy(block.center);
  const radius=i%7===0?0:random()*8;
  assert.deepEqual(json(after(block,a,b,radius)),json(before(block,a,b,radius)),String(i));
 }
});

test('actual no-offset and Splatana lobe coordinates preserve Object.is including signed zero/nonfinite fallbacks',()=>{
 const baseline=oracle.kernels.lobes,current=cut(runtime('main-weapon-catalog.mjs'),'  function lobes(p){','  function spiralContactClear');
 const globals={finite:(n,d)=>Number.isFinite(n)?n:d,EMPTY_LOBE_OFFSETS:[],EMPTY_LOBE_OFFSET:{}};
 const old=compile(baseline,['lobes'],globals).lobes,now=compile(current,['lobes'],globals).lobes;
 const edge=[0,-0,Infinity,-Infinity,NaN];
 for(let i=0;i<6000;i++){
  const coords=Array.from({length:8},()=>i%3?number():edge[Math.floor(random()*edge.length)]);
  const offsets=i%4===0?[{X:number(),Y:number(),Z:number()}]:i%4===1?[]:undefined;
  const make=()=>({vel:new THREE.Vector3(coords[6],0,coords[7]),prev:new THREE.Vector3(...coords.slice(0,3)),pos:new THREE.Vector3(...coords.slice(3,6)),
    catalog:{descriptor:{c:{...(offsets?{OffsetArray:offsets}:{}),ParamArray:[{},{}]}},lobes:[0,1].map(()=>({from:new THREE.Vector3(),to:new THREE.Vector3()}))}});
  const a=old(make()),b=now(make());
  for(let j=0;j<2;j++)for(const k of ['from','to'])for(const axis of ['x','y','z'])assert(Object.is(a[j][k][axis],b[j][k][axis]),`${i} ${k}.${axis}`);
 }
 const math=Object.create(Math);let trig=0;for(const k of ['atan2','sin','cos'])math[k]=(...a)=>{trig++;return Math[k](...a);};
 const lobes=compile(current,['lobes'],{...globals,Math:math}).lobes;
 lobes({vel:new THREE.Vector3(1,2,3),prev:new THREE.Vector3(1,2,3),pos:new THREE.Vector3(2,3,4),catalog:{descriptor:{c:{}},lobes:[{from:new THREE.Vector3(),to:new THREE.Vector3()}]}});
 assert.equal(trig,0);
});

function beam(source){return compile(source,['beamTouchesObject']).beamTouchesObject;}
test('Wail broadphase retains the original discrete wall hits including contact bounds, unusual dimensions and zero segments',()=>{
 const before=beam(oracle.kernels.beam),after=beam(cut(runtime('all-specials.mjs'),'function beamTouchesObject','function screenObjectContact'));
 const rt={v14:new THREE.Vector3()};let loops=0;const copy=rt.v14.copy;rt.v14.copy=function(...a){loops++;return copy.apply(this,a);};
 for(let i=0;i<2200;i++){
  const from=new THREE.Vector3(number(),number(),number()),to=new THREE.Vector3(number()*20,number(),number()*20);
  if(i%17===0)to.copy(from);
  const object={subId:'splashWall',pos:new THREE.Vector3(number(),number(),number()),yaw:number(),spec:{wallWidth:random()*15,wallHeight:random()*15}};
  if(i%4===0)object.pos.copy(from).lerp(to,random());
  if(i%20===0)object.spec.wallWidth=-1;
  assert.equal(after(rt,from,to,object),before(rt,from,to,object),String(i));
 }
 const object={subId:'splashWall',pos:new THREE.Vector3(500,20,200),spec:{},yaw:0};loops=0;
 assert.equal(after(rt,new THREE.Vector3(),new THREE.Vector3(0,0,1000),object),false);assert.equal(loops,0);
 before(rt,new THREE.Vector3(),new THREE.Vector3(0,0,1000),object);assert.equal(loops,2859);
});

test('Booyah radius plan preserves ordered slope-projected tiles, repeated terrain probes and final paint/turf payloads',()=>{
 const current=runtime('all-specials.mjs'),common={MAX_STAMP_RADIUS:3.74,q2:n=>Math.round(n*100)/100,finite:Number.isFinite,seedUnit:(s)=>s/1000};
 const old=compile(oracle.kernels.paint,['paintDiskLayout','paintBooyahGrowth'],common);
 const now=compile(cut(current,'function paintDiskCentres','function paintCross'),['paintDiskLayout','paintBooyahGrowth'],common);
 for(const radius of [3.7400001,4,5.1,7.48,9.38,13.5,19.75]){
  const traces=[];
  for(const api of [old,now]){
   const stamps=[],probes=[],turf=[],normal=new THREE.Vector3(.15,1,.25).normalize(),point=new THREE.Vector3(-3.555,5.465,1.335);
   const rt={api:{THREE,G:{physics:{raycast(from,down,length,hit){probes.push([from.toArray(),down.toArray(),length]);hit.hit=true;hit.normal.copy(normal);return hit;}},paint:{splat(p,r,t,o){stamps.push([p.toArray(),r,t,o.seed,o.claimMode]);return 1;}}}},up:new THREE.Vector3(0,1,0),down:new THREE.Vector3(0,-1,0),v4:new THREE.Vector3(),hit:{normal:new THREE.Vector3()}};
   const actor={team:1,addTurfNoSpecial:n=>turf.push(n)},object={owner:actor,pos:point};
   for(let frame=2;frame<=6;frame++){point.x+=.001;api.paintBooyahGrowth(rt,object,frame,radius,413);}
   traces.push({stamps,probes,turf,keys:[...object.paintDiskTiles],paintFrame:object.paintFrame,paintedRadius:object.paintedRadius});
  }
  assert.deepEqual(json(traces[0]),json(traces[1]),String(radius));assert.equal(traces[1].probes.length,6);
 }
});

test('Toxic Mist absent state skips empty deletes while own undefined/stale properties preserve deletion semantics',()=>{
 const old=compile(oracle.kernels.status,['updateStatuses']).updateStatuses;
 const now=compile(cut(runtime('all-subs.mjs'),'function updateStatuses','function updateFlight'),['updateStatuses']).updateStatuses;
 for(const time of [-1,0,1,NaN,Infinity])for(const source of [{},{toxicMistSlowUntil:undefined},{toxicMistScale:undefined},{toxicMistJumpScale:.5},
  {toxicMistSlowUntil:0,toxicMistScale:.5},{toxicMistSlowUntil:2,toxicMistScale:.5},{toxicMistSlowUntil:NaN},{toxicMistSlowUntil:Infinity}]){
  const a={...source},b={...source};old({G:{actors:[{s3:a}],time}},1/60);now({G:{actors:[{s3:b}],time}},1/60);assert.deepEqual(a,b);
 }
 let deletes=0;const absent=new Proxy({},{deleteProperty(t,k){deletes++;return Reflect.deleteProperty(t,k);}});
 now({G:{actors:[{s3:absent}],time:1}},1/60);assert.equal(deletes,0);
 old({G:{actors:[{s3:absent}],time:1}},1/60);assert.equal(deletes,3);
});

test('Storm recovery scratch preserves LOS coordinates across actors, nesting, exceptions and changing cloud height',()=>{
 const actor={alive:true,team:0,pos:new THREE.Vector3(1,2,3)},cloud={t:1,dur:8,group:{position:new THREE.Vector3(1,9,3)}};
 const before=actor.pos.clone(),rows=[],G={physics:{los(a,b){rows.push([a.toArray(),b.toArray()]);return true;}}},SPECIALS={storm:{radius:5}};
 assert.equal(cloudCoversActor(cloud,actor,G,SPECIALS),true);assert.equal(cloudCoversActor(cloud,actor,G,SPECIALS),true);assert.deepEqual(rows[0],[[1,3.2,3],[1,8.4,3]]);
 let nested=false;G.physics.los=(a,b)=>{const first=[a.toArray(),b.toArray()];if(!nested){nested=true;actor.pos.x=2;cloudCoversActor(cloud,actor,G,SPECIALS);assert.deepEqual([a.toArray(),b.toArray()],first);throw Error('LOS');}return true;};
 assert.throws(()=>cloudCoversActor(cloud,actor,G,SPECIALS),/LOS/);G.physics.los=()=>true;assert.equal(cloudCoversActor(cloud,actor,G,SPECIALS),true);actor.pos.x=1;assert.deepEqual(actor.pos,before);
});

test('Torpedo/Fizzy share exact geometry while individual birth colors, cap evictions and last-user disposal remain independent',()=>{
 let created=0,disposed=0,materials=0;
 class Geometry extends THREE.SphereGeometry{constructor(...args){super(...args);created++;this.args=args;}dispose(){disposed++;super.dispose();}}
 class Material extends THREE.MeshBasicMaterial{constructor(opts){super(opts);materials++;}dispose(){materials--;super.dispose();}}
 class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;this.position=new THREE.Vector3();}}
 const scene={children:new Set(),add(m){this.children.add(m);m.parent=this;},remove(m){this.children.delete(m);m.parent=null;}};
 const api={THREE:{...THREE,SphereGeometry:Geometry,MeshBasicMaterial:Material,Mesh},G:{scene,physics:{segment(a,b,h){h.hit=false;return h;} }},Hit:class{}};
 const p={},owner={color:new THREE.Color('#ff0000'),remote:false},source={seed:42,owner,team:0,chasedTarget:true,spec:{gravity:24,splashDamage:12,splashAround:{count:8,pitchDegrees:65,velocityMin:2,velocityMax:3,paintRadius:.5}}};
 spawnTorpedoSplashes(api,p,source,new THREE.Vector3(0,5,0));assert.equal(created,1);assert.equal(materials,1);const first=p._s3TorpedoSplashes[0],shared=first.visual.mesh.geometry;assert.deepEqual(shared.args,[.1,6,4]);
 owner.color.set('#0000ff');spawnTorpedoSplashes(api,p,source,new THREE.Vector3(0,5,0));assert.equal(created,1);assert.notEqual(first.visualColor.getHex(),p._s3TorpedoSplashes.at(-1).visualColor.getHex());
 first.pos.y=-101;first.vel.set(0,0,0);stepTorpedoSplashes(api,p,1/60,()=>assert.fail('below-world cleanup is not a burst'));assert.equal(disposed,0);assert.equal(p._s3TorpedoSplashes.length,15);
 for(let i=0;i<100;i++)spawnTorpedoSplashes(api,p,source,new THREE.Vector3(0,5,0));assert.equal(p._s3TorpedoSplashes.length,768);assert.equal(created,1);assert.equal(disposed,0);
 clearTorpedoSplashes(p);assert.equal(disposed,1);assert.equal(materials,0);assert.equal(scene.children.size,0);assert.equal(p._s3TorpedoVisuals.size,0);
 spawnTorpedoSplashes(api,p,source,new THREE.Vector3(0,5,0));assert.equal(created,2);clearTorpedoSplashes(p);assert.equal(disposed,2);
});

test('Point Sensor per-record sweep scratch resets partial capsule outputs and preserves nearest body vs terrain contact',()=>{
 const globals={aliveInMatch:()=>false,vec3:p=>p?.isVector3,POINT_SENSOR:{maxFlightSeconds:3,areaSeconds:2.5},poseSensorVisual(){},retireDrink(){}};
 const old=compile(oracle.kernels.sensor,['stepSupport'],globals).stepSupport;
 const now=compile(cut(runtime('kit-support.mjs'),'function stepSupport','export function installSupportGameplay'),['stepSupport'],globals).stepSupport;
 for(let i=0;i<90;i++){
  const traces=[];
  for(const step of [old,now]){
   const source={pos:new THREE.Vector3(0,3,0),prev:new THREE.Vector3(),vel:new THREE.Vector3(0,0,6),team:0,age:0,activeAt:null,expires:Infinity,ghost:true,seen:new Set(),hit:{},pulses:0};
   const p={_s3SupportSensors:[source]},G={time:0,actors:[0,1,2].map(k=>({team:1,alive:true,form:k%2?'squid':'kid',pos:new THREE.Vector3(k*.2,0,0),smoothY:k*.02})),physics:{segment(a,b,h){h.hit=i%3===0;if(h.hit){h.point=a.clone().lerp(b,.75);h.normal=new THREE.Vector3(0,1,0);}return h;}}};
   const rows=[],capsules=[];let calls=0;
   const Physics={segmentCapsuleDist(a,b,base,r,height,out){capsules.push([base.toArray(),height,out.t,out.dist]);const k=calls++%3;
     if(i%7===0&&k===1)return;out.dist=k===2?.1:2;out.t=(i%4)*.1;}};
   for(let j=0;j<4;j++){G.time+=1/60;step(p,G,THREE,1/60,Physics,{radius:.3,height:1.7,squidHeight:.6});rows.push([source.pos.toArray(),source.vel.toArray(),source.age,source.activeAt,source.expires]);}
   traces.push({rows,capsules});
  }
  assert.deepEqual(traces[0],traces[1],String(i));
 }
});

function coolerWorld(source){
 let hits=0;const logs=[];
 class Hit{constructor(){hits++;this.hit=false;this.point=new THREE.Vector3();this.normal=new THREE.Vector3();}}
 class Projectiles{}
 class Actor{_resolve(){logs.push(['native',this.pos.toArray()]);if(this.crash)throw Error('native resolve');
   if(this.reenter&&!this.inside){this.inside=true;const pos=this.pos.clone();this.pos.set(0,0,-.6);this._s3CoolerMovementStart.set(0,0,-4);this._resolve(false,0,false);this.pos.copy(pos);this.inside=false;}return 317;}}
 const module=compile(source.replace(/^import .*;\n/gm,'').replace(/export /g,''),['installCoolerCollision'],{createTacticooler,disposeSpecialModel,kitSweepSphereBlocks});
 const system=new Projectiles(),G={time:1,projectiles:system,match:{}},PLAYER={radius:.35,height:1.7,stepUp:.25};
 module.installCoolerCollision({THREE,Hit,Actor,Projectiles,G,PLAYER});
 const a=new Actor();Object.assign(a,{alive:true,remote:false,form:'kid',weaponRunner:{},pos:new THREE.Vector3(),vel:new THREE.Vector3(2,0,0),_s3CoolerMovementStart:new THREE.Vector3(-4,0,0),contacts:{wall:false,wallNormal:new THREE.Vector3()}});
 const stands=[{pos:new THREE.Vector3(),expires:20},{pos:new THREE.Vector3(3,0,0),expires:20}];system._s3SupportCoolers=stands;
 return {a,G,system,stands,logs,counts:()=>hits};
}
test('Tacticooler flat sweeps match original motion, Tower updates and reentrant/throwing resolver while reusing private Hit records',()=>{
 const worlds=[coolerWorld(oracle.kernels.cooler),coolerWorld(runtime('support-cooler-collision.mjs'))];
 const traces=[];
 for(const w of worlds){
  const rows=[];for(let i=0;i<120;i++){
   w.a.pos.set((i%20-10)/10,0,(i%5-2)/10);w.a.vel.set(2,0,1);w.a._s3CoolerMovementStart.set(-4,0,0);w.a.contacts.wall=false;
   w.a.form=i%15===0?'squid':'kid';w.a.reenter=i%11===0;w.a.crash=i%19===0;
   if(i===45){w.stands[1].towerLocal=[.2,0,.3];w.G.match.rankedWorld={towerBlock:{center:new THREE.Vector3(1,0,0),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]}};}
   if(i===90)w.stands[0].s3Retired=true;
   let result;try{result=w.a._resolve(false,0,false);}catch(e){assert.match(e.message,/native resolve/);result='throw';}
   rows.push([w.a.pos.toArray(),w.a.vel.toArray(),w.a.contacts.wall,w.a.contacts.wallNormal.toArray(),w.stands[1].pos.toArray(),result]);
  }
  traces.push({rows,logs:w.logs});
 }
 assert.deepEqual(traces[0],traces[1]);
 const [old,now]=worlds;
 for(const w of worlds){w.a.form='kid';w.a.reenter=false;w.a.crash=false;w.a.pos.set(.6,0,0);w.a._s3CoolerMovementStart.set(-4,0,0);w.a._resolve(false,0,false);}
 const before=worlds.map(w=>w.counts());for(let i=0;i<30;i++)for(const w of worlds){w.a.pos.set(.6,0,0);w.a._resolve(false,0,false);}
 assert.equal(old.counts()-before[0],30);assert.equal(now.counts()-before[1],0);
});

test('catalog splash direction is created only for an admitted release, preserving exhaustion, threshold, head-stop and payload order',()=>{
 const source=runtime('main-weapon-catalog.mjs'),current=cut(source,'      if(!p.ghost&&d.splashCount>0','      if(!p.ghost&&s.rollerFlight');
 const run=(kernel,config)=>{
  const rows=[],g={EPS:1e-9,DT:1/60,HZ:60,clamp:(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v)),G:{},catalogSplashRadius,mainInkFootprint:()=>({width:.3}),
   spawnSplashDrop(_g,o){rows.push(['drop',o.from.toArray(),o.direction.toArray(),o.radius,o.salt,o.catchUpSeconds]);return {};},
   floorPaint(_a,from,radius,depth,direction){rows.push(['floor',from.toArray(),radius,depth,direction.toArray()]);}};
  const fn=compile('function advance(p,s,d,travelBefore,len,stop){'+kernel+'}',['advance'],g).advance;
  let clones=0;const vel=new THREE.Vector3(0,0,60);vel.clone=function(){clones++;return new THREE.Vector3().copy(this);};
  const p={ghost:config.ghost,vel,prev:new THREE.Vector3(0,5,0),pos:new THREE.Vector3(0,5,1),life:1,age:1/60,owner:{},team:0,seed:7};
  const s={dropCount:config.used,nextSplash:config.next,travel:1,carry:0,r:{}},d={splashCount:config.count,splashSpacing:.2,splashDropSpec:config.falling?{}:null,depth:1};
  fn(p,s,d,0,1,config.stop);return {rows,state:[s.dropCount,s.nextSplash],clones};
 };
 for(const config of [{used:0,next:2,count:3,stop:Infinity},{used:3,next:0,count:3,stop:Infinity},{used:0,next:1,count:3,stop:1},
  {used:0,next:.2,count:6,stop:Infinity},{used:0,next:.2,count:6,stop:.8},{used:-2,next:0,count:0,stop:Infinity}])for(const falling of [false,true])for(const ghost of [false,true]){
  const a=run(oracle.kernels.splash,{...config,falling,ghost}),b=run(current,{...config,falling,ghost});
  assert.deepEqual(a.rows,b.rows);assert.deepEqual(a.state,b.state);assert.equal(b.clones,b.rows.length?1:0);
 }
});

test('one Booyah growth builds its radius ring once while retaining six terrain projections',()=>{
 const calls=[];
 for(const source of [oracle.kernels.paint,cut(runtime('all-specials.mjs'),'function paintDiskCentres','function paintCross')]){
  let trig=0,probes=0;const math=Object.create(Math);for(const name of ['sin','cos'])math[name]=(...a)=>{trig++;return Math[name](...a);};
  const {paintBooyahGrowth}=compile(source,['paintBooyahGrowth'],{Math:math,MAX_STAMP_RADIUS:3.74,q2:n=>Math.round(n*100)/100,finite:Number.isFinite,seedUnit:()=>.2});
  const rt={api:{THREE,G:{physics:{raycast(){probes++;return null;}},paint:{splat:()=>0}}},up:new THREE.Vector3(0,1,0),down:new THREE.Vector3(0,-1,0),v4:new THREE.Vector3()},object={owner:{team:0},pos:new THREE.Vector3()};
  for(let frame=2;frame<=6;frame++)paintBooyahGrowth(rt,object,frame,13.5,43);
  calls.push({trig,probes});
 }
 assert.deepEqual(calls,[{trig:288,probes:6},{trig:48,probes:6}]);
});
