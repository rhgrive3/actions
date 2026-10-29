import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import * as ink from '../../../inkwave-public/src/game/inkFlight.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptRemainingInkFlight20261026} from '../../local-quality/queue-remaining-inkflight-20261026-adapter.mjs';
import {seededSplashUnit,spawnSplashDrop} from '../runtime/blaster-flight-paint.mjs';
import {mainInkFootprint} from '../runtime/main-ink-footprints.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {catalogSplashRadius} from '../runtime/catalog-splash-paint.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-inkflight-before-20261026.json',import.meta.url),'utf8'));
const rel='src/game/inkFlightRuntime.js';
const composed=adaptRemainingInkFlight20261026(rel,adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8')));
const cls=parse(composed,{sourceType:'module',ecmaVersion:'latest'}).body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='InkFlightRuntime').declaration;
const methods=Object.fromEntries(cls.body.body.filter(n=>n.key.name in before.inkMethods).map(n=>[n.key.name,composed.slice(n.start,n.end)]));
const splashSource=fs.readFileSync(new URL('../runtime/blaster-flight-paint.mjs',import.meta.url),'utf8');
const catalogSource=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
function functionSource(source,name){const ast=parse(source,{sourceType:'module',ecmaVersion:'latest'});for(const n of ast.body){const d=n.declaration||n;if(d.type==='FunctionDeclaration'&&d.id.name===name)return source.slice(d.start,d.end);}throw Error(name);}
function evalFn(code,env){return vm.runInNewContext('('+code+')',env);}
function rng(seed){let n=seed;return()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);}
function runtime(rows){
  const count={hypot:0,rotation:0,length:0};
  class Vector3 extends THREE.Vector3{length(){count.length++;return super.length();}}
  class Quaternion extends THREE.Quaternion{setFromUnitVectors(a,b){count.rotation++;return super.setFromUnitVectors(a,b);}}
  const math=Object.create(Math);math.hypot=(...a)=>{count.hypot++;return Math.hypot(...a);};
  const env={...ink,EPS:1e-9,THREE:{...THREE,Vector3,Quaternion},Z:new THREE.Vector3(0,0,1),Math:math,PLAYER:{waterY:-200},G:{},emit(){},Hit:class{constructor(){this.point=new THREE.Vector3();this.normal=new THREE.Vector3();}}};
  const Runtime=vm.runInNewContext('(()=>{class InkFlightRuntime{'+Object.values(rows).join('\n')+'};const sourceHeadingSpawnDrop=InkFlightRuntime.prototype.spawnDrop;return InkFlightRuntime;})()',env);
  const r=new Runtime({});r.world=()=>({hit:false});return{r,count};
}
function head(i,count=5){return {pos:new THREE.Vector3(3,7,10),prev:new THREE.Vector3(-1,6,-2),vel:new THREE.Vector3(i-4,.8,17-i),inkPlan:{count,first:.2,spacing:1.2,feet:i%2===0},inkTravel:0,inkSpawned:0,inkBirth:0,inkProfile:ink.INK_PROFILES.shooter,seed:(i%100)/101,owner:{color:new THREE.Color(.8,.1,.3)},team:i%2,ghost:i%3===0,inkKey:'shooter',inkSequence:i,s3Weapon:{kind:'shooter'}};}
function dropSnapshot(r){return Array.from(r.drops,p=>({pos:p.pos.toArray(),prev:p.prev.toArray(),vel:p.vel.toArray(),heading:p.heading.toArray(),feet:p.feet,seed:p.seed,birth:p.birth,age:p.age,frame:p.frame,startY:p.startY,team:p.team,ghost:p.ghost,inkKey:p.inkKey}));}

test('composed InkFlight segment sharing preserves exact births and retains trace/override mutation paths',()=>{
  const velocities=[[0,0],[-0,0],[1e-12,-1e-12],[Infinity,1],[NaN,3],[-3,-Infinity],[1e200,1e200]];
  for(let i=0;i<100;i++)for(const mode of ['plain','trace','override']){
    const run=rows=>{const {r,count}=runtime(rows),p=head(i,i%12),events=[];
      if(i<velocities.length){p.vel.x=velocities[i][0];p.vel.z=velocities[i][1];}
      if(mode==='trace')r.trace=e=>{events.push({...e,pos:Array.from(e.pos)});p.vel.x+=.25;p.vel.z-=.5;};
      if(mode==='override'){const spawn=r.spawnDrop;r.spawnDrop=function(...args){spawn.apply(this,args);p.vel.x-=.3;p.vel.z+=.2;};}
      r.emitAlong(p,12,i%2?1:.8,.2,i%4===0);
      return {drops:dropSnapshot(r),events,spawned:p.inkSpawned,hypot:count.hypot};};
    const a=run(before.inkMethods),b=run(methods);assert.deepEqual(b.drops,a.drops);assert.deepEqual(b.events,a.events);assert.equal(b.spawned,a.spawned);
    assert.equal(b.hypot,mode==='plain'?Math.min(1,a.hypot):a.hypot);
  }
  for(const rows of [before.inkMethods,methods]){const {r,count}=runtime(rows),p=head(9);r.spawnDrop(p,p.pos,1,.3);assert.equal(count.hypot,1);}
});

