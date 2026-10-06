import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {adaptSource} from '../adapter.mjs';
import {adaptIssue477Source,adaptIssue477MovementPhysics} from '../issue-477-adapter.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup({gate=true,wall=false}={}){
 const f=await fixture({adaptNative(rel,code){
  code=adaptIssue477Source(rel,adaptSource(rel,code));
  if(rel==='src/game/physics.js')code+='\nexport { Level } from "../world/level.js";\n';
  return code;
 },adaptRuntime:(rel,code)=>rel==='patches/splatoon3/runtime/movement-physics.mjs'&&gate?adaptIssue477MovementPhysics(code):code});
 const level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-15,0,0],[15,0,0]],spawnBarrier:0,half:[],single:[
  {kind:'box',min:[-20,-.5,-20],max:[20,0,20]},...(wall?[{kind:'box',min:[-5,0,.4],max:[5,5,.5]}]:[])]});
 f.G.level=level;f.G.physics=new f.Physics(level);f.G.projectiles.throwStorm=()=>{};
 const a=f.make('dualies');delete a._integrate;a.pos.set(0,0,0);a.ground.block=-1;a.groundN.set(0,1,0);
 a.intent.fire=true;a.intent.move.set(0,0,1);a.intent.jump=true;
 return {...f,a,r:a.weaponRunner};
}
for(const hz of [30,60,120])test(`${hz}Hz actual Actor holds four startup ticks then retains roll distance and recovery`,async()=>{
 const h=await setup(),clock=new FixedClock(),rows=[];h.a.vel.set(3,0,4);
 for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{
  h.tick(h.a);rows.push({z:h.a.pos.z,x:h.a.pos.x,age:h.r.dodge?.t??null,startup:h.r.dodge?.startup??null,lock:h.r.lockT});h.a.intent.jump=false;
 });
 for(const row of rows.slice(0,4)){near(row.x,0);near(row.z,0);near(row.age,0);}
 assert.ok(rows[4].z>0);near(rows[15].z,h.a.weapon.rollDist);assert.equal(rows[15].age,null);
 assert.ok(rows[46].lock>0);near(rows[47].lock,0);
 assert.equal(h.a.character.events.filter(([name])=>name==='dodge').length,1);
});
test('negative: connecting only dodgeVel still leaks roll distance through Actor integration',async()=>{
 const h=await setup({gate:false});h.tick(h.a);assert.ok(h.a.pos.z>.3);near(h.r.dodge.t,0);assert.ok(h.r.dodge.startup>0);
});
test('native gravity, contacts and external velocity remain active during startup',async()=>{
 const h=await setup();h.tick(h.a);h.a.intent.jump=false;
 h.a.grounded=false;h.a.ground.hit=false;h.a.pos.y=2;h.a.vel.set(.3,0,0);h.tick(h.a);
 near(h.a.pos.x,.3*STEP);assert.ok(h.a.pos.y<2);assert.ok(h.a.vel.y<0);near(h.r.dodge.t,0);
 const w=await setup({wall:true});w.tick(w.a);w.a.intent.jump=false;w.a.vel.z=12;
 w.tick(w.a);assert.ok(w.a.contacts.wall);assert.ok(w.a.pos.z<.4);assert.ok(w.a.vel.z<=1e-8);near(w.r.dodge.t,0);
});
test('reset and weapon change retire startup; a fresh roll repeats the complete delay',async()=>{
 const h=await setup();h.tick(h.a);h.r.reset();assert.equal(h.r.dodge,null);
 h.a.intent.jump=h.a.intent.fire=false;h.tick(h.a);h.a.intent.jump=h.a.intent.fire=true;const start=h.a.pos.clone();
 for(let i=0;i<4;i++){h.tick(h.a);near(h.a.pos.distanceTo(start),0);h.a.intent.jump=false;}
 h.tick(h.a);assert.ok(h.a.pos.distanceTo(start)>0);
 h.a.setWeapon('shooter');assert.equal(h.r.dodge,null);
});
test('successful special cancellation retains its independent owner and clears the pending roll',async()=>{
 const h=await setup();h.tick(h.a);h.a.special=h.a.specialCost();h.a._startSpecial();assert.equal(h.r.dodge,null);
});
test('native death/reset cannot replay startup, and a chained roll gets its own four ticks',async()=>{
 const dead=await setup();dead.tick(dead.a);dead.a.splat(null,'weapon');assert.equal(dead.r.dodge,null);
 const pos=dead.a.pos.clone();dead.tick(dead.a,3);near(dead.a.pos.distanceTo(pos),0);
 const h=await setup();h.tick(h.a);h.a.intent.jump=false;h.tick(h.a,15);assert.equal(h.r.dodge,null);assert.ok(h.r.lockT>0);
 h.a.intent.jump=true;const start=h.a.pos.clone();const ink=h.a.ink;
 for(let i=0;i<4;i++){h.tick(h.a);h.a.intent.jump=false;near(h.a.pos.distanceTo(start),0);near(h.r.dodge.t,0);}
 near(ink-h.a.ink,h.a.weapon.rollInk);h.tick(h.a);assert.ok(h.a.pos.distanceTo(start)>0);
});
test('direct velocity query shares the startup gate without consuming an interval',async()=>{
 const h=await setup();h.tick(h.a);const v=new h.THREE.Vector3(2,3,4),age=h.r.dodge.t;
 assert.equal(h.r.dodgeVel(v,STEP),false);assert.deepEqual([...v],[2,3,4]);near(h.r.dodge.t,age);
 h.a.intent.jump=false;h.tick(h.a,3);assert.equal(h.r.dodgeVel(v,STEP),true);assert.ok(v.z>0);near(h.r.dodge.t,0);
});
test('modern anchors retain exact recovery carry; helper hookup rejects missing and repeated connections',()=>{
 const helper=fs.readFileSync(new URL('../runtime/movement-physics.mjs',import.meta.url),'utf8');
 const patched=adaptIssue477MovementPhysics(helper);
 assert.throws(()=>adaptIssue477MovementPhysics(patched),/conflict/);assert.throws(()=>adaptIssue477MovementPhysics(''),/conflict/);
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const runner=adaptIssue477Source('src/game/weapons.js',adaptSource('src/game/weapons.js',raw));
 assert.ok(runner.includes('d.t + MOVEMENT_EPSILON >= d.dur'));
 assert.ok(runner.includes('w.lockTime - Math.max(0, d.t - d.dur)'));
});
