import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`});
const {G,THREE}=f;
const floor={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
G.level={...G.level,blocks:[floor],groundHeight:()=>0,queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};G.physics=new f.installedRuntime.Physics(G.level);
for(const weapon of ['shooter','roller','dualies'])test(weapon+' actual Actor hand anchor and primary/left visibility ownership',()=>{
 for(const team of [0,1]){
  G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,2,5);G.camera.updateMatrixWorld();G.actors=[];G.time=0;
  const a=new f.Actor({team,weapon,isLocal:true,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;a.nid='carrier';ch.actor=a;ch.onEvent=null;G.actors=[a];G.scene.add(ch.root);a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.pos.set(0,0,0);a.vel.set(0,0,0);
  const state={pos:[0,0,0],carrier:'carrier',barrier:{active:false,max:1000,health:0},charge:{value:0},checkpoint:{passed:[[],[]],goalOpen:[false,false]}};
  const match={mode:'rainmaker',actors:[a],state:'playing',ranked:{rule:{state}},playing:()=>true};G.match=match;
  const world=new f.RankedWorld({...f.installedRuntime,G,THREE},match,{rainmaker:{center:[0,0,0],checkpoints:[[],[]],goals:[]}});
  const pivots=[];for(let w=ch.weapon;w;w=w.left)pivots.push([w.pivot,w.pivot.visible]);assert.equal(pivots.length,weapon==='dualies'?2:1);
  let g=0,m=0;world.rainmakerCore.geometry.addEventListener('dispose',()=>g++);world.rainmakerCore.material.addEventListener('dispose',()=>m++);
  try{
   for(let tick=0;tick<90;tick++){
    a.intent.fire=false;a.intent.move.set(0,0,0);a.aimPitch=.15*Math.sin(tick*.08);a.yaw=tick*.015;G.time+=1/60;a.update(1/60);ch.root.updateMatrixWorld(true);
    const pose=Array.from(ch.P),position=a.pos.toArray(),hand=ch.bones.handR.getWorldPosition(new THREE.Vector3());state.charge.value=tick>30?1:0;world.update(match.ranked,1/60);world.group.updateMatrixWorld(true);
    assert.deepEqual(Array.from(ch.P),pose,'objective never overwrites native pose');assert.deepEqual(a.pos.toArray(),position,'objective does not move Actor');
    const grip=world.rainmakerCore.getWorldPosition(new THREE.Vector3());assert.ok(grip.distanceTo(hand)<1e-6,'actual hand attachment');assert.ok(world.rainmakerCore.matrixWorld.elements.every(Number.isFinite));
    for(const[p]of pivots)assert.equal(p.visible,false);assert.equal(world.rainmakerShield.visible,false);
   }
   state.carrier=null;state.pos=[2,0,-3];world.update(match.ranked,1/60);for(const[p,v]of pivots)assert.equal(p.visible,v);assert.deepEqual(Array.from(world.rainmakerCore.position.toArray()),[0,1,0]);
   state.carrier='carrier';world.update(match.ranked,1/60);world.dispose();world.dispose();for(const[p,v]of pivots)assert.equal(p.visible,v);assert.equal(g,1);assert.equal(m,1);assert.equal(world.group.parent,null);
   console.log(JSON.stringify({weapon,team,ticks:90,handAttachment:true,restored:true,geometryDispose:g,materialDispose:m}));
  }finally{world.dispose();ch.dispose();G.actors=[];G.projectiles.clear();G.match=null;}
 }
});
