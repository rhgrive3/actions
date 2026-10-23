import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

// Actual composed Actor, source banks, rig and Flow meshes on the fixture's
// analytic own-ink plane. CPU geometry proof, not a GPU pixel acceptance claim.
import {withoutFlowSurfaceFixes as baseline} from './flow-surface-negative.mjs';
async function setup(api) {
  const {G,THREE,Actor,Character}=api;G.actors=[];G.time=0;
  const actor=new Actor({team:0,name:'flow-render',weapon:'dualies',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  const victim=new Actor({team:1,name:'flow-award-victim',CharacterClass:Character});
  const ch=actor.character;ch.actor=actor;victim.character.actor=victim;
  G.scene.add(ch.root);G.actors.push(actor,victim);actor.spawnAt(new THREE.Vector3(),0);victim.pos.set(8,0,8);ch.setLod('game');
  await Promise.all([ch.sourceMotion.ready,victim.character.sourceMotion.ready]);
  assert.equal(ch.sourceMotion.status,'ready');
  return {api,actor,victim,ch};
}
function step(r,dt) {r.api.G.time+=dt;r.actor.anim.time=r.api.G.time;r.actor.update(dt);r.ch.root.updateMatrixWorld(true);}
function gameplay(r) {const a=r.actor;return {pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,form:a.form,flow:{...a.s3.flow}};}
function glints(r) {
  const {THREE}=r.api,mesh=r.ch.root.getObjectByName('s3-flow-glints'),alpha=mesh.geometry.attributes.aFlowAlpha,rows=[];
  for(let i=0;i<mesh.count;i++)if(alpha.getX(i)>.001){
    const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);
    const p=new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(mesh.matrixWorld),size=new THREE.Vector3().setFromMatrixScale(m).x;
    rows.push({alpha:alpha.getX(i),top:p.y+size/2});
  }
  const original=mesh.geometry.drawRange.count;
  mesh.onBeforeRender(null,{overrideMaterial:{}},null,mesh.geometry);
  assert.equal(mesh.geometry.drawRange.count,0,'submerged glints never become override occluders');
  mesh.onBeforeRender(null,{overrideMaterial:null},null,mesh.geometry);
  assert.equal(mesh.geometry.drawRange.count,original,'beauty range returns unchanged');
  return rows;
}
test('source-swim Flow glints stay above the ink surface without changing native gameplay',async()=>{
  const apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,moduleTransform:baseline}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4})]);
  let formerlyBuried=0,compared=0;
  try {for(const hz of [30,60,120]){
    const rigs=await Promise.all(apis.map(setup)),dt=1/hz;
    const advance=seconds=>{for(let i=0;i<Math.round(seconds*hz);i++){rigs.forEach(r=>step(r,dt));assert.equal(JSON.stringify(gameplay(rigs[1])),JSON.stringify(gameplay(rigs[0])));compared++;}};
    advance(.6);
    for(const r of rigs){r.api.emit('turf',{actor:r.actor,area:10000});for(let i=0;i<4&&!r.actor.s3.flow.active;i++){if(!r.victim.alive)r.victim.reset();r.victim.splat(r.actor);}assert.equal(r.actor.s3.flow.active,true);}
    advance(.8);
    for(const r of rigs){r.victim.reset();r.victim.splat(r.actor);}advance(.1);
    for(const r of rigs){r.actor.intent.squid=true;r.actor.intent.move.set(0,0,1);}
    advance(8/60);
    for(const seconds of [0,40/60]){
      advance(seconds);assert.equal(rigs[1].ch.form,'swim');assert.equal(rigs[1].ch.grounded,true);
      const before=glints(rigs[0]),after=glints(rigs[1]);assert.ok(after.length>0,'actual live glint denominator');
      assert.deepEqual(after.map(x=>x.alpha),before.map(x=>x.alpha),'unchanged particle alpha/time');
      if(before.every(x=>x.top<0))formerlyBuried++;
      assert.ok(after.every(x=>x.top>0),'every live billboard reaches above the planar ink surface');
    }
    for(const r of rigs){r.ch.dispose();r.victim.character.dispose();r.api.reset();}
  }}finally{apis.forEach(api=>api.reset());}
  assert.ok(formerlyBuried>0,'negative control exercises the original fully floor-occluded glints');
  console.log(JSON.stringify({scope:'actual composed source-loaded CPU plane, GPU pixel gate remains separate',compared,formerlyBuried,rates:[30,60,120]}));
});
