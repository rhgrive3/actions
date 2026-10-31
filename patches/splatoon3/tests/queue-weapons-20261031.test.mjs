import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptQueueWeapons20261031 } from '../../local-quality/queue-weapons-20261031-adapter.mjs';

const root=new URL('../runtime/',import.meta.url);
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-weapons-20261031-before.json',import.meta.url),'utf8'));
const read=name=>fs.readFileSync(new URL(name+'.mjs',root),'utf8');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)+start.length));
async function sourceModule(name,old=false,extra='') {
  const file=new URL(name+'.mjs',root);
  const source=(old?before[name]:read(name)).replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,file).href));
  return import('data:text/javascript;base64,'+Buffer.from(source+'\n'+extra).toString('base64'));
}
function geometry(n=12) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  g.setAttribute('lineDistance',new THREE.BufferAttribute(new Float32Array(n),1));return g;
}
function geometryState(g) { return {p:Array.from(g.attributes.position.array),d:Array.from(g.attributes.lineDistance.array),draw:{...g.drawRange},pr:g.attributes.position.updateRanges,dr:g.attributes.lineDistance.updateRanges}; }

test('actual polyline sampler keeps all vertices, ties, endpoint distances and update ranges',async()=>{
  const extra='export {polylineIndices,writePolyline};',a=await sourceModule('throw-prediction',true,extra),b=await sourceModule('throw-prediction',false,extra);
  let cases=0;
  for(const count of [0,1,2,3,7,20,63,127])for(const budget of [0,1,2,3,7,16,80])for(const shape of [0,1,2,3]) {
    const points=Array.from({length:count},(_,i)=>new THREE.Vector3(shape===3?0:i/3,shape===0?0:Math.sin(i*.83)*3,shape===2?i%3:0));
    assert.deepEqual(b.polylineIndices(points,budget),a.polylineIndices(points,budget));
    const x=geometry(budget),y=geometry(budget),end=count?new THREE.Vector3(-3,4,7):null;
    // The existing private sampler's budget=0 result is intentionally retained.
    if(count||budget) {assert.equal(b.writePolyline(y,points,end),a.writePolyline(x,points,end));assert.deepEqual(geometryState(y),geometryState(x));}
    cases++;
  }
  console.log(JSON.stringify({polylineComparisons:cases}));
});

test('polyline workspaces reuse numeric records and separate reentry/exception leases',async()=>{
  const m=await sourceModule('throw-prediction',false,'export {writePolyline,polylineWorkspaces};'),g=geometry(7);
  const points=Array.from({length:30},(_,i)=>new THREE.Vector3(i,Math.sin(i),i%5));
  m.writePolyline(g,points,null);const leases=m.polylineWorkspaces.get(g),frame=leases.frames[0],records=frame.records.slice();
  for(let i=0;i<20;i++)m.writePolyline(g,points,null);
  assert.deepEqual(frame.records,records);assert.equal(leases.frames.length,1);assert.equal(frame.indices.length,0);
  const set=g.attributes.position.setXYZ;let nested=false;
  g.attributes.position.setXYZ=function(...args){if(!nested){nested=true;m.writePolyline(g,points,null);}return set.apply(this,args);};
  m.writePolyline(g,points,null);assert.equal(leases.frames.length,2);assert.equal(leases.depth,0);
  assert.notEqual(leases.frames[0].records[0],leases.frames[1].records[0]);
  g.attributes.position.setXYZ=()=>{throw Error('buffer callback');};
  assert.throws(()=>m.writePolyline(g,points,null),/buffer callback/);assert.equal(leases.depth,0);
  for(const f of leases.frames){assert.equal(f.indices.length,0);assert.equal(f.segments.length,0);for(const record of f.records)assert.ok(Object.values(record).every(v=>typeof v==='number'));}
  g.attributes.position.setXYZ=set;m.writePolyline(g,points,null);assert.equal(leases.frames.length,2);
});

