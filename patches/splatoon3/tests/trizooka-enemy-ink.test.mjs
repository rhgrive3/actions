import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const DT=1/60, near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(special=true, modifiers={}) {
  const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true});
  const a=f.make('shooter'); a.invuln=0; a.hp=100; a.ink=80;
  a.special=a.specialCost(); a.s3.modifiers={...a.s3.modifiers,...modifiers};
  f.G.physics.collideBody=()=>false;
  f.G.physics.groundProbe=(_x,_y,_z,_up,_down,_r,h)=>{h.hit=true;h.y=0;h.face=0;h.normal.set(0,1,0);return h;};
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  let ink=2; f.G.paint.sample=()=>ink;
  a.intent.special=special;
  return {...f,a,surface:v=>{ink=v;},step(){f.tick(a);a.intent.special=false;}};
}
test('#1054 activation and active Trizooka use the ordinary enemy-ink clock exactly once',async()=>{
  const s=await setup(),control=await setup(false);
  for(let i=1;i<=180;i++){
    s.step();control.step();
    near(s.a.hp,100-Math.min(40,i*.3));near(s.a.hp,control.a.hp);
    near(s.a.s3.enemyInkTime,i*DT);near(s.a.damageFromInk,control.a.damageFromInk);
    assert.equal(s.a.specialActive?.id,'trizooka');
  }
});
test('#1054 Trizooka retains equipped grace/rate/cap and fresh surface resets',async()=>{
  const s=await setup();s.a.s3.loadout=emptyLoadout();s.a.s3.loadout[0].subs[0]='inkResistance';s.a.setWeapon('shooter');
  for(let i=0;i<10;i++)s.step();near(s.a.hp,100);
  s.step();near(s.a.hp,99.8);
  for(let i=0;i<240;i++)s.step();near(s.a.hp,100-s.a.s3.modifiers.enemyDamageCap);
  s.surface(0);for(let i=0;i<60;i++)s.step();near(s.a.s3.enemyInkTime,0);
  s.surface(2);const hp=s.a.hp;for(let i=0;i<10;i++)s.step();near(s.a.hp,hp);
});
test('#1054 invulnerability blocks contact damage, not the contact clock',async()=>{
  const s=await setup();s.a.invuln=1;
  for(let i=0;i<30;i++)s.step();near(s.a.hp,100);near(s.a.s3.enemyInkTime,.5);
  s.a.invuln=0;s.step();near(s.a.hp,99.7);
});
test('#1054 off-ink healing runs once and special expiration does not duplicate resources',async()=>{
  const s=await setup();s.surface(0);s.a.hp=50;s.a.lastDamage=99;
  s.step();near(s.a.hp,50+s.profile.resources.regenRate*DT);
  s.step();near(s.a.hp,50+2*s.profile.resources.regenRate*DT);
  s.surface(2);s.a.hp=100;s.a.s3Trizooka.t=s.a.s3Trizooka.duration-DT;
  s.step();assert.equal(s.a.specialActive,null);near(s.a.hp,99.7);
  s.step();near(s.a.hp,99.4);
});
test('#1054 render cadence cannot change enemy-ink damage or the special timer',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const s=await setup(),clock=new FixedClock(),trace=[];
    for(let i=0;i<hz*3;i++)clock.advance(1/hz,()=>{s.step();trace.push([s.a.hp,s.a.s3.enemyInkTime,s.a.s3Trizooka.t]);});
    traces.push(trace);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});


test('#1164 active Trizooka cannot fire after entering unsupported lethal water',async()=>{
  const h=await setup();
  h.a._resolve=()=>{};
  h.step(); // Activate normally on supported ground, before the lethal event.
  assert.equal(h.a.specialActive?.id,'trizooka');
  // Put a legally charged, buffered volley exactly at its fire gate. Without
  // the pre-shot hazard guard, _updateSpecial would emit three rounds first.
  h.a.s3Trizooka.t=6/60;
  h.a.s3Trizooka.armed=true;
  h.a.s3Trizooka.gateAt=0;
  h.a.s3Trizooka.bufferedShot=true;
  h.a.intent.fire=true;
  h.a.pos.y=h.PLAYER.fallDeathY-.4;
  h.a.grounded=false;
  h.G.level.groundHeight=()=>-Infinity;
  const before=h.G.projectiles.list.length, deaths=h.a.stats.deaths;
  h.step();
  assert.equal(h.a.alive,false);
  assert.equal(h.a.hp,0);
  assert.equal(h.a.stats.deaths,deaths+1);
  assert.equal(h.a.specialActive,null);
  assert.equal(h.G.projectiles.list.length,before,'underwater owner cannot emit a pre-death Trizooka volley');
  h.tick(h.a,4);
  assert.equal(h.a.stats.deaths,deaths+1,'no duplicate environmental splat');
});

test('#1164 lethal-water activation is rejected before consuming Special or spawning shots',async()=>{
  const h=await setup(false);
  h.a.pos.y=h.PLAYER.fallDeathY-.4;
  h.a.grounded=false;h.G.level.groundHeight=()=>-Infinity;
  h.a.intent.special=true;
  const gauge=h.a.special, used=h.a.stats.specials, emitted=h.G.projectiles.list.length;
  h.step();
  assert.equal(h.a.alive,false);
  assert.equal(h.a.specialActive,null);
  assert.equal(h.a.stats.specials,used,'water-dead player may not activate Trizooka');
  assert.equal(h.G.projectiles.list.length,emitted);
  assert.equal(h.a.stats.deaths,1);
  assert.ok(h.a.special<=gauge,'normal water-death gauge penalty remains owned by splat');
});

test('#1164 supported under-deck route does not cause a false water splat',async()=>{
  const h=await setup();
  h.a._resolve=()=>{};
  h.step();
  h.a.pos.y=h.PLAYER.fallDeathY-.4;h.a.grounded=false;
  h.G.level.groundHeight=()=>-5; // finite supported terrain below sea level
  const initialDeaths=h.a.stats.deaths;
  h.step();
  assert.equal(h.a.alive,true);
  assert.equal(h.a.stats.deaths,initialDeaths);
  assert.equal(h.a.specialActive?.id,'trizooka');
});