function drawSnapshot(r,capacity=100){const matrices=[],colors=[],shapes=new Float32Array(capacity*4);const count=r.draw({setMatrixAt(i,m){matrices[i]=Array.from(new Float32Array(m.elements));},setColorAt(i,c){colors[i]=Array.from(new Float32Array(c.toArray()));}},shapes,0,capacity);return{count,matrices,colors,shapes:Array.from(shapes),normal:r.normal.toArray()};}
test('actual Three.js drop orientation reuse preserves 30/60/120 Hz matrices, live shapes and pooled lifetimes',()=>{
  for(const hz of [30,60,120]){
    const a=runtime(before.inkMethods),b=runtime(methods);let ticks=0;
    for(let frame=0;frame<90;frame++){
      const next=Math.floor(frame*60/hz);
      for(;ticks<=next;ticks++)for(const {r} of [a,b]){if(ticks%7===0){const h=head(ticks);r.spawnDrop(h,h.pos,0,ticks/60);}r.time=ticks/60;r.updateDrops();}
      for(const {r} of [a,b])for(const p of r.drops){p.pos.x+=.001;p.age+=.0001;p.owner.color.setRGB(frame/100,.2,.3);}
      assert.deepEqual(drawSnapshot(b.r,frame%9===0?0:100),drawSnapshot(a.r,frame%9===0?0:100));
    }
    assert.ok(b.count.rotation<=a.count.rotation);if(hz===120)assert.ok(b.count.rotation<a.count.rotation*.7);
  }
  const a=runtime(before.inkMethods),b=runtime(methods);
  for(const {r} of [a,b]){const p=head(2);r.spawnDrop(p,p.pos,0,0);}
  for(const vector of [[0,0,0],[-0,0,0],[0,-1,0],[0,0,-1],[NaN,0,1],[Infinity,1,1]]){
    for(const {r} of [a,b])r.drops[0].vel.set(...vector);
    assert.deepEqual(drawSnapshot(b.r),drawSnapshot(a.r));assert.deepEqual(drawSnapshot(b.r),drawSnapshot(a.r));
  }
  const cached=b.r.drops[0];b.r.clear();assert.equal(cached._inkDrawValid,false);a.r.clear();
  for(const {r} of [a,b]){const p=head(1);r.spawnDrop(p,new THREE.Vector3(9,8,7),0,0);}
  assert.equal(b.r.drops[0],cached);assert.equal(cached._inkDrawValid,false);assert.deepEqual(drawSnapshot(b.r),drawSnapshot(a.r));
});

function hitRecord(v){return{hit:false,dist:0,point:v.clone(),normal:v.clone(),block:-1,face:-1,u:0,v:0};}
test('inline splash birth matches baseline random order, scalar fields and reused record resets',()=>{
  const env={EPS:1e-9,STEP_FRAMES_PER_SECOND:60,seededSplashUnit,hitRecord,dropQueue:g=>g.projectiles?g.projectiles._s3SplashDrops||=([]):null};
  const old=evalFn(before.spawnSplashDrop,env),current=spawnSplashDrop,random=rng(32);
  const games=[{projectiles:{}},{projectiles:{}}];
  for(let i=0;i<500;i++){
    const args={owner:{remote:false},team:i%2,seed:random(),salt:i,from:new THREE.Vector3(random(),random()*7,random()),direction:new THREE.Vector3(random()-.5,0,random()-.5),radius:.4,spec:{randomVelocity:i%3?{x:2,y:3,zMin:.2,zMax:.5}:null},catchUpSeconds:i%7/60,footprint:i%2?'ink-shot':null};
    const values=[old(games[0],args),current(games[1],args)];
    const snapshot=p=>({...p,owner:null,pos:p.pos.toArray(),vel:p.vel.toArray(),next:p.next.toArray(),hit:{...p.hit,point:p.hit.point.toArray(),normal:p.hit.normal.toArray()}});
    assert.deepEqual(snapshot(values[1]),snapshot(values[0]));
    for(let j=0;j<2;j++){games[j].projectiles._s3SplashDrops.pop();games[j].projectiles._s3SplashDropPool.push(values[j]);values[j].landing={stale:true};values[j].sourceActor='stale';}
  }
});

