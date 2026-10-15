import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

test('native bomb catch-up preserves every owner tick and final transform with one Euler notification per step',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5,
  extraExports:"import {Projectiles as NativeProjectiles} from './inkwave-public/src/game/weapons.js'; export const nativeBombUpdate=NativeProjectiles.prototype._updateBombs;"});
 f.G.scene=new f.THREE.Scene();f.G.camera={position:new f.THREE.Vector3()};f.G.projectiles=new f.Projectiles(f.G.scene);
 f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});f.G.physics=new f.Physics(f.G.level);
 const a=f.make();Object.assign(a,{remote:true,owner:'peer',nid:37});a.weapon={...a.weapon,sub:'bomb'};
 const P=f.G.projectiles;
 try{
  for(const hz of [30,60,120])for(const order of ['XYZ','XZY','YXZ','YZX','ZXY','ZYX'])for(const angle of [-Math.PI,0,1e6]){
   const b=P.ghostBomb(a,'bomb',0,1000,0,1,2,3);assert.ok(b);
   b.mesh.rotation.set(angle,.713,-angle,order);b.spin.set(-3,1.7,0);
   const reference=new f.THREE.Object3D();reference.rotation.copy(b.mesh.rotation);
   let notifications=0;const onChange=b.mesh.rotation._onChangeCallback;
   b.mesh.rotation._onChangeCallback=()=>{notifications++;onChange();};
   b._netPeer={sim:80,tr:1000,lastTs:1000};b._netBornTick=0;b._netSteps=0;
   f.nativeBombUpdate.call(P,1/hz);
   assert.equal(b._netSteps,81,'no native physics step is deferred or skipped');
   let expectedAge=0;for(let tick=0;tick<81;tick++){expectedAge+=1/60;reference.rotation.x+=b.spin.x*(1/60);reference.rotation.z+=b.spin.y*(1/60);}
   assert.equal(b.age,expectedAge);assert.equal(b.fuse,-1);
   assert.deepEqual(b.mesh.rotation.toArray(),reference.rotation.toArray());
   assert.deepEqual(b.mesh.quaternion.toArray(),reference.quaternion.toArray());
   assert.equal(notifications,81,'intermediate quaternion recomputation is redundant');
   P.clear();
  }
 }finally{P.clear();}
});
