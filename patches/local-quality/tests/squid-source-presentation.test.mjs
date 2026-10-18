import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptSquidMotionBinding} from '../squid-motion-binding-adapter.mjs';import {replaceOnce} from '../adapter.mjs';
const source=()=>fs.readFileSync(new URL('../../../inkwave-public/src/game/motion/squid-rig.js',import.meta.url),'utf8');
test('source squid binding adapter is fail-closed and leaves other source owners untouched',()=>{const s=source(),out=adaptSquidMotionBinding('src/game/motion/squid-rig.js',s,replaceOnce);assert.notEqual(s,out);assert.throws(()=>adaptSquidMotionBinding('src/game/motion/squid-rig.js',out,replaceOnce),/conflict/);assert.throws(()=>adaptSquidMotionBinding('src/game/motion/squid-rig.js','',replaceOnce),/conflict/);assert.equal(adaptSquidMotionBinding('src/game/actor.js','unchanged',replaceOnce),'unchanged');const apply=out.slice(out.indexOf(' apply(pose,'),out.indexOf('\n dispose(){'));assert(!/new THREE\.(Vector3|Euler)/.test(apply),'scratch vectors/angles are allocated once per rig');});
test('real loaded squid keeps common orientation, correct long chains and sole deformation owner at every LOD/rate',async()=>{
const f=await sourceLoadedActorFixture({random:()=>.4});let frames=0,checks=0;
for(const hz of [30,60,120]){const a=await f.make(),ch=a.character;ch.onEvent=null;const step=(speed=0,x=0,z=1)=>{a.vel.set(x*speed,0,z*speed);a.pos.addScaledVector(a.vel,1/hz);f.G.time+=1/hz;a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);frames++;};
for(let i=0;i<hz;i++)step();
for(const lod of ['hero','game','far']){ch.setLod(lod);a.form='squid';a.submerged=true;
for(let i=0;i<hz;i++)step(6);assert(ch.sourceMotion.active);const rig=ch.sourceMotion.squidRig;
assert(rig.root.quaternion.angleTo(rig.oldMeshes.body.quaternion)<1e-10,'source skeleton preserves authored body/eye half-turn');
const p=ch.squid.body.geometry,ex=p.attributes.aEx,col=p.attributes.color,ix=p.attributes.skinIndex,w=p.attributes.skinWeight;const arms=new Set();
for(let i=0;i<ex.count;i++)if(ex.getX(i)>.5&&p.attributes.uv.getX(i)>.8){const k=Math.round(col.getZ(i)*10)%10;for(let j=0;j<4;j++)if(w.array[i*4+j]>.05){const name=rig.bank.bones[ix.array[i*4+j]].name;if(name.startsWith('Sqd_arm')){assert(k===0||k===9,'short arms do not take the long feeler chain');arms.add(k);}if(k===0||k===9)assert(name.startsWith('Sqd_arm'),JSON.stringify({lod,k,name,u:p.attributes.uv.getX(i),phase:col.getZ(i),part:ex.getX(i),w:w.array[i*4+j]}));}}
assert.deepEqual([...arms].sort(),[0,9]);
// The eye band is a surface overlay: it must deform with the mantle at the same y.
const band=ch.squid.dark.geometry,headIds=['Sqd_head0','Sqd_head1','Sqd_head2'].map(n=>rig.index[n]);
const headY=headIds.map(id=>new f.THREE.Matrix4().multiplyMatrices(rig.map,rig.bank.rest.world[id]).elements[13]);
for(let i=0;i<band.attributes.position.count;i++){const y=band.attributes.position.getY(i),k=y<headY[1]?0:1,t=Math.max(0,Math.min(1,(y-headY[k])/(headY[k+1]-headY[k])));assert.equal(band.attributes.skinIndex.array[i*4],headIds[k]);assert.equal(band.attributes.skinIndex.array[i*4+1],headIds[k+1]);assert(Math.abs(band.attributes.skinWeight.array[i*4]-(1-t))<1e-7);assert(Math.abs(band.attributes.skinWeight.array[i*4+1]-t)<1e-7);}

for(const [speed,x,z] of [[6,0,1],[6,1,0],[6,-1,0],[0,0,1]])for(let i=0;i<hz/2;i++){step(speed,x,z);assert.deepEqual(Array.from(ch.u.uWig.value.toArray()),[0,0,0],'source bone motion is not doubled by shader wiggle');assert([...ch.squid.pivot.position.toArray(),...ch.squid.pivot.quaternion.toArray(),...ch.squid.pivot.scale.toArray()].every(Number.isFinite));checks++;}
a.form='kid';a.submerged=false;for(let i=0;i<hz/2;i++)step(2);assert.equal(ch.form,'kid');
}
ch.sourceMotion.setEnabled(false);a.form='squid';a.submerged=true;for(let i=0;i<hz;i++)step(6);assert(ch.u.uWig.value.x>0,'native fallback still has its original tentacle motion');f.reset();}
console.log('SQUID_SOURCE_PRESENTATION '+JSON.stringify({frames,checks,lods:3,rates:[30,60,120]}));
});

test('source dry and airborne squid preserve authored S3 axes and source jump clip ownership',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});
 for(const hz of [30,60,120])for(const lod of ['hero','game','far']){
  const a=await f.make(),ch=a.character;ch.onEvent=null;ch.setLod(lod);a.form='squid';a.submerged=false;
  const tick=(x=0,y=0)=>{a.vel.set(x,y,0);a.pos.addScaledVector(a.vel,1/hz);f.G.time+=1/hz;a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);};
  for(let i=0;i<hz;i++)tick();
  const rig=ch.sourceMotion.squidRig,expected=new f.THREE.Quaternion().setFromEuler(new f.THREE.Euler(Math.PI/2-.52,ch.sourceMotion.squidYaw,0,'YXZ'));
  assert(ch.squid.pivot.quaternion.angleTo(expected)<1e-7,'grounded source dry uses existing S3-look axis');
  a.grounded=a.ground.hit=false;
  for(let i=0;i<hz/5;i++){tick(0,4);assert.equal(ch.sourceMotion.debug.squid.name,'Sqd_Jump');assert(ch.squid.pivot.quaternion.angleTo(expected)<1e-7,'slow dry jump retains dry axis');}
  for(let i=0;i<hz/2;i++)tick(6,2);
  const motion=ch.sourceMotion;expected.setFromEuler(new f.THREE.Euler(Math.PI/2-Math.atan2(motion.velocityY,Math.max(motion.speed,.5)),motion.squidYaw,0,'YXZ'));
  assert(ch.squid.pivot.quaternion.angleTo(expected)<1e-7,JSON.stringify({kind:'fast airborne dry axis',form:ch.form,grounded:ch.grounded,speed:motion.speed,vy:motion.velocityY,yaw:motion.squidYaw,actual:ch.squid.pivot.quaternion.toArray(),expected:expected.toArray(),angle:ch.squid.pivot.quaternion.angleTo(expected)}));
  assert.equal(motion.debug.squid.name,'Sqd_Jump');assert.equal(rig.character,ch);
  f.reset();
 }
});
