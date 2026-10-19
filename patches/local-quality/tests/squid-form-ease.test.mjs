import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptSquidFormEase} from '../squid-form-ease-adapter.mjs';import {replaceOnce} from '../adapter.mjs';
const smooth5=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
test('return adapter fails closed and touches only source/render presentation',()=>{
 for(const rel of ['src/game/character.js','src/game/motion/source-controller.js']){const s=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'),out=adaptSquidFormEase(rel,s,replaceOnce);assert.notEqual(s,out);assert.throws(()=>adaptSquidFormEase(rel,out,replaceOnce),/conflict/);assert.throws(()=>adaptSquidFormEase(rel,'',replaceOnce),/conflict/);}
 assert.equal(adaptSquidFormEase('src/game/actor.js','actor unchanged',replaceOnce),'actor unchanged');
});
test('actual source/fallback return is continuous at30/60/120Hz with original clip speed and safe reversal',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});const summaries=[];
 for(const source of [true,false])for(const hz of [30,60,120]){
  const a=await f.make(),c=a.character;c.onEvent=null;if(!source)c.sourceMotion.setEnabled(false);const dt=1/hz;
  const step=(d=dt)=>{f.G.time+=d;a._finishFrame(d);c.root.updateMatrixWorld(true);};
  const points=()=>{const mesh=c.squid.body,g=mesh.geometry,p=new f.THREE.Vector3();return [0,Math.floor(g.attributes.position.count/3),g.attributes.position.count-1].flatMap(i=>mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld).toArray());};
  const near=(x,y,label)=>assert(Math.max(...x.map((v,i)=>Math.abs(v-y[i])))<1e-7,label);
  for(let i=0;i<hz;i++)step();a.form='squid';a.submerged=true;for(let i=0;i<hz;i++)step();assert(c.sqScale>.999);
  const initialPoints=points();a.form='kid';a.submerged=false;let previous=0,maxDelta=0;const values=[];
  for(let i=0;i<Math.ceil(hz*.3);i++){step();if(source&&i===0)near(points(),initialPoints,'first return frame preserves rendered squid pose and pivot');assert.equal(a.form,'kid','gameplay form remains immediate');const t=source?c.sourceMotion.formTime:c.formT;const expected=smooth5(t/.15);assert(Math.abs(c.kidScale-expected)<1e-8,JSON.stringify({source,hz,t,actual:c.kidScale,expected}));assert(c.kidScale>=previous-1e-10);maxDelta=Math.max(maxDelta,c.kidScale-previous);previous=c.kidScale;assert(Math.abs(c.kidScale+c.sqScale-1)<1e-8);if(source&&t<.15-1e-8){assert.equal(c.sourceMotion.debug.squid.name,'Sqd_ToHuman');assert(Math.abs(c.sourceMotion.debug.squid.frame-Math.min(t*60,2))<1e-8,'authored speed then terminal hold');}values.push({t,k:c.kidScale});}
  assert.equal(c.kidScale,1);assert.equal(c.sqScale,0);assert(maxDelta<.5,JSON.stringify({source,hz,maxDelta}));
  // A partial return reverses from the displayed state, including zero-time toggles.
  a.form='squid';a.submerged=true;for(let i=0;i<hz;i++)step();a.form='kid';a.submerged=false;step();step();const before=[c.kidScale,c.sqScale],beforePoints=points();a.form='squid';a.submerged=true;step(0);assert(Math.abs(c.kidScale-before[0])<1e-8,'reverse kid continuity');assert(Math.abs(c.sqScale-before[1])<1e-8,'reverse squid continuity');if(source)near(points(),beforePoints,'reverse actual rendered squid continuity');a.form='kid';a.submerged=false;step(0);assert(Math.abs(c.kidScale-before[0])<1e-8,'double reverse continuity');if(source)near(points(),beforePoints,'double reverse actual rendered squid continuity');for(let i=0;i<hz;i++)step();assert.equal(c.kidScale,1);assert.equal(c.sqScale,0);
  summaries.push({source,hz,maxDelta});f.reset();
 }
 console.log('SQUID_FORM_EASE '+JSON.stringify(summaries));
});
test('actual incoming curve keeps authored duration/rate and symmetric rapid reversals at30/60/120Hz',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});const summaries=[];
 for(const source of[true,false])for(const hz of[30,60,120]){
  const a=await f.make(),c=a.character;c.onEvent=null;if(!source)c.sourceMotion.setEnabled(false);const dt=1/hz;const step=(d=dt)=>{f.G.time+=d;a._finishFrame(d);c.root.updateMatrixWorld(true);};
  const squidPoints=()=>{const m=c.squid.body,p=new f.THREE.Vector3(),n=m.geometry.attributes.position.count;return[0,Math.floor(n/3),n-1].flatMap(i=>m.getVertexPosition(i,p).applyMatrix4(m.matrixWorld).toArray());};
  const near=(x,y,label)=>assert(Math.max(...x.map((v,i)=>Math.abs(v-y[i])))<1e-7,label);
  for(let i=0;i<hz;i++)step();const humanBefore=c.skeleton.bones.flatMap(b=>b.matrixWorld.elements.slice());a.form='squid';a.submerged=true;step(0);if(source)near(c.skeleton.bones.flatMap(b=>b.matrixWorld.elements.slice()),humanBefore,'first dive frame preserves visible human pose');let previous=1,maxDelta=0;
  for(let i=0;i<Math.ceil(hz*.3);i++){step();const t=source?c.sourceMotion.formTime:c.formT,duration=source?10/60:.1;assert.equal(a.form,'squid');if(source)assert.equal(c.sourceMotion.formDuration,10/60);const expected=1-smooth5(t/duration);assert(Math.abs(c.kidScale-expected)<1e-8,JSON.stringify({source,hz,t,actual:c.kidScale,expected}));assert(c.kidScale<=previous+1e-10);maxDelta=Math.max(maxDelta,previous-c.kidScale);previous=c.kidScale;assert(Math.abs(c.kidScale+c.sqScale-1)<1e-8);if(source&&c.sqScale>.001&&t<13/60){assert.equal(c.sourceMotion.debug.squid.name,'Sqd_ToSquid');assert(Math.abs(c.sourceMotion.debug.squid.frame-t*60)<1e-8);}}
  assert.equal(c.kidScale,0);assert.equal(c.sqScale,1);assert(maxDelta<.6);
  a.form='kid';a.submerged=false;for(let i=0;i<hz;i++)step();a.form='squid';a.submerged=true;step();step();const before=[c.kidScale,c.sqScale],p=squidPoints(),humanReverse=c.skeleton.bones.flatMap(b=>b.matrixWorld.elements.slice());a.form='kid';a.submerged=false;step(0);near([c.kidScale,c.sqScale],before,'incoming reversal scale continuity');if(source){near(squidPoints(),p,'incoming reversal rendered squid continuity');near(c.skeleton.bones.flatMap(b=>b.matrixWorld.elements.slice()),humanReverse,'incoming reversal visible human continuity');}a.form='squid';a.submerged=true;step(0);near([c.kidScale,c.sqScale],before,'incoming double reverse scale continuity');if(source){near(squidPoints(),p,'incoming double reverse rendered squid continuity');near(c.skeleton.bones.flatMap(b=>b.matrixWorld.elements.slice()),humanReverse,'incoming double reverse visible human continuity');}for(let i=0;i<hz;i++)step();assert.equal(c.kidScale,0);assert.equal(c.sqScale,1);summaries.push({source,hz,maxDelta});f.reset();
 }console.log('SQUID_DIVE_EASE '+JSON.stringify(summaries));
});

