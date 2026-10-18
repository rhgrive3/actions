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
for(const [speed,x,z] of [[6,0,1],[6,1,0],[6,-1,0],[0,0,1]])for(let i=0;i<hz/2;i++){step(speed,x,z);assert.deepEqual(Array.from(ch.u.uWig.value.toArray()),[0,0,0],'source bone motion is not doubled by shader wiggle');assert([...ch.squid.pivot.position.toArray(),...ch.squid.pivot.quaternion.toArray(),...ch.squid.pivot.scale.toArray()].every(Number.isFinite));checks++;}
a.form='kid';a.submerged=false;for(let i=0;i<hz/2;i++)step(2);assert.equal(ch.form,'kid');
}
ch.sourceMotion.setEnabled(false);a.form='squid';a.submerged=true;for(let i=0;i<hz;i++)step(6);assert(ch.u.uWig.value.x>0,'native fallback still has its original tentacle motion');f.reset();}
console.log('SQUID_SOURCE_PRESENTATION '+JSON.stringify({frames,checks,lods:3,rates:[30,60,120]}));
});
