import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const source = new URL('../runtime/', import.meta.url);
const built = process.env.INKWAVE_BUILT_SITE;
const runtime = name => built ? pathToFileURL(path.resolve(built, 'patches/splatoon3/runtime', name)).href : new URL(name, source).href;
const { advanceKrakenJumpMotion: advance, createKrakenJumpObserver, KRAKEN_JUMP_MOTION: M } = await import(runtime('kraken-jump-motion.mjs'));
const { installSpecialModels } = await import(runtime('special-presentation.mjs'));
const THREE = await import(built ? pathToFileURL(path.resolve(built, 'vendor/three/build/three.module.js')).href : new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url).href);
const actor = (remote = false) => ({alive:true, remote, grounded:false, climbing:false,
  pos:new THREE.Vector3(), vel:new THREE.Vector3(), specialActive:{id:'krakenRoyale',phase:'active',activation:1}});
const attack = () => ({id:'krakenRoyale', phase:'active', jumpAttack:true, duration:8});
const close = (a,b,eps=1e-10) => assert.ok(Math.abs(a-b)<eps, `${a} != ${b}`);

test('one accepted jump turns once around the mantle; long falls never loop it', () => {
  const a=actor(), st=attack(), s={};
  advance(s,a,st,'active',M.turn/4,100); close(s.krakenSpin,Math.PI*2*.15625);
  advance(s,a,st,'active',M.turn/4,100); close(s.krakenSpin,Math.PI);
  advance(s,a,st,'active',M.turn/2,100); assert.equal(s.krakenSpin,0);
  advance(s,a,st,'active',10,100); assert.equal(s.krakenSpin,0);
});
for (const phase of ['active','charge']) test(`accepted airborne jump remains visible during ${phase}`, () => {
  const a=actor(), s={}; advance(s,a,attack(),phase,.2,10); assert.ok(s.krakenSpin>1);
});
for (const [name,alter,phase] of [
  ['ordinary fall',(a,s)=>s.jumpAttack=false,'active'],
  ['ground',(a)=>a.grounded=true,'active'], ['wall',(a)=>a.climbing=true,'active'],
  ['dead',(a)=>a.alive=false,'active'], ['startup',()=>{},'startup'],
  ['finish',()=>{},'finish'], ['dash',()=>{},'dash'],
  ['different special',(a)=>a.specialActive={id:'inkjet'},'active'],
]) test(`no body attack spin for ${name}`, () => {
  const a=actor(), st=attack(), s={}; alter(a,st); advance(s,a,st,phase,.1,10); assert.equal(s.krakenSpin,0);
});
test('30/60/120 Hz and irregular intervals agree without match-age phase jumps', () => {
  const angles=[];
  for (const steps of [[1/30],[1/60],[1/120],[1/120,1/40,1/60]]) for (const time of [0,987]) {
    const a=actor(), s={}, st=attack(); let elapsed=0, i=0;
    while(elapsed<.3-1e-12){const dt=Math.min(steps[i++%steps.length],.3-elapsed);elapsed+=dt;advance(s,a,st,'active',dt,time+elapsed);}
    angles.push(s.krakenSpin);
    const before=JSON.stringify(s);a.vel.set(9,7,5);
    for(const dt of [0,-1,NaN,Infinity])advance(s,a,st,'active',dt,time+elapsed);
    assert.equal(JSON.stringify(s),before,'zero/invalid dt cannot advance a live turn');
  }
  for(const angle of angles)close(angle,angles[0]);
});
test('contact recovery is a real landing, not a jump-button pulse; fresh activation clears it', () => {
  const a=actor(), st=attack(), s={}; advance(s,a,st,'active',.2,1);
  assert.equal(s.krakenLanding,0);
  a.grounded=true;st.jumpAttack=false;advance(s,a,st,'active',.04,1.04);
  assert.equal(s.krakenSpin,0);assert.ok(s.krakenLanding>0);
  advance(s,a,st,'active',.2,1.24);assert.equal(s.krakenLanding,0);
  a.grounded=false;st.jumpAttack=true;advance(s,a,st,'active',.1,1.34);assert.ok(s.krakenSpin>0);
  a.specialActive={id:'krakenRoyale',phase:'startup',activation:2};
  advance(s,a,st,'startup',0,1.34);assert.equal(s.krakenSpin,0);assert.equal(s.krakenLanding,0);
});
test('remote spin needs an accepted, fresh, activation-bound jump, not airborne velocity alone', () => {
  const G={time:10}, observer=createKrakenJumpObserver(G), a=actor(true),s={};
  advance(s,a,null,'active',.1,G.time,observer.get(a));assert.equal(s.krakenSpin,0);
  observer.observe({id:'krakenRoyale',actor:a,action:'activate',activation:1});
  observer.observe({id:'krakenRoyale',actor:a,action:'jump',activation:1,index:0});
  const mark=observer.get(a);
  advance(s,a,null,'active',.1,G.time,mark);assert.ok(s.krakenSpin>0);
  observer.observe({id:'krakenRoyale',actor:a,action:'jump',activation:1,index:0});assert.equal(observer.get(a),mark);
  observer.observe({id:'krakenRoyale',actor:a,action:'jump',activation:2,index:1});assert.equal(observer.get(a),mark);
  const before=s.krakenSpin;advance(s,a,null,'active',.1,G.time,observer.get(a));assert.ok(s.krakenSpin>before);
  observer.observe({id:'krakenRoyale',actor:a,action:'jump',activation:1,index:1});
  advance(s,a,null,'active',.05,G.time,observer.get(a));assert.ok(s.krakenSpin<before,'next actual jump restarts');
  G.time+=M.replayWindow+1;advance(s,a,null,'active',.01,G.time,mark);assert.equal(s.krakenSpin,0);
  a.specialActive={id:'krakenRoyale',phase:'active',activation:3};
  advance(s,a,null,'active',.1,10,mark);assert.equal(s.krakenSpin,0,'previous activation cannot animate a new life');
  observer.clear();assert.equal(observer.get(a),undefined);
});

