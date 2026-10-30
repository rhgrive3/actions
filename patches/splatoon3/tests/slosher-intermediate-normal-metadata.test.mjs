import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
test('legacy Slosher normal flight preserves separate source drawing and collision metadata',async()=>{
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:"export {installSlosherIntermediatePaint} from './patches/splatoon3/runtime/slosher-intermediate-paint.mjs';"});
f.installSlosherIntermediatePaint(f,f.profile);
const {G}=f,a=f.make('slosher');G.physics.level=null;G.physics.segment=(_a,_b,h)=>{h.hit=false;return h};G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h};
a.pos.set(0,20,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,21.05,40);a.vel.set(0,0,0);
G.projectiles.fireSlosh(a,a.weapon);
const ps=G.projectiles.list.filter(p=>p.type==='slosh');console.log(JSON.stringify({weaponId:a.weapon.id,sourceActor:a.weapon.sourceActor??null,sourceMainActor:a.weapon.sourceMainActor,catalog:!!a.weapon.catalogRecord,projectiles:ps.length}));
const p=ps.find(p=>p.fidelitySloshIndex===3&&p.fidelitySloshUnit?.SplashAndSplashWallHitSpawnPrm?.SplashParam?.length);assert(p,'actual legacy weapon produces source splash owner');assert(!p.catalog);

for(let i=0;i<120&&!G.projectiles._s3SplashDrops?.length;i++){if(G.projectiles._step(p,1/60)){console.log(JSON.stringify({deadAt:i,age:p.age,pos:p.pos,travel:p.s3SloshIntermediateTravel,count:p.s3SloshIntermediateCount}));break;}}
const d=G.projectiles._s3SplashDrops?.[0];assert(d,'normal flight releases shared falling drop');console.log(JSON.stringify({draw:d.drawRadius??null,sourceActor:d.sourceActor??null,paint:d.radius,field:d.spec.fieldRadius??null,gravity:d.spec.gravity,pos:[d.pos.x,d.pos.y,d.pos.z],vel:[d.vel.x,d.vel.y,d.vel.z]}));
assert.equal(d.drawRadius,.3);assert.equal(d.radius,.7);assert.equal(d.sourceActor,'WeaponSlosherStrong');assert.equal(d.spec.fieldRadius,.15);assert.equal(d.spec.gravity,57.6);assert.deepEqual([d.vel.x,d.vel.y,d.vel.z],[0,0,0]);
});
