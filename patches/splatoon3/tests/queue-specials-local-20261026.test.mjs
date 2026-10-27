import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {gearCurve} from '../runtime/gear.mjs';
import {worldMeshParts} from '../runtime/all-specials.mjs';
import {fixture} from './source-fixture.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-specials-before-20261026.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../runtime/all-specials.mjs',import.meta.url),'utf8');
function declarations(text){return new Map(parse(text,{sourceType:'module',ecmaVersion:'latest'}).body.map(n=>n.declaration||n).filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,text.slice(n.start,n.end)]));}
const current=declarations(source),subs=declarations(fs.readFileSync(new URL('../runtime/all-subs.mjs',import.meta.url),'utf8'));
function fn(code,env={}){return vm.runInNewContext('('+code+')',env);}
const finite=Number.isFinite,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const normalizedSeed=fn(current.get('normalizedSeed'));
const seedUnit=fn(current.get('seedUnit'),{normalizedSeed,q3:n=>Math.round(n*1000)/1000});
const nextSeed=fn(current.get('nextSeed'));
const positions=vm.runInNewContext(source.match(/const SCREEN_SPLASH_POSITIONS=([^;]+);/)[1]);
function runtime(){const r={api:{THREE,G:{}},up:new THREE.Vector3(0,1,0),down:new THREE.Vector3(0,-1,0),hit:{point:new THREE.Vector3(),normal:new THREE.Vector3()}};for(let i=0;i<16;i++)r['v'+i]=new THREE.Vector3();return r;}

test('Inkjet removes only its redundant predicate closure and preserves escaping snapshots and nested hit callbacks',()=>{
  const run=code=>{const rt=runtime(),log=[],retained=[],actor={alive:true,team:0,pos:new THREE.Vector3(0,3,0),specialActive:{id:'inkjet'},intent:{},form:'kid'};
    const objects=[{pos:new THREE.Vector3(1.2,1,0)},{pos:new THREE.Vector3(0,.6,0)},{pos:new THREE.Vector3(0,3.2,0)},{pos:new THREE.Vector3(1.21,2,0)},{}];
    const victim={alive:true,team:1,pos:new THREE.Vector3(0,1.5,0)};rt.api.G.actors=[actor,victim];let nested=false,invoke;
    rt.api.G.physics={los(a,b){log.push(['los',...a.toArray(),...b.toArray()]);return true;}};
    rt.api.G.projectiles={applyHit(_a,_v,amount,cause){log.push(['hit',amount,cause]);if(!nested){nested=true;actor.pos.x=.1;invoke(rt,actor);actor.pos.x=.2;}}};
    const consume=kind=>(_a,center,r,damage,cause)=>{log.push([kind,...center.toArray(),r,cause,...objects.map(o=>damage(0,o))]);retained.push({center,damage});};
    rt.system={s3DamageSpecialObjects:consume('special'),s3DamageSubObjects:consume('sub')};
    invoke=fn(code,{inkjetExhaustDamage:fn(current.get('inkjetExhaustDamage')),withObjectDamageCause:(_a,callback)=>callback()});
    invoke(rt,actor);actor.pos.x=.4;actor.pos.y=20;
    return{log,retained:retained.map(x=>({center:x.center.toArray(),damage:objects.map(o=>x.damage(0,o))})),sameCenters:retained[0].center===retained[1].center};};
  assert.deepEqual(run(current.get('inkjetExhaustFrame')),run(before.functions.inkjetExhaustFrame));
});

