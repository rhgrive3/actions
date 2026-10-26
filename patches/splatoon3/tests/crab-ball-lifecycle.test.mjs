import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {Match} from './inkwave-public/src/game/match.js';"});

function world(){
  const {G,THREE}=f;G.projectiles.clear();G.scene=new THREE.Scene();G.actors=[];G.mode='match';G.time=0;
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
    single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
  G.physics=new f.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};
  const match=new f.Match({duration:180});match.state='playing';G.match=match;match.actors=G.actors;
  return match;
}
function roll(){
  const actor=f.make();actor.weapon={...actor.weapon,special:'crabTank',specialCost:100};actor.special=100;
  actor._startSpecial();actor.intent.squid=true;actor._updateSpecial(1/60);
  const state=actor._s3AllSpecialState,mesh=state.ballMesh,disposed={geometry:0,material:0};
  assert.ok(mesh);assert.equal(mesh.parent,f.G.scene);
  mesh.geometry.addEventListener('dispose',()=>disposed.geometry++);
  mesh.material.addEventListener('dispose',()=>disposed.material++);
  return {actor,state,mesh,disposed};
}
function released(ball){
  assert.ok(ball.mesh.parent===null,'retired shell leaves the scene');assert.ok(ball.state.ballMesh===null,'action releases its shell');
  assert.deepEqual(ball.disposed,{geometry:1,material:1});
}

test('repeated same-stage Match retirement releases rolling shells and GPU resources exactly once',()=>{
  for(let i=0;i<6;i++){
    const match=world(),ball=roll();match.dispose();f.G.projectiles.clear();released(ball);
    assert.equal(f.G.scene.children.length,0);
    f.emit('match:dispose',{match});released(ball);
  }
});
test('removing one Actor releases only its shell and leaves the live action unchanged',()=>{
  const match=world(),removed=roll(),live=roll();
  match.removeActor(removed.actor);released(removed);
  assert.equal(live.mesh.parent,f.G.scene);assert.deepEqual(live.disposed,{geometry:0,material:0});
  assert.equal(live.actor.specialActive.id,'crabTank');
  live.actor.intent.squid=false;live.actor._updateSpecial(1/60);released(live);
  match.dispose();f.G.projectiles.clear();released(removed);released(live);
});
