import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {paintRollerReleaseFootprint} from '../runtime/weapon-edgecases.mjs';
import {installClock,runSimulation} from '../runtime/clock.mjs';
import {sweptWorldHit} from '../runtime/weapons-collision.mjs';

const root=new URL('../../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
function pure(source,names,math=Math){return vm.runInNewContext(source.replace(/export /g,'')+'\n;({'+names+'})',{Math:math});}

test('Dualies geometric integration retains exact slice velocities including changes during collision callbacks',()=>{
  const path='patches/splatoon3/runtime/catalog-dualies-motion.mjs';
  const now=pure(read(path),'integrateCatalogDualies,catalogDualiesPeakSpeed,catalogDualiesIntervalDistance');
  const old={integrateCatalogDualies(actor,dt,isSquid,jumped,radius){
    const motion=actor.weaponRunner.catalogState.roll,active=Math.min(dt,Math.max(0,motion.dur-motion.t));
    const count=Math.max(1,Math.ceil(now.catalogDualiesPeakSpeed(motion)*active/Math.max(.02,radius*.5))),slice=dt/count;
    for(let i=0;i<count;i++){const speed=now.catalogDualiesIntervalDistance(motion,slice,i*slice)/slice;actor.vel.x=motion.direction.x*speed;actor.vel.z=motion.direction.z*speed;actor._integrateMovementStep(slice,isSquid,jumped&&i===0);}
  }};
  for(const kd of [0,.01,.88,.9999999999,1])for(const startup of [0,.01])for(const mutate of [false,true]){
    const outputs=[];
    for(const kernel of [old,now]){
      const motion={kd,startup,dur:.4,t:.05,distance:4,direction:{x:.6,z:.8}},rows=[];
      const actor={weapon:{catalogRecord:{family:'dualies'}},weaponRunner:{catalogState:{roll:motion}},form:'kid',vel:{},_integrateMovementStep(dt,squid,jump){rows.push([dt,this.vel.x,this.vel.z,squid,jump]);if(mutate&&rows.length===1){motion.kd=.72;motion.dur=.5;}}};
      kernel.integrateCatalogDualies(actor,1/30,false,true,.1);outputs.push(rows);
    }
    assert.deepEqual(outputs[1],outputs[0]);
  }
  let logs=0;const math=Object.create(Math);math.log=(...a)=>{logs++;return Math.log(...a);};
  const kernel=pure(read(path),'integrateCatalogDualies',math),motion={kd:.88,startup:0,dur:.4,t:0,distance:4,direction:{x:0,z:1}};
  kernel.integrateCatalogDualies({weapon:{catalogRecord:{family:'dualies'}},weaponRunner:{catalogState:{roll:motion}},form:'kid',vel:{},_integrateMovementStep(){}},1/30,false,false,.05);
  assert.equal(logs,1);
});

test('Splatana ground and air normalizers preserve changes to source retention and duration',()=>{
  const path='patches/splatoon3/runtime/saber-step.mjs',kernels=[pure(read(path),'saberStepSpeed'),pure(read(path),'saberStepSpeed')];
  const steps=kernels.map(()=>({elapsed:0,delay:1,duration:20,param:{MoveStepKd:.87,MoveStepKd_Air:.96,MoveDist:5,MoveDistKd_OnSlideGnd:.6}}));
  for(let i=0;i<30;i++){
    if(i===8)for(const s of steps)s.param.MoveStepKd=.79;
    if(i===13)for(const s of steps)s.duration=24;
    for(const key of Object.keys(steps[0]))if(key.startsWith('_norm'))delete steps[0][key];
    const speeds=kernels.map((k,j)=>k.saberStepSpeed(steps[j],1/120,i%3!==0,i%2===0));assert.equal(speeds[1],speeds[0]);
  }
});

test('paired Slosher liquid spring is Float32-identical to independent source springs',()=>{
  const source=read('inkwave-public/src/game/character-weapons.js'),adapted=adaptBuildSource('src/game/character-weapons.js',source);
  const start=source.indexOf('function sprE('),end=source.indexOf('\nexport function animateWeapon',start);
  const pairStart=adapted.indexOf('function sprELiquidPair('),pairEnd=adapted.indexOf('\nexport function animateWeapon',pairStart);
  const old=vm.runInNewContext(source.slice(start,end)+';sprE'),pair=vm.runInNewContext(adapted.slice(pairStart,pairEnd)+';sprELiquidPair');
  for(let i=0;i<2000;i++){
    const a=new Float32Array(12);for(let j=6;j<10;j++)a[j]=Math.sin(i*1.37+j)*20;
    const b=a.slice(),x=Math.sin(i)*3,z=Math.cos(i)*3,dt=(i%13)/120;
    old(a,6,x,2.2,.16,dt);old(a,8,z,2.2,.16,dt);pair(b,x,z,dt);assert.deepEqual(b,a);
  }
});

test('Roller ground scratch leases survive nested paint and exceptions without retaining levels',()=>{
  const actor={yaw:0,pos:new THREE.Vector3(),team:0,weaponRunner:{}},system={list:[{owner:null,seed:1}]};system.list[0].owner=actor;
  const weapon={kind:'roller',releaseFootPaint:{horizontal:{offset:{x:0,y:0,z:0},maxHeight:4,paintWidthHalf:1}}};
  let allocations=0,nested=false,throws=false;const probes=[];
  class Hit{constructor(){allocations++;this.point=new THREE.Vector3();this.normal=new THREE.Vector3();}}
  const api={Hit,PLAYER:{footRadius:.2},WALKABLE:.5,G:{physics:{groundProbe(_x,_y,_z,_h,_o,_r,hit){probes.push(hit);assert.equal(hit.block,-1);hit.hit=true;hit.y=2;hit.normal.set(0,1,0);hit.__level={};}},paint:{splat(){if(throws)throw Error('paint');if(!nested){nested=true;paintRollerReleaseFootprint(system,actor,weapon,api);nested=false;}return 1;}}}};
  paintRollerReleaseFootprint(system,actor,weapon,api);assert.equal(allocations,2);assert.notEqual(probes[0],probes[1]);
  paintRollerReleaseFootprint(system,actor,weapon,api);assert.equal(allocations,2);assert.equal(probes[0],probes[2]);
  throws=true;assert.throws(()=>paintRollerReleaseFootprint(system,actor,weapon,api),/paint/);throws=false;
  paintRollerReleaseFootprint(system,actor,weapon,api);assert.equal(allocations,2);assert.ok(probes.every(p=>p.__level===null));
});

test('Tower proof metrics refresh after point replacement and coordinate mutation',()=>{
  const path='patches/network-replication/tower-paint-support.mjs',old=pure(read(path),'canonicalPose'),now=pure(read(path),'canonicalPose');
  const stage={id:'s',tower:{path:[[0,0,0],[0,0,10],[10,2,10]]}},snapshot={mode:'tower',stage:'s',revision:1,rule:{progress:.7}},scope={};
  for(let i=0;i<6;i++){
    if(i===2)stage.tower.path[1][2]=7;
    if(i===3)stage.tower.path[2]=[12,3,13];
    if(i===4)stage.tower.path=[[0,0,0],[5,0,1],[9,0,4]];
    const a=old.canonicalPose(stage,snapshot),b=now.canonicalPose(stage,snapshot,scope);assert.equal(JSON.stringify(b),JSON.stringify(a));
  }
});

test('bot gameplay decisions are called at fixed 60Hz independently of render cadence',()=>{
  for(const hz of [30,60,120]){
    let calls=0;const G={time:0,actors:[],projectiles:{update(){}}};installClock({G});
    const bot={update(dt){assert.equal(dt,1/60);calls++;}},match={state:'playing',paused:false,actors:[],updateController(){},update(dt){bot.update(dt);}};
    const game={match,input:{padPressed:new Set(),mouse:{},pollPad(){},endFrame(){}},_padMenus(){},rig:{}};
    for(let i=0;i<2*hz;i++)runSimulation(game,1/hz);assert.equal(calls,120);
  }
  const source=adaptBuildSource('src/main.js',read('inkwave-public/src/main.js'));
  assert.ok(source.includes('runSimulation(this, portraitFrame.released ? 0 : dt)'));
  assert.ok(read('inkwave-public/src/game/match.js').includes('if (live) a.bot.update(dt)'));
});

test('projectile creation scratch preserves nested, removed and reordered members and unwinds errors',()=>{
  const source=read('patches/splatoon3/runtime/weapons.mjs'),start=source.indexOf("  for (const method of ['fireFlick', 'fireSlosh'])"),end=source.indexOf('  const fireDualies =',start);
  const pools=new WeakMap(),a={weaponRunner:{}},w={flickGravity:2,flickDrag:3};
  let nested=false,fail=false;
  class Projectiles{
    fireFlick(){
      if(fail)throw Error('create');
      const old=this.list.shift(),created={};this.list.push(created);if(old)this.list.push(old);
      if(!nested){nested=true;this.fireSlosh(a,w);nested=false;}
      return created;
    }
    fireSlosh(){this.list.unshift({inner:true});}
  }
  new Function('Projectiles','creationSnapshotPools',source.slice(start,end))(Projectiles,pools);
  const ps=new Projectiles(),old={};ps.list=[old];const created=ps.fireFlick(a,w);
  assert.equal(old.s3DamageGroup,undefined);assert.equal(created.grav,2);assert.equal(created.drag,3);
  assert.equal(ps.list[0].s3DamageGroup,created.s3DamageGroup,'outer grouping still includes births from nested dispatch');
  assert.equal(pools.get(ps).length,2);assert.ok(pools.get(ps).every(set=>set.size===0));
  fail=true;assert.throws(()=>ps.fireFlick(a,w),/create/);assert.ok(pools.get(ps).every(set=>set.size===0));
});

test('segment fallback skips unused sphere sweep geometry',()=>{
  const from=new Proxy({},{get(){throw Error('unused fallback geometry');}}),to=from,out={};
  const physics={segment(a,b,result,grates){assert.equal(a,from);assert.equal(b,to);assert.equal(grates,true);return result;}};
  assert.equal(sweptWorldHit(physics,from,to,1,2,out),out);
});

test('Ink Flight reuses only its built-in level miss distance and preserves custom world observation order',()=>{
  const source=adaptBuildSource('src/game/inkFlightRuntime.js',read('inkwave-public/src/game/inkFlightRuntime.js'));
  const start=source.indexOf('      const reuseLength'),end=source.indexOf('      let barrier',start);
  const body=source.slice(start,end)+'return length;';
  for(const level of [null,{}])for(const custom of [false,true])for(const hit of [false,true]){
    let norms=0;const order=[],p={prev:{distanceTo(){norms++;order.push('norm');return 5;}},pos:{},inkProfile:{collision:{field:1}}};
    const builtin=function(){order.push('world');return {hit,dist:hit?2:5};},override=function(){return builtin.call(this);};
    const fn=new Function('G','p','INK_LENGTH_SCALE','sourceLengthWorld',body),owner={world:custom?override:builtin};
    assert.equal(fn.call(owner,{physics:{level}},p,1,builtin),5);
    assert.equal(norms,level&&!custom&&!hit?0:1);
    if(custom||!level)assert.deepEqual(order,['norm','world']);
  }
});