function vfxFixture(source) {
  const start=source.indexOf('class Director {'),end=source.indexOf('\n}\n',start)+2;
  const strikeStart=source.indexOf('  strike: {'),strikeEnd=source.indexOf('\n  decoy:',strikeStart);
  const constants=source.includes('const STRIKE_NATIVE_DROP')?source.slice(source.indexOf('const STRIKE_NATIVE_DROP'),source.indexOf('const OBJECT_FX')):'';
  let word=71,calls=0;const random=()=>{calls++;return ((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);};
  const rnd=(a=1,b=0)=>b+random()*(a-b),rows=[];
  const exports=new Function('rnd','vfxRandom','TAU','PUFF','releaseFistModel',source.slice(start,end)+'\n'+constants+'\nreturn {Director,frame:({'+source.slice(strikeStart,strikeEnd)+'}).strike.frame};')(rnd,random,Math.PI*2,{CHUNK:2,MIST:3},()=>{});
  const d=Object.create(exports.Director.prototype);d.v=[new THREE.Vector3()];
  d.kit={puffs:{spawnRaw(...args){rows.push(args);}},clear(){}};
  return {...exports,d,rows,calls:()=>calls};
}
test('clear releases all six strong seen workspaces without replacing their identities',()=>{
  for(const old of [true,false]) {
    const {d}=vfxFixture(old?before['special-vfx']:read('special-vfx')),keys=['seenRounds','seenObjects','_kitSeen','_kitSeenC','_kitSeenF','_kitSeenS'];
    for(const key of ['tracks','rounds','objects','lasers','domes','coolers','fists','storms'])d[key]=new Map();
    const held=keys.map(k=>d[k]=new Set([{}]));d._frameRounds=[{}];d.clear();
    for(let i=0;i<keys.length;i++){assert.equal(d[keys[i]],held[i]);assert.equal(held[i].size,old?1:0);}
    assert.equal(d._frameRounds.length,0);
  }
});
test('strike recipes preserve every native scalar and RNG call; custom callbacks keep fresh writable options',()=>{
  for(const hz of [30,60,120]) {
    const a=vfxFixture(before['special-vfx']),b=vfxFixture(read('special-vfx'));
    for(const f of [a,b]){const r={color:[.9,.3,.1]},o={pos:new THREE.Vector3(1,2,3),currentRadius:7.7};for(let i=0;i<hz;i++)f.frame.call(f.d,r,o,1/hz);}
    assert.deepEqual(b.rows,a.rows);assert.equal(b.calls(),a.calls());assert.ok(b.rows.length>80);
    const {d,frame}=b,options=[];d.drop=(...args)=>{const o=args.at(-1);options.push(o);o.extension=true;};d.puff=d.drop;
    frame.call(d,{color:[1,0,0]},{pos:new THREE.Vector3(),currentRadius:2},.15);
    assert.equal(new Set(options).size,options.length);assert.ok(options.every(o=>o.extension&&!Object.isFrozen(o)));
  }
});

test('native projectile cause scope preserves nested receivers, argument identity, return and exception restoration',async()=>{
  const modules=[await sourceModule('sub-resistance',true),await sourceModule('sub-resistance')];
  function run(m,throws,prior){
    const rows=[],owner={weapon:{id:'native',catalogRecord:{sourceRow:'Shooter_Normal_00',family:'shooter'}}};if(prior!==undefined)owner._s3AllSpecialDamageCause=prior;
    const p={owner,wid:'native'},nested={owner,wid:'native',catalog:{r:{sourceRow:'Roller_Normal_00',family:'roller'},descriptor:{}},type:'roller'};
    class NetMatch{sendHit(){} _hit(){}}
    const token={};class Projectiles{_step(projectile,dt,extra){rows.push([projectile===p?'outer':'inner',dt,extra===token,this===world,owner._s3AllSpecialDamageCause]);if(projectile===p){world._step(nested,.2,token);rows.push(['resumed',owner._s3AllSpecialDamageCause]);if(throws)throw Error('native');}return 19;}}
    m.installObjectDamageCause({NetMatch,Projectiles});const world=new Projectiles();let result,error;
    try{result=world._step(p,.1,token);}catch(e){error=e.message;}
    return {rows,result,error,has:Object.hasOwn(owner,'_s3AllSpecialDamageCause'),value:owner._s3AllSpecialDamageCause};
  }
  for(const throws of [false,true])for(const prior of [undefined,null,'outer-scope'])assert.deepEqual(run(modules[1],throws,prior),run(modules[0],throws,prior));
});

test('sub guide cache hits skip trace preparation while preserving sampled motion and geometry',async()=>{
  const modules=[await sourceModule('sub-trajectory-preview',true),await sourceModule('sub-trajectory-preview')];
  function run(m,defer){
    const api={THREE,G:{time:0,physics:{}},Hit:class{constructor(){this.point=new THREE.Vector3();this.normal=new THREE.Vector3();}}};
    const actor={pos:new THREE.Vector3(1,2,3),weapon:{sub:'burst'},color:new THREE.Color(1,.2,.1),ink:100};
    const system={arcN:12,arcGeo:geometry(12),arcLine:{visible:false,material:{color:new THREE.Color()}},arcRing:new THREE.Object3D()};system.arcRing.material={color:new THREE.Color()};
    let samples=0,traces=0;
    const prepare=(s,traceOnly=false)=>{if(!traceOnly){samples++;s.p.copy(actor.pos);s.vel.set(2,3,4);s.frames=8;s.inkCost=40;if(defer)return;}
      traces++;s.advance=(s,dt)=>s.p.addScaledVector(s.vel,dt);s.contactAt=s=>s.age>=.1;};
    const rows=[];for(const time of [0,.01,.02,.034,.04,.05,.068]){api.G.time=time;actor.pos.x+=.01;m.drawSubTrajectory(api,system,actor,prepare,defer);rows.push({geometry:geometryState(system.arcGeo),ring:system.arcRing.position.toArray(),visible:system.arcRing.visible});}
    return {rows,samples,traces,system,api,actor};
  }
  const a=run(modules[0],false),b=run(modules[1],true);assert.deepEqual(b.rows,a.rows);assert.equal(b.samples,a.samples);assert.equal(a.traces,7);assert.equal(b.traces,3);
  assert.equal(b.system._s3SubArcScratch.depth,0);for(const frame of b.system._s3SubArcScratch.frames)assert.equal(frame.contactAt,null);
  b.api.G.time=1;assert.throws(()=>modules[1].drawSubTrajectory(b.api,b.system,b.actor,()=>{throw Error('prepare');},true),/prepare/);assert.equal(b.system._s3SubArcScratch.depth,0);
});

test('Slosher actual released drops retain scalar/vector fields across repeated option leases',async()=>{
  const mods=[await sourceModule('slosher-intermediate-paint',true),await sourceModule('slosher-intermediate-paint')];
  function run(m){
    class Projectiles{_step(){return false;}_new(){return {};}}
    const system=new Projectiles(),G={projectiles:system};m.installSlosherIntermediatePaint({Projectiles,G,THREE});
    const unit={SplashAndSplashWallHitSpawnPrm:{Combination:[{OrderNum:0,SplashArrayOrderNum:0,TotalNum:3}],SplashParam:[{SpawnParam:{FirstSplashRateForLengthMin:.5,FirstSplashRateForLengthMax:.8,SpawnBetweenLength:2,SpawnNum:3},DrawSizeCollisionPaintParam:{PaintWidthHalf:.6,PaintDepthScale:1.8,DrawRadius:.2,CollisionParam:{EndRadiusForPlayer:0}}}]}};
    const owner={remote:false};for(let i=0;i<50;i++){const p={type:'slosh',owner,team:i%2,seed:i/50,fidelitySloshUnit:unit,fidelitySloshIndex:0,vel:new THREE.Vector3(3,-2,5)};system.s3PaintSlosherSegment(p,new THREE.Vector3(0,4,0),new THREE.Vector3(0,4,4));}
    return system._s3SplashDrops.map(d=>({team:d.team,seed:d.seed,pos:d.pos.toArray(),vel:d.vel.toArray(),radius:d.radius,drawRadius:d.drawRadius,spec:d.spec,depth:d.depth,kind:d.kind,sourceActor:d.sourceActor}));
  }
  assert.deepEqual(run(mods[1]),run(mods[0]));
});

test('native Slosher idle/windup/release preserves exact fields, fractional deadlines and signed-zero turns',()=>{
  const source=read('weapons'),next=between(source,'  const releaseNativeSlosh','  installRollerLogic');
  function run(code,hz,yaw,prior,held,slosh,cooldown){
    const events=[],G={projectiles:{fireSlosh(a,w){events.push(['shot',a.ink,w.id]);}},audio:{play(...v){events.push(v);}}};
    class WeaponRunner{}new Function('WeaponRunner','G',code)(WeaponRunner,G);
    const a={aimDir:new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),aimYaw:yaw,ink:100,lastFire:7,character:{trigger(...v){events.push(v);}},isLocal:true};
    const r=new WeaponRunner();Object.assign(r,{a,slosh,cooldown,s3SloshPrevYaw:prior,s3SloshRecovery:true,_empty(){events.push('empty');}});
    const w={id:'slosher',windup:.2,fireInterval:.5,inkPerShot:10,postShotLock:.05,postShotDelay:.3};
    for(let i=0;i<Math.ceil(hz*.8);i++){r.cooldown-=1/hz;r._slosher(1/hz,{fire:held},w);}
    const fields={};for(const [k,v]of Object.entries(r))if(typeof v!=='object'&&typeof v!=='function')fields[k]=v;
    return {fields,events,ink:a.ink,lastFire:a.lastFire};
  }
  let count=0;for(const hz of [30,60,120])for(const yaw of [-Math.PI,-.2,-0,0,.3,Math.PI])for(const prior of [null,-0,0,.3])for(const held of [false,true])for(const slosh of [-1,0,.199999999999])for(const cooldown of [-.2,0,.3]){assert.deepEqual(run(next,hz,yaw,prior,held,slosh,cooldown),run(before.nativeSlosher,hz,yaw,prior,held,slosh,cooldown));count++;}
  console.log(JSON.stringify({nativeSlosherSequences:count}));
});

