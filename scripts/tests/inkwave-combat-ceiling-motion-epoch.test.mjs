import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../patches/splatoon3/tests/source-fixture.mjs';

test('native component steps renew remote motion before sweeping the real emitted round',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { beginActorMotionTick, coherentMotionStart } from './patches/splatoon3/runtime/actor-motion.mjs';"});
 const {G}=f;
 G.fx=new Proxy({},{get:()=>()=>{}});G.audio=G.fx;
 // No terrain occlusion in this actor-motion counterexample. Actor collision,
 // InkFlight travel, sourced hurtboxes and 36 damage stay production-composed.
 G.physics={segment(_a,_b,h){h.hit=false;return h;},raycast(_a,_b,_c,h){h.hit=false;return h;},los:()=>true};
 const shooter=f.make('shooter'),victim=f.make('shooter');shooter.team=1;victim.team=0;
 shooter.pos.set(12.5,0,0);shooter.character.root.position.copy(shooter.pos);
 shooter.aimDir.set(0,0,1);shooter.aimPoint.set(12.5,1.05,2);
 victim.pos.set(.11,0,-27.2);victim.remote=true;victim.owner='host';victim.nid=0;victim.net={ready:true,tp:1};
 f.beginActorMotionTick(G.actors);
 // The browser freezes after opening. Owner-only QA relocation then reaches
 // this proxy without a new netTp; its old opening record still passes the
 // native coherence checks until the next simulation tick captures origins.
 victim.pos.set(12.5,0,2);victim.character.root.position.copy(victim.pos);
 assert.equal(f.coherentMotionStart(victim).z0,-27.2);
 const run=refresh=>{
  victim.hp=100;G.projectiles.clear();
  if(refresh)f.beginActorMotionTick(G.actors);
  G.projectiles.fireShooter(shooter,shooter.weapon,0);
  const p=G.projectiles.list.at(-1);
  // Exact observed native launch in the failed two-browser run. This is a
  // fixed test input, not a new source calibration or a runtime aim override.
  p.pos.set(12.340957637144417,.9180332072235451,.5454774406011296);
  p.prev.copy(p.pos);p.start.copy(p.pos);
  p.vel.set(14.720831210501547,12.212802290470623,134.60782365332932);
  G.projectiles.update(1/60);
  return {hp:victim.hp,remaining:G.projectiles.list.length};
 };
 assert.deepEqual(run(false),{hp:100,remaining:1},'omitting the tick origin reproduces the native miss');
 assert.deepEqual(run(true),{hp:64,remaining:0},'the native tick origin restores exactly one real 36 contact');
 assert.equal(f.coherentMotionStart(victim).z0,2);
});