test('Screen projection leases preserve full lifetime stamps, custom retained inputs, nesting and exception release',()=>{
  for(const mode of ['native','custom','nested','throw']){
    const run=code=>{const rt=runtime(),log=[],retained=[];let clones=0,calls=0,nested=false,invoke;
      class Vector3 extends THREE.Vector3{clone(){clones++;return new Vector3(this.x,this.y,this.z);}}
      const o={owner:{remote:false},seed:42,pos:new Vector3(1,2,3),tangent:new Vector3(1,0,0),direction:new Vector3(0,0,1)};
      const raycast=(from,_down,_length,out)=>{calls++;log.push(['ray',...from.toArray()]);if(mode==='custom')retained.push(from);
        if(mode==='throw')throw Error('ray');
        if(mode==='nested'&&!nested){nested=true;invoke(rt,o,2/60);}
        out.hit=calls%3===0;out.point.copy(from).setY(.3);out.normal.set(0,1,0);return out;};
      rt.api.G.physics={raycast};if(mode!=='custom')rt.nativeRaycast=raycast;
      rt.api.G.level={groundHeight(x,z,y){log.push(['floor',x,z,y]);return calls%4===0?-Infinity:.2;}};
      invoke=fn(code,{FPS:60,SCREEN_SPLASH_POSITIONS:positions,finite,seedUnit,paintStamp(_rt,_owner,point,r,seed){log.push(['paint',...point.toArray(),r,seed]);}});
      try{for(let frame=0;frame<=620;frame++){o.pos.x+=.001;invoke(rt,o,frame/60);}}catch(e){assert.equal(e.message,'ray');}
      if(o._screenPaintLeases)assert.equal(o._screenPaintDepth,0);
      return{log,retained:retained.map(v=>v.toArray()),count:o.screenPaintDrop,clones};};
    const a=run(before.functions.paintScreenDrops),b=run(current.get('paintScreenDrops'));
    assert.deepEqual({...b,clones:null},{...a,clones:null});if(mode==='native')assert.equal(b.clones,2);if(mode==='custom')assert.equal(b.clones,a.clones);
  }
});

test('Crab roll uses depth-owned stamp options only for known sinks and preserves face, changing seeds and retained custom options',()=>{
  for(const mode of ['native','custom','network-custom','nested','throw']){
    const run=code=>{const rt=runtime(),log=[],retained=[],actor={pos:new THREE.Vector3(2,0,0),team:0,addTurfNoSpecial:a=>log.push(['turf',a])},state={rollPaintSeed:12};let n=0,nested=false,invoke,hashes=0;
      rt.api.G.physics={raycast(probe,_down,_distance,out){log.push(['ray',...probe.toArray()]);out.hit=true;out.point.copy(probe).setY(.1);out.normal.set(0,1,0);out.face=[3,-1,undefined,7][n++%4];return out;}};
      const splat=(point,r,team,opts)=>{log.push(['paint',...point.toArray(),r,team,{...opts,claimOwner:true}]);retained.push(opts);if(n===2)state.rollPaintSeed=18;
        if(mode==='throw')throw Error('paint');if(mode==='nested'&&!nested){nested=true;invoke(rt,actor,state,new THREE.Vector3(1.8,0,0));}return 1;};
      rt.api.G.paint={splat};if(mode!=='custom')rt.nativePaintSplat=splat;if(mode==='network-custom'){rt.api.G.netm={recSplat(){}};rt.nativeRecSplat=()=>{};}
      invoke=fn(code,{finite,seedUnit(...args){hashes++;return seedUnit(...args);}});
      try{invoke(rt,actor,state,new THREE.Vector3());}catch(e){assert.equal(e.message,'paint');}
      if(state._crabPaintOptions)assert.equal(state._crabPaintOptionsDepth,0);
      return{log,hashes,distinct:new Set(retained).size,retained:['custom','network-custom'].includes(mode)?retained.map(o=>({...o,claimOwner:true})):null};};
    const a=run(before.functions.paintCrabRoll),b=run(current.get('paintCrabRoll'));
    assert.deepEqual({...b,hashes:null,distinct:null},{...a,hashes:null,distinct:null});assert.ok(b.hashes<=a.hashes);
    if(mode==='native')assert.equal(b.distinct,1);if(mode==='custom'||mode==='network-custom')assert.equal(b.distinct,a.distinct);
  }
});

