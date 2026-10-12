import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const extraExports =
  "export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; " +
  "export { MAIN_WEAPON_CATALOG } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';";

test('all seven added Rollers/Brushes paint grounded continuous strokes with a steep-down reticle', async () => {
  const f = await fixture({ fullRuntime:true, productionComposition:true, realProjectiles:true, extraExports });
  f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
  const records=f.MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy && (r.family==='roller'||r.family==='brush'));
  assert.equal(records.length,7);
  const landed=[];
  f.G.physics.raycast=(from, _dir, _dist, hit)=>{
    hit.hit=from.y>0.01; hit.face=0;
    hit.normal.set(0,1,0);hit.point.set(from.x,0,from.z);return hit;
  };
  f.G.paint.splat=(point,radius,team,opts)=>{
    landed.push({x:point.x,z:point.z,radius,team,kind:opts.kind});
    return 0;
  };
  for(const record of records){
    f.G.actors.length=0;landed.length=0;
    const a=f.make(record.id),runner=a.weaponRunner;
    a.pos.set(0,0,0);a.yaw=0;a.grounded=true;a.form='kid';a.ink=100;
    a.aimDir.set(0,-1,0.001).normalize();
    const sourceRadius=record.parameters.BodyParam?.PaintParam?.WidthHalfMax;
    assert.ok(sourceRadius>0,record.sourceRow);
    runner.cooldown=0;
    runner.update(1/60,{fire:true,firePressed:false,sub:false});
    assert.equal(landed.length,1,record.sourceRow+' paints first held frame');
    assert.equal(landed[0].radius,sourceRadius,record.sourceRow+' sourced WidthHalfMax');
    assert.ok(landed[0].z>0.4,record.sourceRow+' paints in front of roller, not below down-aimed reticle');
    landed.length=0;
    a.pos.z+=sourceRadius*1.6;runner.cooldown=0;
    runner.update(1/60,{fire:true,firePressed:false,sub:false});
    assert.ok(landed.length>1&&landed.length<=6,record.sourceRow+' fills long-frame motion with capped stamps');
    assert.ok(landed.every((v,i)=>i===0||v.z>landed[i-1].z),record.sourceRow+' ordered stamp spacing');
    landed.length=0;
    runner.update(1/60,{fire:false,firePressed:false,sub:false});
    a.pos.z+=10;
    runner.cooldown=0;runner.update(1/60,{fire:true,firePressed:false,sub:false});
    assert.equal(landed.length,1,record.sourceRow+' released rolling must not bridge a stale gap');
    assert.ok(Number.isFinite(a.ink)&&a.ink>=0,record.sourceRow+' paid ink remains valid');
  }
});
