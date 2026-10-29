import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {createRainmakerAttackVisuals} from '../../splatoon3/runtime/ranked/rainmaker-visuals.mjs';

const combat='patches/splatoon3/runtime/ranked/combat.mjs';
const baseline=fs.readFileSync(new URL('./fixtures/rainmaker-combat-53149347.mjs.txt',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
async function harness(control=false,{scene=true}={}){
  const original=(rel,code)=>control&&rel===combat?baseline:code;
  const f=await fixture({extraExports:`export {createRankedEffects} from './${combat}';`,
    adaptRuntime:original,adaptEmittedRuntime:original});
  const {G}=f,records={los:[],damage:[],paint:[],rings:[],audio:[]};
  let allocations=0,onHit=()=>{};
  const Vector3=new Proxy(f.THREE.Vector3,{construct(type,args,newTarget){allocations++;return Reflect.construct(type,args,newTarget);}});
  G.scene=scene?new f.THREE.Scene():null;G.netm=null;G.projectiles={};
  G.fx={ring:(p,n,color,options)=>records.rings.push([p.toArray(),n.toArray(),color.toArray(),plain(options)])};
  G.audio={play:(name,options)=>records.audio.push([name,options.pos.toArray()])};
  G.paint={splat:(p,radius,team,options)=>records.paint.push([p.toArray(),radius,team,options.seed])};
  G.physics.los=(from,to)=>{records.los.push([from.toArray(),to.toArray()]);return true;};
  const actors=Array.from({length:8},(_,i)=>({nid:'v'+i,team:1,alive:true,pos:new f.THREE.Vector3(i*.25,.1,i*.1),
    damage(amount){records.damage.push([this.nid,amount]);return false;}}));
  const match={state:'playing',actors,ranked:{revision:7}};
  const effects=f.createRankedEffects({...f,THREE:{...f.THREE,Vector3},emit(){onHit();}},match);
  const pop=(pos=[0,0,0],visualOnly=false)=>effects.event({kind:'rainmaker-pop',pos,team:0,radius:5,damage:180},visualOnly);
  return {f,G,records,actors,effects,pop,allocations:()=>allocations,onHit:fn=>{onHit=fn;}};
}

test('Rainmaker semantic merge keeps release visuals and sequential blast output while retaining the scratch allocation win',async()=>{
  // Pinned full original PR1909 implementation, including its follow-up release fix.
  assert.equal(createHash('sha256').update(baseline).digest('hex'),'46c65b15a7eab4bd68e01b479cd8cc34cafc1c0b6ad880ee4526b9a7ee7acf0c');
  const pair=await Promise.all([harness(true),harness()]),counts=[];
  try{
    for(const h of pair){
      for(let i=0;i<8;i++)h.pop(); // Warm the bounded visual pool and native scratch.
      for(const values of Object.values(h.records))values.length=0;
      const before=h.allocations();
      for(let i=0;i<80;i++)h.pop([i%2*.03,0,0]);
      counts.push(h.allocations()-before);
    }
    assert.deepEqual(plain(pair[1].records),plain(pair[0].records),'all damage, LOS, paint, ring and audio values match original PR1909');
    assert.equal(counts[0],880);assert.equal(counts[1],80,'only the event-owned retained position is newly allocated per blast');
    console.log(JSON.stringify({scope:'actual composed ranked blast, eight victims, 80 sequential events; no timing claim',baselineVectorConstructs:counts[0],mergedVectorConstructs:counts[1]}));
  }finally{pair.forEach(h=>h.effects.dispose());}
});

test('nested hit events and exceptions cannot replace another active Rainmaker blast origin',async()=>{
  const pair=await Promise.all([harness(true),harness()]);
  try{
    for(const h of pair){
      let nested=false;
      h.onHit(()=>{if(!nested){nested=true;h.pop([100,0,0]);}});
      h.pop();
      assert.equal(h.records.los.length,8);
      assert.ok(h.records.los.every(([from])=>JSON.stringify(from)===JSON.stringify([0,.05,0])));
      h.onHit(()=>{throw Error('nested subscriber');});
      assert.throws(()=>h.pop(),/nested subscriber/);
      h.onHit(()=>{});h.records.los.length=0;
      h.pop([.1,0,0]);
      assert.ok(h.records.los.every(([from])=>JSON.stringify(from)===JSON.stringify([.1,.05,0])),'scratch lease unwinds on errors');
      const before=h.allocations();h.pop([.1,0,0]);
      if(h===pair[1])assert.equal(h.allocations()-before,1,'exception recovery reuses the normal depth-zero slot');
    }
    assert.deepEqual(plain(pair[1].records),plain(pair[0].records));
  }finally{pair.forEach(h=>h.effects.dispose());}
});

test('Rainmaker visuals copy source muzzle arrays, borrowed impact positions and mutable color values',()=>{
  const scene=new THREE.Scene(),visuals=createRainmakerAttackVisuals(THREE,scene);
  try{
    const muzzle=[2,3,4],color=new THREE.Color(.9,.5,.1),velocity=new THREE.Vector3(0,2,5);
    const shot=visuals.shot(color,1,muzzle),sourceColor=color.toArray();
    muzzle.fill(999);color.setRGB(0,0,0);
    assert.deepEqual(shot.position.toArray(),[2,3,4]);
    assert.deepEqual(shot.getObjectByName('rainmaker-shot-head').material.color.toArray(),sourceColor);
    const before=velocity.toArray();visuals.updateShot(shot,velocity,.1);assert.deepEqual(velocity.toArray(),before);
    const rotation=shot.quaternion.toArray();velocity.set(100,100,100);assert.deepEqual(shot.quaternion.toArray(),rotation);
    const borrowed=new THREE.Vector3(1,2,3);visuals.splash(borrowed,color,1.4,'impact');
    const first=scene.getObjectByName('rainmaker-ink-splashes').children[0];
    borrowed.set(8,9,10);visuals.splash(borrowed,color,1.4);
    assert.deepEqual(first.position.toArray(),[1,2,3]);
    visuals.update(.1);assert.deepEqual(first.position.toArray(),[1,2,3]);
    assert.deepEqual(borrowed.toArray(),[8,9,10]);
  }finally{visuals.dispose();}
});

test('latest owner lazy visual binding survives headless blasts and binds to the subsequently installed scene',async()=>{
  const pair=await Promise.all([harness(true,{scene:false}),harness(false,{scene:false})]);
  try{
    for(const h of pair){
      h.pop();assert.equal(h.records.damage.length,8,'headless blast still reaches combat');
      const shooter=h.actors[0],shot={kind:'rainmaker-shot',actorId:shooter.nid,team:1,pos:shooter.pos.toArray(),aim:[0,0,1],charge:1,
        shotOrigin:{actorId:shooter.nid,team:1,owner:null,life:0,body:[0,.8,0],muzzle:[0,1,0]}};
      h.effects.event(shot);assert.equal(h.records.audio.filter(([name])=>name==='shoot_charger').length,0,'no-scene shot admission stays closed');
      h.G.scene=new h.f.THREE.Scene();h.pop([.1,0,0]);
      assert.ok(h.G.scene.getObjectByName('rainmaker-ink-splashes'),'first rendered blast binds the current scene');
      h.effects.event(shot);assert.ok(h.G.scene.getObjectByName('rainmaker-shot'),'later rendered shot uses the owner muzzle/visual path');
      h.effects.dispose();
      assert.equal(h.G.scene.getObjectByName('rainmaker-ink-splashes'),undefined);
      assert.equal(h.G.scene.getObjectByName('rainmaker-shot'),undefined);
    }
    assert.deepEqual(plain(pair[1].records),plain(pair[0].records));
  }finally{pair.forEach(h=>h.effects.dispose());}
});
