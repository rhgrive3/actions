import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { sweepLevelSphere } from '../../../inkwave-public/src/game/inkCollision.js';
import { adaptChargerFieldCollision } from '../charger-field-adapter.mjs';
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const level = {
  blocks: [{id:0,solid:true,grate:false,center:V(0,0,0),half:V(1,1,1),
    axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]}],
  faces:[],queryBlocks(_x,_z,_a,_b,ids){ids.length=0;ids.push(0);return ids;}
};
const hit = ()=>({point:V(0,0,0),normal:V(0,0,0),hit:false});
test('0.02 charger field envelope admits grazing contact but narrower 0.01 misses',()=>{
  const from=V(-3,0,1.015),to=V(3,0,1.015);
  assert.equal(sweepLevelSphere(level,from,to,.02,hit()).hit,true);
  assert.equal(sweepLevelSphere(level,from,to,.01,hit()).hit,false);
  level.blocks[0].grate=true;
  assert.equal(sweepLevelSphere(level,from,to,.02,hit(),true).hit,false);
  level.blocks[0].grate=false;
});
test('S3 field radius is separate from player hit radius',()=>{
  const p=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url)));
  assert.equal(p.weapons.charger.fieldCollisionRadius,.02);
  assert.ok(p.weapons.charger.fieldCollisionRadius < p.weapons.charger.impactPaint.full);
});
test('only charger source ray anchor is replaced once',()=>{
  const src='    const hit = G.physics.raycast(m, dir, range, _hit, true);';
  const once=(s,o,n)=>{if(s.split(o).length!==2)throw Error('anchor');return s.replace(o,n);};
  const next=adaptChargerFieldCollision('src/game/weapons.js',src,once);
  assert.match(next,/fieldRadius/);
  assert.match(next,/inkFlight.world/);
  assert.equal(adaptChargerFieldCollision('src/game/player.js',src,once),src);
  assert.throws(()=>adaptChargerFieldCollision('src/game/weapons.js',src+'\n'+src,once),/anchor/);
});