test('spawn flight return retains displayed state and safe reversal while ordinary spawn resets',async()=>{
const f=await sourceLoadedActorFixture({random:()=>.4});let cases=0;
for(const source of [true,false])for(const hz of [30,60,120]){
 const a=await f.make(),c=a.character;if(!source)c.sourceMotion.setEnabled(false);c.onEvent=null;
 const step=(dt=1/hz)=>{f.G.time+=dt;a._finishFrame(dt);};
 a.form='squid';for(let i=0;i<hz;i++)step();assert(c.sqScale>.999);
 a.s3.squidSpawn={phase:'flight'};a.form='kid';const before=[c.form,c.formPrev,c.formT,c.kidScale,c.sqScale];c.trigger('spawn');assert.deepEqual([c.form,c.formPrev,c.formT,c.kidScale,c.sqScale],before,'event preserves displayed transition state');
 step();step();const scales=[c.kidScale,c.sqScale];assert(c.kidScale>0&&c.kidScale<1);
 a.form='squid';step(0);assert(Math.abs(c.kidScale-scales[0])<1e-8&&Math.abs(c.sqScale-scales[1])<1e-8,'reverse continuity after spawn trigger');
 a.form='kid';step(0);assert(Math.abs(c.kidScale-scales[0])<1e-8&&Math.abs(c.sqScale-scales[1])<1e-8,'double reverse after spawn trigger');
 for(let i=0;i<hz;i++)step();assert.equal(c.kidScale,1);assert.equal(c.sqScale,0);
 delete a.s3.squidSpawn;a.form='squid';for(let i=0;i<hz;i++)step();c.trigger('spawn');assert.equal(c.form,'kid');assert.equal(c.formPrev,'kid');assert.equal(c.formT,99);assert.equal(c.kidScale,1);assert.equal(c.sqScale,0,'ordinary spawn still resets');
 cases++;f.reset();
}assert.equal(cases,6);

});

