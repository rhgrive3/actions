// Actual composed BotBrain + Actor + catalogue runner. Navigation is controlled;
// these tests verify action decisions and real weapon admission, not match strength.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

async function setup() {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { BotBrain } from './inkwave-public/src/game/bots.js'; export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.paint.sample=()=>1;
 f.G.paint.regionStats=(_x,_y,_z,_r,_team,out)=>Object.assign(out||{},{own:0,enemy:0,empty:1,n:1});
 f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
 return f;
}
function scenario(f,id,{enemy=false,ground=1,moving=false}={}){
 f.G.actors=[]; f.G.projectiles.clear(); f.G.time=0;
 const a=f.make(id);a.isBot=true;a.groundTeam=ground;a.ink=100;a.hp=f.PLAYER.hp;a.lastDamage=99;a.lastFire=99;
 f.G.paint.sample=()=>ground===1?1:ground===2?2:0;
 const b=a.bot=new f.BotBrain(a,'normal');b._perceive=()=>{};b._pickPaintGoal=()=>{b.goalTimer=1;b.path=null;};b._pickRefill=()=>{b.repath=1;b.path=null;};b._steer=()=>new f.THREE.Vector3(0,0,moving?1:0);
 b._pathTo=()=>false;
 if(enemy){const e=f.make('shooter');e.team=1;e.pos.set(0,0,3);b.target=e;b.seeTimer=100;b.react=0;}
 const events=[],trace=[];const unsub=f.on('weapon:fire',e=>{if(e.actor===a)events.push({charge:e.charge??0,mode:b.mode,foot:!!b._footPaint});});
 return {a,b,events,trace,unsub,step(hz=60){const dt=1/hz;f.G.time+=dt;b.update(dt);a.update(dt);trace.push({fire:a.intent.fire,pitch:b.aimPitch,foot:b._footPaint,move:a.intent.move.length(),aimDist:Math.hypot(a.aimPoint.x-a.pos.x,a.aimPoint.z-a.pos.z),charge:a.weaponRunner.charge,rounds:a.weaponRunner.catalogState?.rounds||0,ink:a.ink});}};
}
test('R-PEN charges fully and spends multiple loaded shots',async()=>{
 const f=await setup(),s=scenario(f,'s3-charger-pencil');for(let i=0;i<60*8;i++)s.step();s.unsub();
 assert.ok(s.events.filter(e=>e.charge>=.999).length>=5,JSON.stringify(s.events));
 assert.ok(s.trace.some(x=>x.rounds>0));
});
test('brush bots flick repeatedly during close combat',async()=>{
 const f=await setup();for(const id of ['s3-brush-mini','s3-brush-normal','s3-brush-heavy']){const s=scenario(f,id,{enemy:true,moving:true});for(let i=0;i<60*5;i++)s.step();s.unsub();assert.ok(s.events.length>=3,id+' '+s.events.length);}
});
test('Soituber and LACT paint with short charges while regular charger uses a charged shot on own ink',async()=>{
 const f=await setup();for(const [id,max] of [['s3-charger-keeper',.25],['s3-stringer-short',.25]]){const s=scenario(f,id);for(let i=0;i<60*4;i++)s.step();s.unsub();assert.ok(s.events.some(e=>e.charge<=max),id+' '+JSON.stringify(s.events));}
 const s=scenario(f,'charger');for(let i=0;i<60*4;i++)s.step();s.unsub();assert.ok(s.events.some(e=>e.charge>=.7),JSON.stringify(s.events));
});
test('safe enemy ink invokes a bounded floor-aim attempt; visible threats take priority',async()=>{
 const f=await setup();const s=scenario(f,'shooter',{ground:2,moving:true});for(let i=0;i<60*4;i++)s.step();s.unsub();assert.ok(s.trace.some(x=>x.foot&&x.pitch<-.25&&x.pitch>-.6&&x.fire&&x.move>.7&&x.aimDist>3),JSON.stringify(s.trace.slice(0,20)));assert.ok(s.trace.some((x,i)=>i>120&&!x.foot),'attempt is bounded');
 const combat=scenario(f,'shooter',{ground:2,moving:true,enemy:true});for(let i=0;i<60;i++)combat.step();combat.unsub();assert.ok(combat.trace.every(x=>!x.foot),'visible enemy retains priority');
});

