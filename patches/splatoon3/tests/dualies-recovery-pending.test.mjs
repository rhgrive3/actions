import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';

async function setup({oldJump=false,oldRefill=false}={}) {
 const f=await fixture({adapt:(rel,code)=>{
  const s=adaptSource(rel,code);
  return oldJump&&rel==='src/game/actor.js'?s.replace(" && (isSquid || this.weapon.kind !== 'dualies' || !this.weaponRunner.dodge && !(this.weaponRunner.lockT > 0))",''):s;
 },adaptRuntime:(rel,s)=>oldRefill&&rel==='patches/splatoon3/runtime/weapons.mjs'?s.replace('    if (!this.dodge && this.lockT <= 0) this.rollsLeft = w.rolls;',''):s});
 const a=f.make('dualies'),r=a.weaponRunner,ps=new f.Projectiles(new f.THREE.Scene());
 f.G.projectiles=ps;f.G.actors=[a];f.G.camera={position:new f.THREE.Vector3(0,20,0)};
 const shots=[],fire=ps.fireDualies;let tick=0;
 ps.fireDualies=function(...args){shots.push(tick);return fire.apply(this,args);};
 return {...f,a,r,ps,shots,step(){++tick;f.tick(a);},get tick(){return tick;}};
}
for(const hz of [30,60,120])test(`${hz}Hz refill preserves actual post-roll 4F firing and postshot gates`,async()=>{
 const h=await setup(),{a,r}=h;a.intent.fire=true;a.intent.move.set(0,0,1);
 for(let roll=0;roll<2;roll++){
  assert.equal(r.tryDodge(a.intent.move),true);
  while(r.dodge)h.step();
 }
 assert.equal(r.rollsLeft,0);assert.ok(r.lockT>0);assert.equal(r.s3DodgeShotPending,4*STEP);
 a.intent.move.set(0,0,0);const completed=h.tick;h.shots.length=0;
 const clock=new FixedClock();let restored=null;
 for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{
  h.step();
  if(r.lockT>0)assert.equal(r.rollsLeft,0);
  else if(restored===null){restored=h.tick;assert.equal(r.rollsLeft,a.weapon.rolls);}
  if(h.shots.at(-1)===h.tick){assert.equal(r.s3DualiesPostShot,4*STEP);assert.equal(r.busy(),true);}
 });
 assert.equal(h.shots[0]-completed,4,'pending owner retains its four ticks');
 assert.equal(restored-completed,Math.round(a.weapon.lockTime/STEP));
 assert.ok(h.shots.length>5);assert.equal(r.s3Turret,true);
 assert.equal(r.rollsLeft,a.weapon.rolls);
 // A real projectile shot establishes postshot ownership; jump/refill never clears it.
 const fired=await setup();fired.ps.fireDualies(fired.a,fired.a.weapon,0,0);
 fired.a.intent.fire=false;
 for(let i=1;i<4;i++){fired.step();assert.ok(fired.r.s3DualiesPostShot>1e-10);assert.equal(fired.r.busy(),true);}
 fired.step();assert.ok(fired.r.s3DualiesPostShot<=1e-10);
});

test('old refill omission fails held-fire resource recovery while firing gates stay live',async()=>{
 const h=await setup({oldRefill:true});h.a.intent.fire=true;h.a.intent.move.set(0,0,1);
 for(let roll=0;roll<2;roll++){assert.equal(h.r.tryDodge(h.a.intent.move),true);while(h.r.dodge)h.step();}
 h.a.intent.move.set(0,0,0);while(h.r.lockT>0)h.step();
 assert.equal(h.r.rollsLeft,0);assert.ok(h.shots.length>0);
});

test('old generic jump leaks through positive lock; guarded route preserves pending and postshot',async()=>{
 for(const oldJump of [true,false]){
  const h=await setup({oldJump});h.r.lockT=3*STEP;h.r.rollsLeft=0;
  h.r.s3DodgeShotPending=4*STEP;h.ps.fireDualies(h.a,h.a.weapon,0,0);
  h.a.intent.fire=true;h.a.intent.jump=true;h.a.intent.move.set(0,0,0);h.step();
  assert.equal(h.a.character.events.some(([name])=>name==='jump'),oldJump);
  assert.ok(h.r.s3DualiesPostShot>0);assert.ok(h.r.s3DodgeShotPending>0);
  assert.equal(h.r.rollsLeft,0);
 }
});

test('release, sub and reset still cancel pending shots without early roll refill',async()=>{
 for(const cancel of ['release','sub','reset']){
  const h=await setup();h.a.intent.fire=true;h.a.intent.move.set(0,0,1);
  for(let roll=0;roll<2;roll++){assert.equal(h.r.tryDodge(h.a.intent.move),true);while(h.r.dodge)h.step();}
  h.shots.length=0;h.a.intent.move.set(0,0,0);
  if(cancel==='release')h.a.intent.fire=false;
  if(cancel==='sub')h.a.intent.sub=true;
  if(cancel==='reset'){h.r.reset();h.a.intent.fire=false;}
  h.step();assert.equal(h.r.s3DodgeShotPending,0,cancel);assert.equal(h.shots.length,0,cancel);
  if(cancel!=='reset'){assert.ok(h.r.lockT>0);assert.equal(h.r.rollsLeft,0);}
  else assert.equal(h.r.s3DualiesPostShot,0);
 }
});