test('actual respawn flight preserves intermediate return at all source modes and rates',async()=>{
const f=await sourceLoadedActorFixture({random:()=>.4});
const receipts=[];
for(const source of [true,false])for(const hz of [30,60,120]){
 Object.assign(f.G.match,{mode:'turf',opts:{},state:'playing',canRespawn:()=>true});
 const a=await f.make(),c=a.character;if(!source)c.sourceMotion.setEnabled(false);a.slot=0;a.alive=false;a.respawn();
 assert.equal(a.s3.squidSpawn.phase,'aim');
 for(let i=0;i<hz/2;i++)f.tick(a,1/hz);
 assert.equal(a.form,'kid');assert(c.kidScale>.999);
 a.intent.fire=true;f.tick(a,1/hz);assert.equal(a.s3.squidSpawn.phase,'flight');assert.equal(a.form,'squid');
 const samples=[],gameplay=[];
 for(let i=0;i<hz+Math.ceil(hz*.3);i++){
  f.tick(a,1/hz);gameplay.push({pos:a.pos.toArray(),vel:a.vel.toArray(),form:a.form,grounded:a.grounded,invuln:a.invuln,phase:a.s3.squidSpawn?.phase,t:a.s3.squidSpawn?.t,armor:a.s3.spawnArmor?{...a.s3.spawnArmor}:null});assert(Number.isFinite(c.kidScale)&&Number.isFinite(c.sqScale));assert(Math.abs(c.kidScale+c.sqScale-1)<1e-7,'complementary render scales');
  if(a.s3.squidSpawn?.phase==='flight'){const s=a.s3.squidSpawn;assert.equal(a.form,s.t/s.duration+1e-10<.82?'squid':'kid');samples.push({t:s.t,k:c.kidScale,q:c.sqScale});}
 }
 assert.equal(a.form,'kid');assert(c.kidScale>.999);assert(c.sqScale<.001);assert(!a.s3.squidSpawn);assert(samples.some(s=>s.q>.999));const continuous=samples.some(s=>s.t>.82&&s.k>0&&s.k<1);assert(continuous,'source and fallback touchdown curve');
 receipts.push({source,hz,continuous,samples,gameplay});f.reset();
}
assert.equal(receipts.length,6);
});