for (const id of ['shooter','s3-charger-keeper','s3-charger-pencil','s3-stringer-short','s3-stringer-normal','s3-stringer-explosion','s3-brush-mini','s3-brush-normal','s3-brush-heavy','s3-slosher-diffusion','s3-slosher-washtub','splatling','s3-saber-lite','s3-blaster-light','dualies','roller','s3-shelter-normal']) test(id+' repaints enemy ink underfoot using real projectile and paint ownership',async()=>{
 const f=await setup();const {makePaintWorld}=await import('../../splatoon3/tests/paint-authority-fixture.mjs');
 const {paint,V}=makePaintWorld(f);f.G.match={playing:()=>true,canRespawn:()=>false};
 const a=f.make(id);a.isBot=true;a.pos.set(0,0,0);a.character.root.position.copy(a.pos);a.ink=100;a.hp=f.PLAYER.hp;a.lastDamage=99;a.lastFire=99;
 paint.splat(V(0,0,0),3,1,{instant:true,seed:.4});a._probeGround();assert.equal(a.groundTeam,2,'the initial floor belongs to the enemy');
 const b=a.bot=new f.BotBrain(a,'normal');b._perceive=()=>{};b._pickPaintGoal=()=>{b.goalTimer=1;b.path=null;};b._steer=()=>new f.THREE.Vector3();b._pathTo=()=>false;
 const initial=paint.counts[0];let clear=false;
 for(let i=0;i<60*5;i++){f.G.time+=1/60;b.update(1/60);a.update(1/60);f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);a._probeGround();if(a.groundTeam===1){clear=true;break;}}
 assert.ok(clear,'the feet must become own ink; own area='+paint.counts[0]+' initial='+initial+' pitch='+b.aimPitch);
});

test('low ink and active specials do not get forced into foot-paint mode',async()=>{
 const f=await setup();const low=scenario(f,'shooter',{ground:2,moving:true});low.a.ink=5;for(let i=0;i<30;i++)low.step();low.unsub();assert.ok(low.trace.every(x=>!x.foot));
 const special=scenario(f,'shooter',{ground:2,moving:true});special.a.specialActive={};special.a._updateSpecial=()=>{};for(let i=0;i<30;i++)special.step();special.unsub();assert.ok(special.trace.every(x=>!x.foot));
});
for(const hz of [30,60,120])test('short-charge and R-PEN release remain bounded at '+hz+' Hz',async()=>{
 const f=await setup();for(const id of ['s3-charger-keeper','s3-stringer-short','s3-charger-pencil']){
  const s=scenario(f,id);for(let i=0;i<hz*8;i++)s.step(hz);s.unsub();assert.ok(s.events.length>=2,id+' did not emit');assert.ok(s.trace.every(x=>Number.isFinite(x.ink)&&x.ink>=0&&x.ink<=100));
  if(id==='s3-charger-pencil')assert.ok(s.events.filter(x=>x.charge>=.999).length>=5);
  else assert.ok(s.events.some(x=>x.charge<=.25));
 }
});

test('a visible target briefly outside the reticle does not force an early R-PEN shot',async()=>{
 const f=await setup(),s=scenario(f,'s3-charger-pencil',{enemy:true,moving:true});
 s.b.aimYaw=Math.PI;s.b.aimPitch=0;s.b.chargeRelease=.98;
 for(let i=0;i<60*5;i++)s.step();s.unsub();
 assert.ok(s.events.length>0,'a real shot should be admitted after turning');
 assert.ok(s.events[0].charge>=.999,'first shot must reach full charge: '+JSON.stringify(s.events[0]));
});

test('a retreating bot does not stop to paint its feet',async()=>{
 const f=await setup();const s=scenario(f,'shooter',{ground:2,moving:true,enemy:true});s.b.mode='retreat';s.b.retreatT=4;s.b.seeTimer=0;s.a.hp=f.PLAYER.hp*.5;for(let i=0;i<30;i++)s.step();s.unsub();assert.ok(s.trace.every(x=>!x.foot));
});

test('LACT and Wellstring use their first charge against a nearby visible target',async()=>{
 const f=await setup();for(const id of ['s3-stringer-short','s3-stringer-explosion']){
  const s=scenario(f,id,{enemy:true,moving:true});for(let i=0;i<60*5;i++)s.step();s.unsub();
  assert.ok(s.events.some(e=>e.charge>=.3&&e.charge<.8),id+' '+JSON.stringify(s.events));
 }
});