test('Crab movement start leases preserve outer positions through nested movement and exceptions',()=>{
  const start=source.indexOf('    const rollDepth=state._rollPaintFromDepth||0;'),end=source.indexOf('    if(actor.intent.sub&&!rolling',start),code=source.slice(start,end);
  const run=(block,throwing=false)=>{let invoke,nested=false;const log=[],state={},actor={pos:new THREE.Vector3(1,2,3),grounded:true};
    invoke=fn('function(rt,actor,dt,state,rolling){'+block+'}',{moveActor(rt,a,dt,s){a.pos.x+=1;if(!nested){nested=true;invoke(rt,a,dt,s,true);}if(throwing)throw Error('move');},paintCrabRoll(_rt,a,_s,from){log.push([from.x,from.y,from.z,...a.pos.toArray()]);}});
    try{invoke({},actor,1/60,state,true);}catch(e){assert.equal(e.message,'move');}if(state._rollPaintFromLeases)assert.equal(state._rollPaintFromDepth,0);return log;};
  assert.deepEqual(run(code),run(before.crabMovePaint));assert.deepEqual(run(code,true),run(before.crabMovePaint,true));
});

test('Wail paired delayed sample retains exact directions, origins, seed and event order across runtime scratch clobbering',()=>{
  for(const count of [0,1,8]){
    const run=code=>{const rt=runtime(),log=[],state={serial:3,seed:92},pair={index:1,tick:0,nextTick:1,origins:[new THREE.Vector3(-1,2,0),new THREE.Vector3(1,2,0)],direction:new THREE.Vector3(0,0,1),trace:Array.from({length:count},(_,i)=>({t:i/7,pos:new THREE.Vector3(i*.2,1+i*.1,5+i)}))};let searches=0;
      for(const name of ['findLast','find'])pair.trace[name]=function(...args){searches++;return Array.prototype[name].apply(this,args);};
      const invoke=fn(code,{WAIL_TRACK_DELAY:.5,clamp,nextSeed,hitBeam(_r,_a,_s,origin,dir,length,damage){log.push(['beam',...origin.toArray(),...dir.toArray(),length,damage]);rt.v3.set(99,88,77);return origin.clone().addScaledVector(dir,length);},emitAction(_r,_a,id,serial,action,origin,end,seed,extra){log.push([id,serial,action,...origin.toArray(),...end.toArray(),seed,{...extra}]);rt.v2.set(-99,-88,-77);}});
      invoke(rt,{},state,pair);return{log,tick:pair.tick,seed:state.seed,searches};};
    const a=run(before.functions.fireWailTick),b=run(current.get('fireWailTick'));assert.deepEqual({...b,searches:null},{...a,searches:null});assert.equal(b.searches,a.searches/2);
  }
});

test('Tenta target selection keeps projection, ordering, preview and all numeric slice boundaries',()=>{
  const run=(code,max,preview,cameraEnabled)=>{const rt=runtime(),actor={team:0,pos:new THREE.Vector3(),specialActive:{id:'tentaMissiles'}},actorStates=new WeakMap([[actor,{specialPowerAP:37}]]);let curves=0;
    rt.api.G.actors=Array.from({length:30},(_,i)=>({id:i,team:i%4?1:0,alive:i%7!==0,pos:new THREE.Vector3((i%6-3)*.2,0,-5-i*.3)}));
    if(cameraEnabled){const camera=new THREE.PerspectiveCamera(60,1.4,.1,100);camera.updateMatrixWorld();rt.api.G.camera=camera;}
    const invoke=fn(code,{aimDirection:(_r,_a,out)=>out.set(0,0,-1),actorStates,gearCurve(...a){curves++;return gearCurve(...a);}});
    try{const result=invoke(rt,actor,max,Infinity,preview);return{rows:Array.from(result,row=>preview?{id:row.actor.id,x:row.x,y:row.y}:row.id),curves};}catch(e){return{error:e.name,curves};}};
  for(const max of [0,1,4,-1,1.9,-2.9,NaN,Infinity,-Infinity,'3',1n,Symbol('invalid')])for(const preview of [false,true])for(const camera of [false,true]){
    const a=run(before.functions.selectTargets,max,preview,camera),b=run(current.get('selectTargets'),max,preview,camera);assert.deepEqual({...b,curves:null},{...a,curves:null});assert.ok(b.curves<=1);
  }
});

