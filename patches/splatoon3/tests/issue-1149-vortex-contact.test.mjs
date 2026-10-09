import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './kit-composed-fixture.mjs';
import {installKitInkVac, inkVacState, inkVacActorContact, disposeInkVac, replayInkVac, INK_VAC_EVENTS as EV, inkVacAbsorbCandidate} from '../runtime/kit-ink-vac.mjs';
async function setup(){
  const f=await fixture();installKitInkVac(f,f.profile);
  f.G.paint.sample=()=>0;f.G.projectiles=new f.Projectiles(new f.THREE.Scene());
  const a=f.make('charger'),b=f.make('shooter');b.team=1;b.pos.set(0,0,5);
  a.weapon={...a.weapon,special:'inkVac',specialCost:190};a.special=190;a._startSpecial();
  a.aimDir.set(0,0,1);a.aimYaw=0;a.aimPitch=0;
  return {f,a,b};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const hz of [30,60,120])test(`#1149 ${hz}Hz native Actor contact drains/slows without HP damage and credits 45 in 30 ticks`,async()=>{
  const {f,a,b}=await setup();let acc=0;
  for(let frame=0;frame<hz/2;frame++){
    acc+=1/hz;while(acc+1e-10>=1/60){acc-=1/60;f.tick(a);f.tick(b);}
  }
  close(inkVacState(a).absorbedDamage,45);close(inkVacState(a).charge,45/1100);
  close(b.ink,94);assert.equal(b.hp,100);assert.equal(inkVacState(a).absorbed,0,'actor credit is not a projectile count');
  b.intent.move.set(1,0,0);b.vel.set(20,0,0);b._horizontal(1/60,false,false);
  assert.ok(b.vel.length()<=b.weaponRunner.moveSpeed()*.6+1e-8);
  b.pos.z=-5;b.vel.set(20,0,0);b._horizontal(1/60,false,false);assert.ok(b.vel.length()>b.weaponRunner.moveSpeed()*.6);
  const charge=inkVacState(a).absorbedDamage;f.tick(a);close(inkVacState(a).absorbedDamage,charge);
});
test('#1149 contact filters allies, dead actors, occlusion, elevation, and ends with the special',async()=>{
  const {f,a,b}=await setup();
  for(const [key,value] of [['team',0],['alive',false]]){const old=b[key];b[key]=value;assert.equal(inkVacActorContact(a,b),false);b[key]=old;}
  for(const point of [[0,0,-5],[20,0,5],[0,30,5]]){b.pos.fromArray(point);assert.equal(inkVacActorContact(a,b),false);}
  b.pos.set(0,0,5);f.G.physics.los=()=>false;assert.equal(inkVacActorContact(a,b),false);f.tick(a);assert.equal(inkVacState(a).charge,0);
  f.G.physics.los=()=>true;assert.equal(inkVacActorContact(a,b),true);
  const p={pos:new f.THREE.Vector3(0,1,5),vel:new f.THREE.Vector3(0,0,-1),team:1,damage:70};
  inkVacAbsorbCandidate(a,p.pos,p.pos,p).onHit();f.tick(a,30);
  close(inkVacState(a).absorbedDamage,115);assert.equal(inkVacState(a).absorbed,1);
  disposeInkVac(a);assert.equal(inkVacActorContact(a,b),false);const ink=b.ink;f.tick(b);assert.ok(b.ink>=ink);
  a.special=190;a._startSpecial();a.reset();assert.equal(inkVacActorContact(a,b),false);
});
test('#1149 remote cone affects only a local victim; replica and duplicate actor rows never author duplicate charge',async()=>{
  const {f,a,b}=await setup();a.owner='A';a.nid=1;b.owner='B';b.nid=2;
  b.remote=true;f.G.actors.push(b);f.tick(a,30);close(inkVacState(a).absorbedDamage,45);
  f.tick(b,30);assert.equal(b.ink,100,'remote victim tank remains owner-authored');
  disposeInkVac(a);a.remote=true;b.remote=false;
  const r=replayInkVac(EV.activation,a,{actor:a,kit:'inkVac',serial:500,power:0,charge:0},{from:'A'});assert.equal(r.applied,true);
  f.tick(b,30);close(b.ink,94);assert.equal(inkVacState(a).charge,0,'replica cannot credit gauge');
  replayInkVac(EV.dispose,a,{actor:a,kit:'inkVac',serial:500},{from:'A'});assert.equal(inkVacActorContact(a,b),false);
});
