import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup(id) {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {installMainWeaponCatalogRuntime, releaseCatalogBirth} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  f.G.physics.level=null;f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  f.G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h;};
  const a=f.make(id);a.form='kid';a.intent.fire=true;f.tick(a,50);a.intent.fire=false;
  // Admit the real delayed glob births before the isolated contact sweep
  // rewinds positions and velocities. No physics/paint owner is bypassed.
  for (const p of f.G.projectiles.list.filter(p=>p.catalog?.birthPending))
    assert.equal(f.releaseCatalogBirth(f.G.projectiles,p,f.G),true,'fixture must admit queued native birth');
  return {f,a,rounds:f.G.projectiles.list.filter(p=>p.catalog)};
}
function reset(p,speed=600) {
  p.pos.set(0,8,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,speed);
  p.age=0;p.life=2;
  Object.assign(p.catalog,{travel:0,carry:0,phase:0,nextSplash:1,dropCount:0,range:100});
  Object.assign(p.catalog.descriptor,{m:{},splashSpacing:1,splashCount:8});
}

for(const id of ['s3-slosher-launcher','s3-slosher-bathtub']){
  for(const limit of ['free','wall','range','life','ghost'])test(id+' falling splash releases are clipped before '+limit,async()=>{
    const {f,rounds}=await setup(id),p=rounds.find(p=>p.catalog.descriptor.unit===0);assert.ok(p);
    reset(p);
    if(limit==='range')p.catalog.range=2.5;
    if(limit==='life')p.life=1/240;
    if(limit==='ghost')p.ghost=true;
    if(limit==='wall')f.G.physics.segment=(from,to,h)=>{
      h.hit=true;h.dist=2.5;h.point.copy(from).lerp(to,.25);h.normal.set(0,0,-1);h.face=0;return h;
    };
    f.G.projectiles._step(p,1/60);
    const drops=f.G.projectiles._s3SplashDrops||[];
    assert.deepEqual(Array.from(drops,d=>d.releaseZ),limit==='ghost'?[]:limit==='free'?[1,2,3,4,5,6,7,8]:[1,2]);
    assert.ok(drops.every(d=>d.drawRadius===.2&&d.sourceActor===p.catalog.r.sourceActor));
  });
}

test('Sloshing Machine already has an airborne 38-damage outer attack beyond its direct core',async()=>{
  const {f,a,rounds}=await setup('s3-slosher-launcher');
  const p=rounds.find(p=>p.catalog.descriptor.unit===1&&p.catalog.index===0);assert.ok(p);
  reset(p,60);p.age=5/60;
  const enemy=f.make('shooter');enemy.team=1;enemy.pos.set(.9,7.5,.5);
  f.G.actors=[a,enemy];const hits=[];f.G.projectiles.applyHit=(_a,target,damage)=>hits.push({target,damage});
  assert.equal(f.G.projectiles._step(p,1/60),true);
  assert.equal(hits.length,1);assert.equal(hits[0].target,enemy);assert.equal(hits[0].damage,38);
});

test('all four airborne Bloblobber bubbles own independent 32-damage attacks',async()=>{
  const {f,a,rounds}=await setup('s3-slosher-bathtub');
  const volley=rounds.slice(0,4);assert.equal(volley.length,4);
  const enemy=f.make('shooter');enemy.team=1;enemy.pos.set(0,7.5,.5);
  f.G.actors=[a,enemy];const hits=[];f.G.projectiles.applyHit=(_a,_b,d)=>hits.push(d);
  for(const p of volley){reset(p,60);p.age=5/60;assert.equal(f.G.projectiles._step(p,1/60),true);}
  assert.deepEqual(hits,[32,32,32,32]);
});