test('shared AOE distance reuses only unchanged native endpoints and recomputes after LOS/method/shape edits',()=>{
  for(const name of ['specialObjectRadius','damageSubObjectsInRadius'])for(const mode of ['same','point','center','method','custom','shape','reject']){
    const run=code=>{const rt=runtime(),center=new THREE.Vector3(),point=new THREE.Vector3(.2,.3,.4),target={hp:10,team:1,owner:{team:1},subId:'mine',pos:point},attack={team:0},log=[];let calls=0;
      const original=THREE.Vector3.prototype.distanceTo;class Vector3 extends THREE.Vector3{};
      Vector3.prototype.distanceTo=function(v){calls++;return original.call(this,v);};Object.setPrototypeOf(point,Vector3.prototype);rt.api.THREE={...THREE,Vector3};
      if(mode==='custom')point.distanceTo=function(v){calls++;return original.call(this,v)+(calls-1)*.2;};
      rt.api.G.physics={los(c,p){if(mode==='point')p.x+=.3;if(mode==='center')c.z-=.4;if(mode==='method')p.distanceTo=function(v){calls++;return original.call(this,v)+.7;};return mode!=='reject';}};
      const system={_s3AllSpecialObjects:[target],_s3SubObjects:[target]};rt.system=system;
      const options=mode==='shape'?{shapeContact(_o,p){p.x+=.1;return true;}}:{};
      const damageAt=(d,_o,p)=>{log.push([d,...p.toArray()]);return 1;};
      const env={specialObjectDamage(){},entityList:p=>p._s3SubObjects,syncObjectAttachment(){},isSubObjectBlastTarget:()=>true,subObjectBlastPoint:()=>point,damageCustomObject(){}};
      const invoke=fn(code,env);if(name==='specialObjectRadius')invoke(rt,attack,center,4,damageAt,'test',false,options);else invoke(rt.api,system,attack,center,4,damageAt,'test',false,options);
      return{log,calls};};
    const a=run(before.functions[name]),b=run((name==='specialObjectRadius'?current:subs).get(name));assert.deepEqual(b.log,a.log);assert.equal(b.calls,mode==='same'?1:a.calls);
  }
});

test('installed special world proxies preserve transforms and supported material fields while native fallback remains available',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});assert.equal(typeof f.installedRuntime.specialWorldProxy,'function');
  const make=fn(current.get('worldMesh'),{worldMeshParts,colorOf:(_rt,owner)=>owner.color});
  const scene=new THREE.Scene(),rt={api:{THREE,G:{scene},specialWorldProxy:f.installedRuntime.specialWorldProxy}},owner={color:new THREE.Color('red')};
  for(const kind of ['screen','wave','decoy','marker','strike']){const object=make(rt,owner,kind,new THREE.Vector3(1,2,3),[2,3,4]);assert.equal(object.geometry,undefined);assert.equal(object.visible,false);assert.equal(object.material.emissiveIntensity,0);assert.equal(object.material.opacity,0);assert.deepEqual(Array.from(object.position.toArray()),[1,kind==='screen'?4.2:2,3]);assert.deepEqual(Array.from(object.scale.toArray()),[2,3,4]);}
  const fallback=make(rt,owner,'crabBall',new THREE.Vector3());assert.ok(fallback.geometry);fallback.geometry.dispose();fallback.material.dispose();
  delete rt.api.specialWorldProxy;const native=make(rt,owner,'screen',new THREE.Vector3());assert.ok(native.geometry);native.geometry.dispose();native.material.dispose();
});
