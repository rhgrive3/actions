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
 x.enemy.pos.copy(x.a.pos).z+=6.8;x.enemy.hp=40;
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


test('full BotBrain Zipcaster lands at its planned surface and releases its native Splatana main',async()=>{
 const {makeBotSpecialFixture}=await import('./bot-special-fixture.mjs');
 const f=await makeBotSpecialFixture(),{a,b,enemy}=f.scenario('zipcaster');
 a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));
 const before=enemy.hp;let landing=null;
 for(let frame=0;frame<420;frame++){
  const phase=a._s3AllSpecialState?.phase;f.tick(a,b);
  if(!landing&&phase==='zip'&&a._s3AllSpecialState?.phase==='hookWait')landing=a.pos.clone();
 }
 assert.ok(landing,'native hook travel reaches a surface');
 assert.ok(landing.z<enemy.pos.z,'hook must not overshoot its target to the wall behind it');
 assert.ok(f.rounds.some(p=>p.owner===a),'native main receives a real release edge after arrival');
 assert.ok(enemy.hp<before-60,'main attacks add damage beyond a hook body contact');
});

test('full BotBrain ranged damage is caused by the special projectile or special effect',async()=>{
 const {makeBotSpecialFixture}=await import('./bot-special-fixture.mjs');
 const f=await makeBotSpecialFixture();
 for(const special of ['trizooka','tentaMissiles','inkjet','booyahBomb','killerWail','inkVac','crabTank']){
  const {a,b,enemy}=f.scenario(special);
  a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));
  let projectile=null,damage=0;
  const step=f.G.projectiles._step,apply=f.G.projectiles.applyHit,burst=f.G.projectiles._blastBurst;
  f.G.projectiles._step=function(p,...args){const before=projectile;projectile=p;try{return step.call(this,p,...args);}finally{projectile=before;}};
  f.G.projectiles._blastBurst=function(p,...args){const before=projectile;projectile=p;try{return burst.call(this,p,...args);}finally{projectile=before;}};
  f.G.projectiles.applyHit=function(owner,victim,amount,cause,...args){
   const before=victim?.hp,result=apply.call(this,owner,victim,amount,cause,...args);
   if(owner===a&&victim===enemy&&(cause===special||projectile?.wid===special))damage+=Math.max(0,before-victim.hp);
   return result;
  };
  for(let frame=0;frame<650;frame++)f.tick(a,b);
  f.G.projectiles._step=step;f.G.projectiles.applyHit=apply;f.G.projectiles._blastBurst=burst;
  assert.equal(a.stats.specials,1,special+' admitted exactly once');
  assert.ok(damage>0,special+' damage must be attributable to its own projectile/effect');
 }
});

test('full BotBrain Inkjet moves while hovering and returns toward its marker after target loss',async()=>{
 const {makeBotSpecialFixture}=await import('./bot-special-fixture.mjs');
 const f=await makeBotSpecialFixture(),{a,b,enemy}=f.scenario('inkjet');enemy.pos.z=28;
 for(let frame=0;frame<150;frame++)f.tick(a,b);
 assert.equal(a.specialActive?.id,'inkjet');assert.ok(a.pos.y>4,'real hover is active');
 assert.ok(a.pos.z>2,'airborne navigation can approach beyond its preferred range');
 const before=a.pos.z;b.target=null;b.seeTimer=0;b.think=100;
 for(let frame=0;frame<90;frame++){f.tick(a,b);assert.equal(a.intent.fire,false,'target loss releases ZR');}
 assert.ok(a.pos.z<before-1,'without a target it flies toward its actual return marker');
});

test('full BotBrain Zipcaster preserves native release cycles with other charged main weapons',async()=>{
 const {makeBotSpecialFixture}=await import('./bot-special-fixture.mjs');
 const f=await makeBotSpecialFixture();
 for(const weapon of ['charger','splatling','s3-stringer-normal']){
  const {a,b,enemy}=f.scenario('zipcaster');a.setWeapon(weapon);
  assert.equal(f.applyCatalogueChoice(a,{sub:'bomb',special:'zipcaster'},f),true);
  a.special=a.specialCost();enemy.pos.z=10;
  a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));a._startSpecial();
  let release=false,previous=false;
  for(let frame=0;frame<240&&a.specialActive;frame++){f.tick(a,b);release||=previous&&!a.intent.fire;previous=a.intent.fire;}
  assert.ok(release,weapon+' emits a fire-up edge');
  assert.ok(enemy.hp<100000,weapon+' deals actual native main damage, including hitscan');
 }
});


test('full BotBrain Crab uses an elevated cannon arc for a reachable close finisher',async()=>{
 const {makeBotSpecialFixture}=await import('./bot-special-fixture.mjs');
 const f=await makeBotSpecialFixture(),{a,b,enemy}=f.scenario('crabTank');
 enemy.pos.z=6.8;enemy.hp=40;a._startSpecial();
 let cannon=null,cannonDamage=0,inCannonBurst=false;
 const burst=f.G.projectiles._blastBurst,hit=f.G.projectiles.applyHit;
 f.G.projectiles._blastBurst=function(p,...args){const before=inCannonBurst;inCannonBurst=p.s3AllSpecialMode==='cannon';try{return burst.call(this,p,...args);}finally{inCannonBurst=before;}};
 f.G.projectiles.applyHit=function(owner,victim,...args){const hp=victim.hp,result=hit.call(this,owner,victim,...args);if(inCannonBurst&&owner===a&&victim===enemy)cannonDamage+=Math.max(0,hp-victim.hp);return result;};
 const push=f.G.projectiles._push;
 f.G.projectiles._push=function(p){if(p.owner===a&&p.s3AllSpecialMode==='cannon')cannon={velocity:p.vel.clone(),point:a.aimPoint.clone()};return push.call(this,p);};
 for(let frame=0;frame<90&&!cannonDamage;frame++)f.tick(a,b);
 assert.ok(cannon,'a close finisher reaches the actual cannon input');
 assert.ok(cannon.velocity.y>3,'the heavy cannon shell is aimed above the target for its falling arc');
 assert.ok(cannon.point.y>enemy.pos.y+1.5,'cannon has its own reticle instead of the rapid-fire body aim');
 assert.ok(cannonDamage>0,'the cannon blast itself reduces enemy HP, excluding rapid-fire hits');
});


test('full BotBrain Zipcaster cancels a held charge on target loss without an accidental shot',async()=>{
 const {makeBotSpecialFixture}=await import('./bot-special-fixture.mjs');
 const f=await makeBotSpecialFixture(),{a,b,enemy}=f.scenario('zipcaster');
 a.setWeapon('charger');f.applyCatalogueChoice(a,{sub:'bomb',special:'zipcaster'},f);
 a.special=a.specialCost();enemy.pos.z=10;a._startSpecial();
 let shots=0;const fire=f.G.projectiles.fireCharger;
 f.G.projectiles.fireCharger=function(owner,...args){if(owner===a)shots++;return fire.call(this,owner,...args);};
 for(let frame=0;frame<15;frame++)f.tick(a,b);
 assert.equal(a.weaponRunner.charging,true,'native charge is held before losing sight');
 const before=shots;b.target=null;b.seeTimer=0;b.think=100;
 for(let frame=0;frame<20;frame++)f.tick(a,b);
 assert.equal(shots,before,'target loss cancels rather than fires the stored charge');
 assert.equal(a.form,'squid');
});