// Real procedural model + installed production presentation wrapper. The tiny
// Character supplies only its native host graph, not a replacement Kraken pose.
// Gameplay movement is tested independently by the existing real Actor suite.
function rig(remote=false) {
  const G={time:0,scene:new THREE.Scene(),teamColors:[0xff3366]}, listeners=[];
  class Projectiles {update(){} clear(){}}
  class Character {
    constructor(a){this.actor=a;this.color=0xff3366;this.root=new THREE.Group();this.model=new THREE.Group();this.kid=new THREE.Group();this.squidRoot=new THREE.Group();this.root.add(this.model);this.model.add(this.kid,this.squidRoot);G.scene.add(this.root);}
    update(){this.kid.visible=true;this.squidRoot.visible=true;}
    setVisible(v){this.root.visible=v;}
    dispose(){this.root.removeFromParent();}
  }
  const api={THREE,G,Character,Projectiles,on:(type,fn)=>{if(type==='all:special')listeners.push(fn);}};
  installSpecialModels(api);
  const a=actor(remote);a.grounded=true;a._s3AllSpecialState=remote?null:{...attack(),jumpAttack:false};
  const ch=new Character(a);a.character=ch;
  const step=(dt)=>{G.time+=dt;ch.update(dt);return ch.s3SpecialDevices()?.find(d=>d.spec.model==='spKraken');};
  const emit=e=>listeners.forEach(fn=>fn(e));
  const event=(action,index=0)=>({actor:a,id:'krakenRoyale',action,index,activation:a.specialActive.activation});
  let d=step(0);for(let i=0;i<60;i++)d=step(1/60);
  return {a,ch,G,api,step,emit,event,d};
}
test('installed real Kraken mesh rotates, preserves its longitudinal axis/position, and restores on contact', () => {
  const spinning=rig(),control=rig();
  try {
    for(const r of [spinning,control]){r.a.grounded=false;r.a.vel.set(0,7,5);}
    spinning.a._s3AllSpecialState.jumpAttack=true;
    const original={pos:spinning.a.pos.toArray(),vel:spinning.a.vel.toArray(),token:JSON.stringify(spinning.a.specialActive),attack:JSON.stringify(spinning.a._s3AllSpecialState)};
    for(let i=0;i<9;i++){spinning.step(1/60);control.step(1/60);}
    const A=spinning.d.holder,B=control.d.holder;
    assert.ok(Math.abs(A.quaternion.dot(B.quaternion))<.9,'negative control has only the old wobble');
    const axis=new THREE.Vector3(0,1,0),forwardA=axis.clone().applyQuaternion(A.quaternion),forwardB=axis.clone().applyQuaternion(B.quaternion);
    close(forwardA.distanceTo(forwardB),0);
    const horizontal=new THREE.Vector3(A.position.x,0,A.position.z).distanceTo(new THREE.Vector3(B.position.x,0,B.position.z));
    assert.ok(horizontal<.04,'takeoff squash is small; roll cannot orbit the model');
    assert.deepEqual({pos:spinning.a.pos.toArray(),vel:spinning.a.vel.toArray(),token:JSON.stringify(spinning.a.specialActive),attack:JSON.stringify(spinning.a._s3AllSpecialState)},original);
    const frozen=A.quaternion.clone();spinning.step(0);close(1-Math.abs(frozen.dot(A.quaternion)),0);
    spinning.a.grounded=true;spinning.a._s3AllSpecialState.jumpAttack=false;
    control.a.grounded=true;for(let i=0;i<60;i++){spinning.step(1/60);control.step(1/60);}
    close(1-Math.abs(A.quaternion.dot(B.quaternion)),0);
    for(const r of [spinning,control]){
      r.ch.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(r.d.holder);
      assert.ok(box.min.y>-.015,'settled belly stays above floor');
    }
  } finally {spinning.ch.dispose();control.ch.dispose();}
});
test('remote installed model ignores raw local-bus rows, but works without any FX director after admission', () => {
  const r=rig(true);try {
    r.a.grounded=false;r.a.vel.y=6;
    r.emit(r.event('jump'));assert.equal(r.d.krakenJumpMark,undefined);
    r.step(.05);const noAttack=r.d.holder.quaternion.clone();
    r.api.specialModelsReplay(r.event('activate'));r.api.specialModelsReplay(r.event('jump'));
    r.step(.15);assert.ok(Math.abs(noAttack.dot(r.d.holder.quaternion))<.95);
    r.ch.setVisible(false);assert.equal(r.ch.s3SpecialDevices(),null);
    r.ch.setVisible(true);r.step(0);assert.equal(r.d.holder.parent,null,'old device retired');
  }finally{r.ch.dispose();}
});
test('same-id replacement rebuilds emergence and clears the old device and jump state', () => {
  const r=rig();try {
    const old=r.d;r.a.grounded=false;r.a._s3AllSpecialState.jumpAttack=true;r.step(.15);
    r.a.specialActive={id:'krakenRoyale',phase:'startup',activation:2};r.a._s3AllSpecialState={...attack(),phase:'startup',jumpAttack:false};
    const next=r.step(0);assert.notEqual(next,old);assert.equal(old.holder.parent,null);
    assert.ok(next.holder.scale.x<=.011,'fresh emergence, not the fully grown former device');
    r.a.alive=false;r.step(.01);assert.equal(r.ch.s3SpecialDevices(),null);
  }finally{r.ch.dispose();}
});
