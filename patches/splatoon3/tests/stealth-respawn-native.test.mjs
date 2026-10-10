// Also runnable on the pre-fix public main with only source-fixture's optional
// export loader copied. No new production module is needed for the negative control.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout, normalizeLoadout } from '../runtime/gear.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function setupDeath(f){
  f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];
  f.G.physics.groundProbe=(_x,_y,_z,_u,_d,_r,h)=>{h.hit=false;return h;};
  const a=f.make(),killer=f.make();killer.team=1;a.s3.loadout=emptyLoadout();
  for(const p of a.s3.loadout){p.main='quickRespawn';p.subs.fill('quickRespawn');}a.setWeapon('shooter');
  return {a,killer};
}
test('native loadout retains clothing Ninja Squid',()=>{
  const l=emptyLoadout();l[1].main='ninjaSquid';assert.equal(normalizeLoadout(l)[1].main,'ninjaSquid');
});
test('native equipped swimming has Ninja Squid speed ratio 0.9',async()=>{
  const f=await fixture(),speeds=[];
  for(const ninja of [false,true]){
    const a=f.make();a.s3.loadout=emptyLoadout();if(ninja)a.s3.loadout[1].main='ninjaSquid';a.setWeapon('shooter');
    a.form='squid';a.submerged=true;a.intent.move.set(0,0,1);
    for(let i=0;i<600;i++)a._horizontal(1/60,true,false);speeds.push(a.vel.z);
  }close(speeds[1]/speeds[0],.9);
});
test('native surface wake at 30 percent swim speed creates no new trail',async()=>{
  const f=await fixture("export { SwimWake } from './inkwave-public/src/fx/swimWake.js';"),a=f.make(),w=new f.SwimWake();
  a.form='squid';a.submerged=true;a.anim.form='swim';a.vel.set(0,0,3.456);f.G.match.actors=[a];
  const vec=n=>({value:Array.from({length:n},()=>new f.THREE.Vector4())});
  const u={uWake:vec(48),uWakeB:vec(4),uSwimH:vec(4),uSwimF:vec(4)};
  for(let i=0;i<60;i++){f.G.time+=1/60;a.pos.z+=3.456/60;w.update(1/60,u,a.pos);}
  assert.equal(w.slots.some(s=>s.pts.length>0),false);close(u.uSwimH.value[0].w,0);
});
test('native maximum Quick Respawn removes four seconds once eligible',async()=>{
  const f=await fixture(),{a,killer}=setupDeath(f);a.splat(killer);const base=a.respawnTimer;a.respawn();a.splat(killer);
  close(base-a.respawnTimer,4);
});
test('native next no-splat life after a kill-life is immediately eligible',async()=>{
  const f=await fixture(),{a,killer}=setupDeath(f);f.emit('splatted',{victim:killer,attacker:a});a.splat(killer);
  const base=a.respawnTimer;a.respawn();a.splat(killer);assert.ok(a.respawnTimer<base);
});
