import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { isSquidReturnerCeiling } from '../runtime/movement.mjs';
import { stepGroundVelocity } from '../runtime/movement-physics.mjs';
import { fixture } from './source-fixture.mjs';

const source = adaptBuildSource('src/game/physics.js', fs.readFileSync(new URL('../../../inkwave-public/src/game/physics.js', import.meta.url), 'utf8'));
const { Physics, makeContacts } = new Function('THREE', source.replace(/^import .*;$/gm, '').replace(/export /g, '') + '\nreturn {Physics,makeContacts};')(THREE);
function ceilingWorld(T, height=1.6, returner=true, halfHeight=.15) {
  const block={id:0,solid:true,squidReturner:returner,center:new T.Vector3(0,height,0),half:new T.Vector3(2,halfHeight,2),
    axes:[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)],faces:[-1,-1,-1,-1,-1,-1],
    aabbMin:new T.Vector3(-2,height-halfHeight,-2),aabbMax:new T.Vector3(2,height+halfHeight,2)};
  return {blocks:[block],faces:[],queryBlocks(_x,_z,_x2,_z2,out){out.length=0;out.push(0);return out;}};
}
for (const method of ['collideBody','collideCapsule']) test(`production ${method} publishes ceiling identity and clears it on the next empty query`,()=>{
  const level=ceilingWorld(THREE),p=new Physics(level),c=makeContacts();
  assert.equal(c.ceilingBlock,-1);
  const resolve=()=>method==='collideBody'?p.collideBody(new THREE.Vector3(),.35,.3,1.65,c):p.collideCapsule(new THREE.Vector3(),.35,1.65,c);
  resolve();assert.equal(c.ceiling,true);assert.equal(c.ceilingBlock,0);
  assert.equal(isSquidReturnerCeiling({contacts:c},p),true);
  level.blocks[0].squidReturner=false;resolve();
  assert.equal(c.ceiling,true);assert.equal(c.ceilingBlock,0);assert.equal(isSquidReturnerCeiling({contacts:c},p),false);
  level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};resolve();
  assert.equal(c.ceiling,false);assert.equal(c.ceilingBlock,-1);
});
test('production Actor climb cancels armor only after a real Squid Returner body collision',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true});
  for(const returner of [false,true]){
    const a=f.make();a.form='squid';a.intent.squid=true;a.submerged=true;
    a.vel.set(0,0,11.52);a.intent.move.set(0,0,-1);
    assert.equal(f.beforeActions(a,1/60,true),true);
    const shield=a.s3.actions.armor;assert.ok(shield?.armorTime>0);
    // The wide swimming terrain capsule has a lifted spherical axis. Use a
    // low, thick ceiling whose bottom reaches the actor's broad-phase height.
    const radius=f.PLAYER.s3SwimTerrainRadiusRaw*f.PLAYER.s3TerrainDistanceScale;
    const level=ceilingWorld(f.THREE,f.PLAYER.squidBodyLift+radius+.25,returner,.7);
    f.G.physics=new f.Physics(level);a.pos.set(0,0,0);a.vel.set(0,6,0);a.climbing=true;
    delete a._integrate;
    a._integrate(1/60,true,false);
    assert.equal(a.contacts.ceiling,true);assert.equal(a.contacts.ceilingBlock,0);assert.equal(a.vel.y,0);
    if(returner){assert.equal(a.s3.actions.armor,null);assert.equal(shield.armorTime,0);}
    else {assert.equal(a.s3.actions.armor,shield);assert.ok(shield.armorTime>0);}
  }
});
test('zero ground acceleration preserves velocity during start, stop, turn and zero target at every cadence',()=>{
  for(const hz of [30,60,120])for(const [x,z,speed] of [[1,0,5.76],[0,0,5.76],[-1,-1,5.76],[0,1,0]]){
    const v={x:2,z:3};for(let n=0;n<hz;n++)stepGroundVelocity(v,x,z,speed,0,1/hz);
    assert.deepEqual(v,{x:2,z:3});
  }
  const positive={x:0,z:0};stepGroundVelocity(positive,0,1,5.76,36,1/60);
  assert.equal(positive.z,.6);assert.equal(positive.x,0);
});
