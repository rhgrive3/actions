import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const state = p => JSON.stringify([p.wid,p.type,p.age,p.delay,p.damage,p.life,p.size,p.radius,p.seed,
  p.pos.toArray(),p.prev.toArray(),p.vel.toArray(),p.catalog?.travel,p.catalog?.bounces]);
test('Explosher glitter stays in its reused bounded batch without changing real flight', async () => {
  const f = await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  for(const id of ['s3-slosher-washtub','s3-slosher-washtub-01']){
    const system=f.G.projectiles;system.clear();f.G.actors.length=0;
    const actor=f.make(id);actor.form='kid';actor.ink=100;actor.intent.fire=true;
    f.tick(actor,3);actor.intent.fire=false;
    for(let i=0;i<90&&!system.list.some(p=>p.delay<=0);i++){system.update(1/60);f.tick(actor);}
    assert(system.list.some(p=>p.delay<=0),id+' has a real birth');
    let positions,sizes;
    for(let i=0;i<16;i++){
      const before=system.list.map(state);system._draw();
      assert.deepEqual(system.list.map(state),before,'render does not edit physical state');
      const r=system._s3Shapes,n=system.s3ShapeCounts.sparkles;
      assert(n>0&&n<=28*system.list.filter(p=>p.delay<=0&&p.s3Shape==='explosher').length);
      if(positions){assert.equal(r.sparkPos.array,positions);assert.equal(r.sparkSize.array,sizes);}
      positions=r.sparkPos.array;sizes=r.sparkSize.array;
      for(let j=0;j<n;j++){assert(Number.isFinite(positions[j*3]+positions[j*3+1]+positions[j*3+2]));assert(sizes[j]>=0&&sizes[j]<=.110001);}
      const same=Array.from(positions.subarray(0,n*3));system._draw();
      assert.deepEqual(Array.from(positions.subarray(0,n*3)),same,'same clock does not advance sparkle lifetime');
      system.update(1/60);
    }
    system.clear();system._draw();assert.equal(system.s3ShapeCounts.sparkles,0,'no retained glitter after retirement/clear');
  }
});
