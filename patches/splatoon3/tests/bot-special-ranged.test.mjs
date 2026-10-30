import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA=`export {driveRangedSpecial} from './patches/splatoon3/runtime/bot-special-ranged.mjs';
export {inkVacState} from './patches/splatoon3/runtime/kit-ink-vac.mjs';
export {tentaMissilesLockPreview} from './patches/splatoon3/runtime/all-specials.mjs';`;
async function setup(id,distance=18,active=true){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 f.G.physics.raycast=(o,d,length,h)=>{h.hit=d.y<-.0001&&o.y/-d.y<=length;if(h.hit){h.dist=o.y/-d.y;h.point.copy(o).addScaledVector(d,h.dist);h.normal.set(0,1,0);}return h;};
 const a=f.make(),enemy=f.make();enemy.team=1;enemy.pos.set(0,0,distance);enemy.vel.set(0,0,0);
 a.isBot=true;
 a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.alive=true;a.remote=false;a._resolve=()=>{};a.form='kid';
 a.aimYaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.1,distance);a.yaw=0;
 Object.assign(a.intent,{fire:false,sub:false,squid:false,jump:false,booyah:false});
 const events=[];f.on('all:special',e=>events.push(e));
 const memory={};
 function drive({dt=1/60,visible=true,target=enemy,apply=true,align=true}={}){
  const c={actor:a,intent:a.intent,dt,special:id,state:a.specialActive,memory,enemy:target,visible,
   distance:target?Math.hypot(target.pos.x-a.pos.x,target.pos.z-a.pos.z):Infinity,height:target?target.pos.y-a.pos.y:Infinity,
   world:f.G,move:new f.THREE.Vector3(),normalIntent:{fire:true},wantYaw:a.aimYaw,wantPitch:a.aimPitch,aimDistance:distance,
   brain:{_range:()=>12,_nearWater:()=>false}};
  c.aimAt=(p,{height=0,lead=0}={})=>{const dx=p.x+(target?.vel.x||0)*lead-a.pos.x,dz=p.z+(target?.vel.z||0)*lead-a.pos.z,dy=p.y+height-a.pos.y-1.1;c.wantYaw=Math.atan2(dx,dz);c.wantPitch=Math.atan2(dy,Math.hypot(dx,dz));c.aimDistance=Math.hypot(dx,dy,dz);};
  c.isAimed=(t=.13)=>align&&Math.hypot(Math.atan2(Math.sin(c.wantYaw-a.aimYaw),Math.cos(c.wantYaw-a.aimYaw)),c.wantPitch-a.aimPitch)<=t;
  c.moveToward=(p,scale=1)=>c.move.copy(p).sub(a.pos).setY(0).normalize().multiplyScalar(scale);
  f.driveRangedSpecial(c);
  if(apply){a.aimYaw=c.wantYaw;a.aimPitch=c.wantPitch;const cp=Math.cos(c.wantPitch);a.aimDir.set(Math.sin(c.wantYaw)*cp,Math.sin(c.wantPitch),Math.cos(c.wantYaw)*cp);a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0,1.1,0)).addScaledVector(a.aimDir,c.aimDistance);a.intent.move.copy(c.move);f.G.time+=dt;a.update(dt);}
  return c;
 }
 if(active)a._startSpecial();
 return {f,a,enemy,memory,events,drive};
}

test('ranged activation needs a visible living enemy, suitable height and settled aim',async()=>{
 for(const id of ['trizooka','tentaMissiles','inkjet','booyahBomb','killerWail','inkVac','crabTank','zipcaster']){
  const x=await setup(id,20,false);
  for(const bad of ['hidden','dead','ally','high','unaligned']){
   x.enemy.alive=bad!=='dead';x.enemy.team=bad==='ally'?0:1;x.enemy.pos.y=bad==='high'?50:0;
   x.drive({visible:bad!=='hidden',align:bad!=='unaligned',apply:false});assert.equal(x.a.intent.special,false,id+' '+bad);
  }
 }
});

test('Trizooka holds normal ZR through its real windup and fires three volleys at different dt',async()=>{
 for(const hz of [30,60,120]){
  const x=await setup('trizooka');const state=x.a.s3Trizooka;
  x.drive({align:false});assert.equal(x.a.intent.fire,false);
  for(let i=0;i<4*hz&&x.a.specialActive;i++)x.drive({dt:1/hz});
  assert.equal(state.shots,3,hz+'Hz actual volleys');
  assert.equal(x.a.stats.specials,1);assert.equal(x.a.special,0);
 }
});