test('owned no-callback distance segment shares direction while wall/getter/fallback paths preserve current state',()=>{
  for(const mode of ['owned','unknown','wall','wall-getter','fallback','all-wall']){
    const run=code=>{const ownedDistanceStates=new WeakSet(),events=[];let sets=0,gets=0;
      const state={last:new THREE.Vector3(),sample:new THREE.Vector3(),direction:new THREE.Vector3(),distance:0,index:0,wallSplash:null,spec:{first:.2,spacing:.5,count:8,width:.3,nearestWidth:.4,nearestIsFeet:true,randomVelocity:null}};
      const set=state.direction.set.bind(state.direction);state.direction.set=(...a)=>{sets++;return set(...a);};
      if(mode!=='unknown')ownedDistanceStates.add(state);
      const p={owner:{remote:false},team:1,seed:.4,pos:new THREE.Vector3(2,0,5),s3Weapon:{kind:'roller'}},game={paint:{},physics:{},...(mode==='fallback'?{}:{projectiles:{}})};
      if(mode==='wall'||mode==='all-wall')state.wallSplash=(_from,index)=>{p.s3Weapon={kind:index%2?'brush':'roller'};state.last.x+=.01;state.direction.x-=.2;return mode==='all-wall'||index%3===0;};
      if(mode==='wall-getter')Object.defineProperty(state,'wallSplash',{get(){gets++;return null;}});
      const env={EPS:1e-9,ownedDistanceStates,mainInkFootprint,spawnSplashDrop(_g,args){events.push(['drop',...args.from.toArray(),...args.direction.toArray(),args.radius,args.kind,args.footprint]);return mode==='fallback'?null:{};},paintImmediate(_g,_p,s,i,r){events.push(['fallback',i,r]);s.last.z+=.02;s.direction.z=99;}};
      const released=evalFn(code,env)(game,p,state,p.pos);return{events,released,index:state.index,distance:state.distance,last:state.last.toArray(),sets,gets};};
    const a=run(before.paintDistanceFlight),b=run(functionSource(splashSource,'paintDistanceFlight'));
    assert.deepEqual({...b,sets:null},{...a,sets:null});assert.equal(b.sets,mode==='owned'?1:a.sets);
  }
});

function catalogLoop(){const start=catalogSource.indexOf('      if(!p.ghost&&d.splashCount>0&&s.dropCount<d.splashCount&&splashLength>EPS){'),end=catalogSource.indexOf('      if(!p.ghost&&s.rollerFlight&&len>EPS)',start);return catalogSource.slice(start,end);}
test('catalog segment footprint sharing is lazy, keeps null and falls back for custom/getter/Proxy and floor paint',()=>{
  const record=MAIN_WEAPON_CATALOG.records.find(x=>x.family==='shooter'),sourceSet=new WeakSet(MAIN_WEAPON_CATALOG.records);
  const canShareSourceFootprint=evalFn(functionSource(catalogSource,'canShareSourceFootprint'),{SOURCE_FOOTPRINT_RECORDS:sourceSet});
  for(const mode of ['source','none','custom','getter','proxy','floor','null']){
    const oldFamily=record.family;if(mode==='null')record.family='unknown';
    try{
      const run=loop=>{const log=[],reads=[];let classifications=0,clones=0;
        class Vector3 extends THREE.Vector3{clone(){clones++;return new Vector3(this.x,this.y,this.z);}}
        const descriptor=mode==='custom'?{family:'shooter'}:mode==='proxy'?new Proxy({family:'shooter'},{get(o,k){reads.push(String(k));return o[k];}}):record;
        const s={r:descriptor,dropCount:0,nextSplash:mode==='none'?50:.2,carry:.03};if(mode==='getter')Object.defineProperty(s,'r',{get(){reads.push('s.r');return descriptor;}});
        const p={ghost:false,age:1/60,life:1,prev:new Vector3(),pos:new Vector3(0,0,5),vel:new Vector3(0,0,300),owner:{},team:0,seed:.3};
        const d={splashCount:8,splashSpacing:.5,splashWidth:.4,splashNearestWidth:.5,depth:1.2,...(mode==='floor'?{}:{splashDropSpec:{gravity:9}})};
        const env={EPS:1e-9,DT:1/60,clamp:(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),catalogSplashRadius,canShareSourceFootprint,mainInkFootprint(r){classifications++;return mainInkFootprint(r);},spawnSplashDrop(_g,a){log.push(['drop',...a.from.toArray(),...a.direction.toArray(),a.radius,a.footprint,a.catchUpSeconds]);return{};},floorPaint(_o,from,r,depth,dir,footprint){log.push(['floor',...from.toArray(),r,depth,...dir.toArray(),footprint]);}};
        evalFn('function(p,s,d,G,stop,splashLength,splashBefore){'+loop+'}',env)(p,s,d,{},Infinity,5,0);
        return{log,reads,count:s.dropCount,next:s.nextSplash,classifications,clones};};
      const a=run(before.catalogSplashLoop),b=run(catalogLoop());assert.deepEqual({...b,classifications:null,clones:null},{...a,classifications:null,clones:null});
      assert.equal(b.classifications,['source','null'].includes(mode)?1:a.classifications);assert.ok(b.clones<=a.clones);
    }finally{record.family=oldFamily;}
  }
});
