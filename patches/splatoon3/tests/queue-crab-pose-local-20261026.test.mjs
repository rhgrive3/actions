import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {buildSubModel,poseSubModel} from '../runtime/sub-models.mjs';
import '../runtime/special-models.mjs';

const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-crab-pose-before-20261026.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../runtime/sub-models.mjs',import.meta.url),'utf8');
const declaration=parse(source,{sourceType:'module',ecmaVersion:'latest'}).body.map(n=>n.declaration||n).find(n=>n.type==='FunctionDeclaration'&&n.id.name==='poseSubModel');
const current=source.slice(declaration.start,declaration.end);
const legs=[['legL0','legR0'],['legL1','legR1'],['legL2','legR2']];
const nativeBindings=new Function(source.match(/const CRAB_NATIVE_SIN =[^;]+;/)[0]+source.match(/const CRAB_CALL_SIN =[^;]+;/)[0]+'return {CRAB_NATIVE_SIN,CRAB_CALL_SIN};')();
const compile=(code,bindings={})=>new Function(...Object.keys(bindings),code+';return poseSubModel;')(...Object.values(bindings));
const oldPose=compile(before.poseSubModel,{CRAB_LEGS:legs});
const simple=()=>({id:'spCrabTank',state:{t:0},groups:Object.fromEntries(legs.flat().map(k=>[k,{rotation:{y:0}}]))});

test('ordinary Crab pairs share sine with bounded error in actual Three.js model world matrices',t=>{
  const ink=new THREE.MeshStandardMaterial(),a=buildSubModel(THREE,'spCrabTank',ink),b=buildSubModel(THREE,'spCrabTank',ink);
  for(const m of [a,b]){m.root.position.set(37,2,-19);m.root.rotation.set(.1,.7,-.2);m.root.scale.set(.9,1.3,1.1);}
  const aa=[],bb=[];a.root.traverse(o=>aa.push(o));b.root.traverse(o=>bb.push(o));assert.equal(aa.length,bb.length);
  let maxRotationError=0,maxWorldMatrixError=0,poses=0;
  const check=(dt,speed)=>{
    oldPose(a,{dt,speed});poseSubModel(b,{dt,speed});poses++;
    assert.equal(b.state.stride,a.state.stride);assert.equal(b.state.t,a.state.t);
    a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
    for(const [l,r] of legs)for(const k of [l,r])maxRotationError=Math.max(maxRotationError,Math.abs(a.groups[k].rotation.y-b.groups[k].rotation.y));
    for(let j=0;j<aa.length;j++)for(let i=0;i<16;i++)maxWorldMatrixError=Math.max(maxWorldMatrixError,Math.abs(aa[j].matrixWorld.elements[i]-bb[j].matrixWorld.elements[i]));
  };
  for(const hz of [30,60,120]){
    a.state={t:0};b.state={t:0};
    for(let frame=0;frame<hz*20;frame++)check(1/hz,frame<hz*2||frame>=hz*18?0:frame<hz*10?7.2:.05);
  }
  const phases=[-65536,-65535.999,-4096,-Math.PI,-0,0,Math.PI,4096,65531,65536];
  let seed=0x41c6ce57;for(let i=0;i<1024;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;phases.push((seed/2**32-.5)*131072);}
  for(const phase of phases)for(const speed of [0,.01,1,7.2]){a.state={t:0,stride:phase};b.state={t:0,stride:phase};check(0,speed);}
  assert.ok(maxRotationError<2e-12,{maxRotationError});assert.ok(maxWorldMatrixError<1e-11,{maxWorldMatrixError});
  for(const m of [a,b])for(const material of m.materials.values())material.dispose();ink.dispose();
  t.diagnostic(JSON.stringify({poses,modelNodes:aa.length,maxRotationError,maxWorldMatrixError,meaning:'presentation-only numeric bounds; not a browser or device frame-time measurement'}));
});

test('paired sine removes three moving-pose calls; absent, huge and nonfinite phases retain original evaluation',()=>{
  const run=(code,phase,speed,missing)=>{
    const model=simple(),calls=[],math=Object.create(Math);model.state.stride=phase;
    if(missing)delete model.groups[missing];
    const sin=function(x){assert.equal(this,math);calls.push(x);return Math.sin(x);};
    // The source branch is instrumented as the native primitive only for the
    // count check. Production-model error is measured separately above.
    const nativeLike=x=>{calls.push(x);return Math.sin(x);};math.sin=nativeLike;
    const pose=compile(code,{CRAB_LEGS:legs,Math:math,...nativeBindings,CRAB_NATIVE_SIN:nativeLike});
    pose(model,{dt:0,speed});return{model,calls,sin};
  };
  const old=run(before.poseSubModel,1,3),next=run(current,1,3);assert.equal(old.calls.length,6);assert.equal(next.calls.length,3);
  for(const [phase,speed] of [[65537,3],[-65542,3],[1e9,3],[Infinity,3],[-Infinity,3],[1,-1e9]]){
    const a=run(before.poseSubModel,phase,speed),b=run(current,phase,speed);
    assert.deepEqual(b.calls,a.calls);for(const k of legs.flat())assert.ok(Object.is(b.model.groups[k].rotation.y,a.model.groups[k].rotation.y));
  }
  const absent=run(current,1,3,'legL0');assert.equal(absent.calls.length,3);assert.equal(absent.calls[0],1+Math.PI);
});

test('custom/getter sine and mutable group access keep property order, receiver and fallback values',()=>{
  const run=code=>{
    const model=simple(),log=[],math=Object.create(Math),raw=model.groups;let generation=0;
    const custom=function(x){assert.equal(this,math);log.push(['sin',generation,x]);return Math.sin(x)+generation*.01;};
    // An overridden .call must not change ordinary Math.sin invocation semantics.
    custom.call=()=>{throw Error('custom call property must not be used');};
    Object.defineProperty(math,'sin',{get(){log.push(['get-sin']);return custom;}});
    model.groups=new Proxy(raw,{get(target,key){log.push(['group',key]);if(key==='legR0')generation++;return target[key];}});
    for(const k of legs.flat()){
      const rotation=raw[k].rotation;let value=0;
      Object.defineProperty(rotation,'y',{get(){return value;},set(v){log.push(['set',k,v]);value=v;}});
    }
    const pose=compile(code,{CRAB_LEGS:legs,Math:math,...nativeBindings});
    pose(model,{dt:1/60,speed:3});pose(model,{dt:0,speed:3});
    delete raw.legL1;pose(model,{dt:1/120,speed:1});
    return{log,values:Object.values(raw).map(g=>g.rotation.y),stride:model.state.stride};
  };
  assert.deepEqual(run(current),run(before.poseSubModel));
});

test('right-side getters that replace the sine after the left assignment disable sharing',()=>{
  const run=code=>{
    const model=simple(),log=[],math=Object.create(Math),raw=model.groups;math.sin=Math.sin;
    const changed=function(x){assert.equal(this,math);log.push(x);return Math.sin(x)+.25;};
    model.groups=new Proxy(raw,{get(target,key){if(key==='legR0')math.sin=changed;return target[key];}});
    compile(code,{CRAB_LEGS:legs,Math:math,...nativeBindings})(model,{dt:.1,speed:3});
    return{log,values:Object.values(raw).map(g=>g.rotation.y)};
  };
  assert.deepEqual(run(current),run(before.poseSubModel));
});