test('Tenta uses the runtime lock preview and never launches at an empty or unaligned reticle',async()=>{
 const x=await setup('tentaMissiles');
 for(let i=0;i<12;i++)x.drive({align:false});
 assert.equal(x.events.filter(e=>e.action==='target').length,0);
 for(let i=0;i<90&&x.a.specialActive;i++)x.drive();
 assert.equal(x.events.filter(e=>e.action==='target').length,1);
 assert.equal(x.f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles').length,10);
 const y=await setup('tentaMissiles');y.drive({target:null});
 assert.equal(y.a.intent.fire,false);assert.equal(y.events.filter(e=>e.action==='target').length,0);
});

test('Booyah self-charges using Nice edges, then throws by R release only after ready',async()=>{
 for(const hz of [30,120]){
  const x=await setup('booyahBomb',15);let sawReady=false;
  for(let i=0;i<6*hz&&x.a.specialActive;i++){
   if(x.a._s3AllSpecialState.charge>=1)sawReady=true;
   x.drive({dt:1/hz});assert.equal(x.a.intent.fire,false);
  }
  assert.ok(sawReady);const throws=x.events.filter(e=>e.action==='throw');assert.equal(throws.length,1);assert.equal(throws[0].charge,1);
 }
});

test('Inkjet owns its 30-unit weapon range instead of the equipped main range',async()=>{
 const x=await setup('inkjet',23);
 for(let i=0;i<100;i++)x.drive();
 assert.ok(x.events.some(e=>e.action==='shot'),'a 12-unit main still fires Inkjet at 23');
 x.enemy.pos.z=x.a.pos.z+40;x.drive({apply:false});assert.equal(x.a.intent.fire,false);assert.ok(x.a.intent.move.lengthSq()===0);
});

test('Ink Vac retains suction, holds through target loss, and releases only an aimed countershot',async()=>{
 const x=await setup('inkVac',14);
 for(let i=0;i<390&&x.f.inkVacState(x.a)?.phase!=='exhale';i++)x.drive();
 const state=x.f.inkVacState(x.a);assert.equal(state.phase,'exhale');
 for(let i=0;i<30;i++)x.drive({target:null});
 assert.equal(x.f.G.projectiles.list.filter(p=>p.wid==='inkVac').length,0,'losing target never releases the held countershot');
 for(let i=0;i<20&&x.a.specialActive;i++)x.drive();
 assert.equal(x.f.G.projectiles.list.filter(p=>p.wid==='inkVac').length,1);
});

test('Crab preserves its accelerating stream, uses cannon for a close finisher and rolls from threats',async()=>{
 const x=await setup('crabTank',22);
 for(let i=0;i<120;i++)x.drive();
 assert.ok(x.events.filter(e=>e.action==='shot').length>=10);
 assert.equal(x.events.filter(e=>e.action==='cannon').length,0,'ordinary stream is not reset by periodic R');
 x.enemy.pos.copy(x.a.pos).z+=8;x.enemy.hp=40;
 for(let i=0;i<20&&!x.events.some(e=>e.action==='cannon');i++)x.drive();
 assert.ok(x.events.some(e=>e.action==='cannon'));
 x.enemy.pos.copy(x.a.pos).z+=4;x.drive({apply:false});
 assert.equal(x.a.intent.squid,true);assert.equal(x.a.intent.fire,false);assert.equal(x.a.intent.sub,false);
});

test('Zipcaster checks real surface and ready phase before a hook and does not fire during travel',async()=>{
 const x=await setup('zipcaster',24);
 for(let i=0;i<40&&x.a._s3AllSpecialState.phase==='ready';i++)x.drive();
 assert.ok(x.events.some(e=>e.action==='zip'));assert.notEqual(x.a._s3AllSpecialState.phase,'ready');
 x.drive({apply:false});assert.equal(x.a.intent.fire,false);assert.equal(x.a.intent.sub,false);
 const y=await setup('zipcaster',24);y.f.G.physics.raycast=(_o,_d,_r,h)=>{h.hit=false;return h;};
 for(let i=0;i<40;i++)y.drive();assert.equal(y.events.some(e=>e.action==='zip'),false);
});

test('Killer Wail continues its native lock windows and restores ordinary fire after control unlock',async()=>{
 const x=await setup('killerWail',10);
 for(let i=0;i<150;i++)x.drive();
 assert.equal(x.events.filter(e=>e.action==='target').length,3);
 assert.equal(x.a.intent.fire,true);
 x.enemy.alive=false;x.drive({apply:false});assert.equal(x.a.intent.fire,false);
});

test('bot missile locks use their own view even when the human camera faces away',async()=>{
 const x=await setup('tentaMissiles');
 const camera=new x.f.THREE.PerspectiveCamera(60,1.5,.1,200);
 camera.position.set(0,5,0);camera.lookAt(0,0,-20);camera.updateMatrixWorld(true);
 x.f.G.camera=camera;
 x.a.isBot=false;assert.equal(x.f.tentaMissilesLockPreview(x.f,x.a).targets.length,0,'human camera selection unchanged');
 x.a.isBot=true;assert.equal(x.f.tentaMissilesLockPreview(x.f,x.a).targets.length,1,'bot uses its own forward cone');
 for(let i=0;i<90&&x.a.specialActive;i++)x.drive();
 assert.equal(x.events.filter(e=>e.action==='target').length,1);
 assert.equal(x.f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles').length,10);
});

test('Booyah eye-based aiming reaches the intended ground target with the real projectile step',async()=>{
 const x=await setup('booyahBomb',15);
 for(let i=0;i<360&&x.a.specialActive;i++)x.drive();
 const p=x.f.G.projectiles.list.find(p=>p.s3AllSpecial==='booyahBomb');assert.ok(p);
 x.f.G.physics.segment=(from,to,h)=>{
  h.hit=from.y>=0&&to.y<=0;
  if(h.hit){h.point.copy(from).lerp(to,from.y/(from.y-to.y));h.normal.set(0,1,0);h.dist=from.distanceTo(h.point);}
  return h;
 };
 for(let i=0;i<150;i++)if(x.f.G.projectiles._step(p,1/60))break;
 assert.ok(p.pos.distanceTo(x.enemy.pos)<3,`landing ${p.pos.toArray()} should be near target ${x.enemy.pos.toArray()}`);
});