test('all three exact _new wrappers preserve this, arbitrary arguments, pool cleanup, return and throws',()=>{
  for(const name of ['weapons','weapons-fidelity','main-weapon-catalog']){
    const source=read(name),start=source.search(/(?:Projectiles\.prototype|P)\._new\s*=\s*function/);
    const end=source.indexOf('};',start)+2,next=source.slice(start,end);
    function run(code,argc,throws){
      const log=[],pool=[{}],world={pool},record={},args=[undefined,{identity:true},0,NaN,'extra'].slice(0,argc);
      const fresh=function(){log.push([this===world,Array.from(arguments)]);if(throws)throw Error('birth');return record;};
      const Projectiles={prototype:world},P=world;new Function('Projectiles','P','fresh','newProjectile','kitTrizookaClearPooled',code)(Projectiles,P,fresh,fresh,p=>log.push(['clear',p===record]));
      let value,error;try{value=world._new(...args);}catch(e){error=e.message;}
      return {log,record,returned:value===record,error,length:world._new.length};
    }
    for(const argc of [0,1,3,5])for(const throws of [false,true])assert.deepEqual(run(next,argc,throws),run(before['newWrapper-'+name],argc,throws));
  }
});

test('legacy flick source adapter keeps every projectile and event scalar plus exact RNG consumption',()=>{
  const original=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
  const adapted=adaptQueueWeapons20261031('src/game/weapons.js',original),next=between(adapted,'  fireFlick(a, w) {','\n  fireCharger(');
  assert.equal(adaptQueueWeapons20261031('elsewhere',original),original);
  function run(method,pitch,yaw,drops){
    let word=13,calls=0;const math=Object.create(Math);math.random=()=>{calls++;return ((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);};
    const events=[],shots=[],ctx={_new:()=>({pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3()}),_push:p=>shots.push({...p,owner:undefined,pos:p.pos.toArray(),prev:p.prev.toArray(),start:p.start.toArray(),vel:p.vel.toArray()})};
    const f=new Function('Math','THREE','_v','clamp','DEG','emit','rumble','return ({'+method+'}).fireFlick;')(math,THREE,new THREE.Vector3(),(x,a,b)=>Math.max(a,Math.min(b,x)),Math.PI/180,(kind,e)=>events.push([kind,e.dir?.toArray(),e.muzzle?.toArray(),e.weapon,e.amount]),()=>{});
    f.call(ctx,{pos:new THREE.Vector3(1,2,3),yaw,aimPitch:pitch,team:0,isLocal:true},{id:'roller',flickDrops:drops,flickSpreadDeg:70,flickSpeed:20,flickDamageNear:100,flickDamageFar:40});return {shots,events,calls};
  }
  for(const pitch of [-4,-.2,-0,0,.5,8,NaN,Infinity])for(const yaw of [-6,-0,.8,12])for(const drops of [0,1,9,24])assert.deepEqual(run(next,pitch,yaw,drops),run(before.legacyFlick,pitch,yaw,drops));
});

test('support finitePoint removes the triplet while retaining eager coordinate getter order and falsy results',()=>{
  const next=between(read('bot-special-support'),'const finitePoint','\nconst flatDistance');
  const functions=[before.finitePoint,next].map(code=>new Function(code+';return finitePoint;')());
  for(const x of [-0,0,NaN,Infinity,-Infinity,3,undefined]){
    function run(f){const reads=[],p={};for(const [k,value]of [['x',x],['y',2],['z',3]])Object.defineProperty(p,k,{get(){reads.push(k);return value;}});return {value:f(p),reads};}
    assert.deepEqual(run(functions[1]),run(functions[0]));
  }
  for(const p of [null,undefined,false,0,''])assert.equal(functions[1](p),functions[0](p));
});

test('owned target vectors reuse the exact norm and retain target order at cone/range boundaries',()=>{
  const next=between(read('all-specials'),'function selectTargets(','function prepareMissiles');
  const functions=[before.selectTargets,next].map(code=>new Function('aimDirection','actorStates','gearCurve',code+';return selectTargets;')((rt,a,out)=>out.set(0,0,1),new WeakMap(),()=>140));
  let comparisons=0;
  for(const range of [.1,1,32,Infinity,NaN])for(const scale of [.099999,.1,1,31.999,32,32.001,Infinity,NaN]){
    function run(f){let lengths=0;const actor={pos:new THREE.Vector3(),team:0},targets=Array.from({length:25},(_,i)=>({id:i,alive:i%5!==0,team:i%3===0?0:1,pos:new THREE.Vector3((i-12)*.03*scale,0,scale)}));
      const v=new THREE.Vector3(),original=v.length;v.length=function(){lengths++;return original.call(this);};
      const result=f({api:{G:{actors:targets}},v0:new THREE.Vector3(),v1:v},actor,5,range);return {ids:result.map(t=>t.id),lengths};}
    const a=run(functions[0]),b=run(functions[1]);assert.deepEqual(b.ids,a.ids);assert.ok(b.lengths<=a.lengths);comparisons++;
  }
  console.log(JSON.stringify({targetBoundaryComparisons:comparisons}));
});

test('damage-band height prefilter preserves hits/LOS order and skips distance only outside the vertical band',()=>{
  const next=between(read('all-specials'),'function damageBandRadius(','// 11.3.0 WeaponSpCastle');
  function run(code,height,radius){
    const hits=[],los=[];let distances=0;const actor={team:0},victims=Array.from({length:61},(_,i)=>({alive:true,team:1,id:i,pos:new THREE.Vector3(i/4-7.5,(i%7-3)*2,1)}));
    const point=new THREE.Vector3(),native=point.distanceTo;point.distanceTo=function(c){distances++;return native.call(this,c);};
    const f=new Function('specialObjectRadius',code+';return damageBandRadius;')(()=>{});
    const count=f({api:{G:{actors:victims,projectiles:{applyHit(a,v,n,s){hits.push([v.id,n,s]);}},physics:{los(a,b){los.push(b.toArray());return true;}}}},v6:point},actor,new THREE.Vector3(),[[2,100],[5,40],[20,10]],radius,'test',null,height);
    return {hits,los,count,distances};
  }
  for(const height of [-1,0,.75,2.8,5,Infinity,NaN])for(const radius of [-1,0,2,5,Infinity,NaN]){const a=run(before.damageBandRadius,height,radius),b=run(next,height,radius);assert.deepEqual({hits:b.hits,los:b.los,count:b.count},{hits:a.hits,los:a.los,count:a.count});assert.ok(b.distances<=a.distances);}
});

test('native Dualies turret guard preserves every scalar decision and omits locked movement hypot',()=>{
  const next=read('weapons').split('\n').find(l=>l.includes('if (this.s3Turret && (!inp.fire'));
  function run(line,lockT,x,z,fire,sub,form,ink){let calls=0;const math=Object.create(Math);math.hypot=(...v)=>{calls++;return Math.hypot(...v);};const r={s3Turret:true,lockT,a:{intent:{move:{x,z}},form,ink}};new Function('Math','inp','w',line).call(r,math,{fire,sub},{inkPerShot:1});return {turret:r.s3Turret,calls};}
  for(const lockT of [-1,-0,0,.1,NaN,Infinity])for(const x of [-2,0,.01,.010001,NaN])for(const z of [0,.02,Infinity])for(const fire of [false,true])for(const sub of [false,true])for(const form of ['kid','squid'])for(const ink of [0,1,100]){const a=run(before.dualiesTurretGuard,lockT,x,z,fire,sub,form,ink),b=run(next,lockT,x,z,fire,sub,form,ink);assert.equal(b.turret,a.turret);assert.ok(b.calls<=a.calls);if(lockT>0)assert.equal(b.calls,0);}
});

test('catalogue rod opt-in preserves visual records; generic caller retains dynamic draw reads',()=>{
  const old=between(before['projectile-presentation'],'export function catalogVisualSpec(','const radiusCache'),next=between(read('projectile-presentation'),'export function catalogVisualSpec(','const radiusCache');
  const make=code=>new Function('sharedBucketDraw','sharedBucketDrawIndex','SOURCE_DRAW_1130','finite','clamp',code.replace('export function','function')+';return catalogVisualSpec;')(()=>null,()=>0,{},(v,f)=>Number.isFinite(v)?v:f,(x,a,b)=>Math.max(a,Math.min(b,x)));
  const a=make(old),b=make(next);for(const family of ['shooter','dualies','splatling','charger'])for(const radius of [undefined,NaN,-1,0,.125,.2,.9,Infinity])for(const index of [0,1,8])assert.deepEqual(b({family,sourceActor:'owned'},{b:{},c:{EndRadiusForPlayer:radius}},index,true),a({family,sourceActor:'owned'},{b:{},c:{EndRadiusForPlayer:radius}},index));
  function dynamic(f){const reads=[],record={family:'shooter',get sourceActor(){reads.push('source');return 'custom';}},d={b:{get DrawSizeParam(){reads.push('draw');return null;}},c:{EndRadiusForPlayer:.2}};return {result:f(record,d),reads};}
  assert.deepEqual(dynamic(b),dynamic(a));
});

test('Blaster distance splash option leases preserve actual queued drops, reentry and exception cleanup',async()=>{
  const a=await sourceModule('blaster-flight-paint',true),b=await sourceModule('blaster-flight-paint',false,'export {distanceSplashOptions};');
  function run(m,nested=false,throwing=false){
    const game={paint:{},physics:{},projectiles:{}},spec={count:4,first:.5,spacing:.7,nearestWidth:.2,width:.3,nearestIsFeet:false,gravity:12,drag:.02,randomVelocity:null};
    const state={last:new THREE.Vector3(0,4,0),sample:new THREE.Vector3(),direction:new THREE.Vector3(),spec,distance:0,index:0,wallSplash:null},p={owner:{remote:false},team:0,pos:new THREE.Vector3(0,4,5),seed:.3};m.ownDistanceFlightState(state);
    let once=false;if(nested||throwing)Object.defineProperty(p,'seed',{get(){if(!once){once=true;if(throwing)throw Error('seed');m.paintDistanceFlight(game,p,state,new THREE.Vector3(0,4,2));}return .3;}});
    let result,error;try{result=m.paintDistanceFlight(game,p,state);}catch(e){error=e.message;}
    if(m.distanceSplashOptions){const lease=m.distanceSplashOptions.get(state);assert.equal(lease.depth,0);for(const frame of lease.frames)for(const k of ['owner','from','direction','spec','footprint'])assert.equal(frame[k],null);}
    return {result,error,index:state.index,distance:state.distance,last:state.last.toArray(),drops:(game.projectiles._s3SplashDrops||[]).map(d=>({seed:d.seed,radius:d.radius,pos:d.pos.toArray(),vel:d.vel.toArray(),kind:d.kind,releaseX:d.releaseX,releaseZ:d.releaseZ}))};
  }
  for(const nested of [false,true])for(const throwing of [false,true])assert.deepEqual(run(b,nested,throwing),run(a,nested,throwing));
});

test('Roller release footprint reuses equal yaw trig and preserves four changing accessor samples',()=>{
  const next=between(read('weapon-edgecases'),'const footPaintFrames=','export function installWeaponEdgecases');
  const functions=[before.rollerFootprint,next].map(code=>new Function('SOURCE_SPLASH_PAINT_KIND','mainInkFootprint',code.replace('export function','function')+';return paintRollerReleaseFootprint;')('source',()=>null));
  function run(f,yaws){let reads=0;const events=[],a={pos:new THREE.Vector3(1,2,3),team:0,alive:true,addTurf:n=>events.push(['turf',n])};Object.defineProperty(a,'yaw',{get(){return yaws[Math.min(reads++,yaws.length-1)];}});
    const system={list:[{owner:a,seed:.7}]},w={kind:'roller',releaseFootPaint:{horizontal:{offset:{x:.3,y:.4,z:.7},maxHeight:3,paintWidthHalf:.8}}};
    class Hit{constructor(){this.point=new THREE.Vector3();this.normal=new THREE.Vector3();}}
    const G={physics:{groundProbe(x,y,z,h,o,r,out){events.push(['probe',x,y,z,h,o,r]);out.hit=true;out.y=1;out.normal.set(0,1,0);}},paint:{splat(p,r,t,o){events.push(['paint',p.toArray(),r,t,o.stretch.toArray(),o.seed]);return 2;}}};
    const result=f(system,a,w,{G,PLAYER:{footRadius:.3},Hit,WALKABLE:.5});return {events,reads,result};
  }
  for(const yaws of [[0],[-0],[.3],[7],[NaN],[Infinity],[.1,.2,.3,.4],[-0,0,-0,0],[NaN,.1,NaN,.2]])assert.deepEqual(run(functions[1],yaws),run(functions[0],yaws));
});

test('Boss crablet shortcut proves object identity and falls back for mismatched IDs and custom collections',()=>{
  const next=between(read('bot-special-context'),'function bossEnemy','// The internal inactive');
  const functions=[before.bossEnemy,next].map(code=>new Function('finitePoint',code+';return bossEnemy;')(p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
  for(const mode of ['native','wrong-key','same-id-replaced','id-getter','custom','dead']){
    function run(f){const crab={id:'a',x:1,y:2,z:3,dead:mode==='dead'},target={crab,los:true},crabs=new Map([[mode==='wrong-key'?'b':'a',mode==='same-id-replaced'?{...crab}:crab]]);let reads=0;if(mode==='id-getter')Object.defineProperty(crab,'id',{get(){reads++;return 'a';}});const collection=mode==='custom'?{values:()=>crabs.values()}:crabs;const result=f({team:0},target,{bTgt:target},{boss:{crabs:collection}});return {accepted:!!result,pos:result?.pos,reads};}
    assert.deepEqual(run(functions[1]),run(functions[0]));
  }
});

test('Clam goal allocation deferral preserves exact goal sampling, boundary scoring and early rejects',async()=>{
  const m=await sourceModule('ranked/clams',false,'export {validTeam,sub,scale,add,clamp,EPS};');
  const old=new Function('validTeam','sub','scale','add','clamp','EPS','CLAM_BARRIER_BREAK_SECONDS','return ({'+before.clamsTryGoal+'})._tryGoal;')(m.validTeam,m.sub,m.scale,m.add,m.clamp,m.EPS,m.CLAM_BARRIER_BREAK_SECONDS);
  function run(f,x,y,radius,barrier){const reads=[],events=[],clam={id:'c',kind:'power',team:0},goal=[0,0,0];for(let i=0;i<3;i++)Object.defineProperty(goal,i,{get(){reads.push(i);return 0;}});
    const rule=Object.create(m.ClamsRule.prototype);rule.stage={clams:{goalRadius:radius}};rule.state={actorTeams:{},clams:[clam],nextBreakSequence:0,baskets:[{goal,barrierOpen:barrier,tucked:false,cooldown:0},{}]};rule._event=(...a)=>events.push(a);rule._reflect=()=>events.push('reflect');rule._score=(...a)=>events.push(['score',...a]);
    const result=f.call(rule,clam,[x,y,-1],[x,y,1],{});return {result,events,reads,clams:rule.state.clams.length,basket:JSON.parse(JSON.stringify(rule.state.baskets[0]))};}
  for(const x of [-100,0,.95,.95000001,2,NaN])for(const y of [-2,0,.55,2.1,Infinity])for(const radius of [-1,0,.95,101,NaN])for(const barrier of [false,true])assert.deepEqual(run(m.ClamsRule.prototype._tryGoal,x,y,radius,barrier),run(old,x,y,radius,barrier));
});

test('sub AoE target predicate preserves phase/id getter order and Torpedo fallback without literal arrays',()=>{
  const prior=before.subAoEPredicate;
  const next=between(read('all-subs'),'function isSubObjectBlastTarget','function subObjectBlastPoint');
  function run(code,phase,id){const reads=[],target={get phase(){reads.push('phase');return phase;},get subId(){reads.push('id');return id;}};const f=new Function('targetableTorpedo',code+';return isSubObjectBlastTarget;')(t=>{reads.push('torpedo');return t.subId==='torpedo';});return {value:f(target),reads};}
  for(const phase of ['flight','deployed',null])for(const id of ['splashWall','sprinkler','beakon','torpedo','bomb',undefined])assert.deepEqual(run(next,phase,id),run(prior,phase,id));
});
