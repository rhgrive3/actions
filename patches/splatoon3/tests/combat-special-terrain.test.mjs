import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
 extraExports:"export {replaySpecial} from './patches/splatoon3/runtime/all-specials.mjs';"});
function terrain({grate=false,wall=false}={}){
 const {G}=f;
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
  single:[{kind:'box',min:[-100,-4.5,-100],max:[100,-4,100]},
   {kind:'box',min:[-20,-.25,-20],max:[20,0,20],grate},...(wall?[{kind:'box',min:[-4,0,1],max:[4,10,2]}]:[])],half:[]});
 G.physics=new f.Physics(G.level);
}
function world(options={}){
 const {G,THREE}=f;G.projectiles.clear();G.actors=[];G.netm=null;G.net=null;G.time=0;G.mode='match';
 G.match={state:'playing',mode:'turf',playing:()=>true,canRespawn:()=>false};G.paint={sample:()=>1,splat:()=>0};
 terrain(options);return THREE;
}
function actor(id,pos=[0,0,0]){
 const a=f.make();a._integrate=f.Actor.prototype._integrate;a.pos.set(...pos);a._probeGround();
 a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.invuln=0;
 a.intent.move.set(0,0,0);a.intent.fire=a.intent.jump=a.intent.squid=a.intent.sub=false;
 Object.assign(a._prevIntent,{fire:false,sub:false,jump:false,squid:false,special:false});
 a._startSpecial();return a;
}
function tick(a,count,hz=60){for(let i=0;i<count;i++){f.G.time+=1/hz;a._updateSpecial(1/hz);}}
for(const hz of [30,60,120]){
 test(`Kraken's spinning jump can hit after takeoff exactly once per victim at ${hz}Hz`,()=>{
  world();const a=actor('krakenRoyale');tick(a,hz,hz);
  const v=f.make();v.team=1;v.hp=500;v.invuln=0;v.pos.set(10,0,0);a.intent.jump=true;tick(a,1,hz);
  assert.equal(a.form,'squid');assert.equal(a.grounded,false);assert.equal(v.hp,500);
  v.pos.copy(a.pos);tick(a,1,hz);assert.equal(v.hp,440,'a late overlap during the same jump retains its 60 damage');
  tick(a,3,hz);assert.equal(v.hp,440,'the same spinning attack cannot repeatedly damage its victim');
 });
 test(`Kraken dash falls through grates and loses the grounded 120 hit at ${hz}Hz`,()=>{
  world();const a=actor('krakenRoyale');tick(a,hz,hz);a.intent.fire=true;tick(a,1,hz);tick(a,Math.ceil(35*hz/60),hz);
  a.intent.fire=false;tick(a,1,hz);assert.equal(a._s3AllSpecialState.phase,'dash');
  terrain({grate:true});f.G.actors=[a];const v=f.make();v.team=1;v.hp=500;v.invuln=0;v.pos.set(0,0,2.75);
  const startY=a.pos.y;tick(a,2,hz);
  assert.equal(a.form,'squid');assert.equal(a.grounded,false);assert.ok(a.pos.y<startY,'native gravity continues over the grate');
  assert.equal(a._s3AllSpecialState.phase,'active');assert.ok(v.hp>=440,'an airborne Kraken never retains the 120-damage dash');
 });
 test(`Inkjet ZL uses native squid floor and wall collision at ${hz}Hz`,()=>{
  world({wall:true});const a=actor('inkjet',[0,0,.5]);a.intent.squid=true;a.intent.move.set(0,0,1);
  tick(a,hz/2,hz);assert.equal(a.form,'squid');assert.ok(a.climbing,'an inked wall can be climbed during Inkjet');assert.ok(a.pos.y>0);
  assert.equal(f.G.projectiles.list.filter(p=>p.s3AllSpecial==='inkjet').length,0,'diving does not fire the main weapon');
 });
}
test('Reefslider outer blast is a fixed 70 damage band for players and devices',()=>{
 world();const a=actor('reefslider'),v=f.make();v.team=1;v.hp=500;v.invuln=0;v.pos.set(12,0,0);
 const state=a._s3AllSpecialState;state.phase='brake';state.brakeT=37/60;state.reefSpeedRaw=0;
 const enemy=f.make();enemy.team=1;
 const object={owner:enemy,team:1,id:'waveBreaker',kind:'sonar',activation:1,serial:1,pos:new f.THREE.Vector3(12,0,0),hp:1000,dead:false,age:0,dur:10};
 f.G.projectiles._s3AllSpecialObjects=[object];tick(a,1);
 assert.equal(v.hp,430,'the middle of the far band must not interpolate toward 220');
 assert.equal(object.hp,650,'source Reefslider→Wave Breaker ×5 object multiplier uses the same fixed band');
});
test('airborne Inkjet activation records the native last-grounded return position',()=>{
 world();const a=f.make();a._integrate=f.Actor.prototype._integrate;a._finishFrame=f.Actor.prototype._finishFrame;
 a.character.update=()=>{}; // Display only; keep the real frame's grounded-position recorder.
 a.spawnAt(new f.THREE.Vector3(2,0,1),0);a.invuln=0;a.intent.jump=true;f.G.time+=1/60;a.update(1/60);
 assert.equal(a.grounded,false);assert.ok(a.pos.y>0);const last=Array.from(a.superJumpGround.toArray());
 a.weapon={...a.weapon,special:'inkjet',specialCost:100};a.special=100;a._startSpecial();
 assert.deepEqual(Array.from(a._s3AllSpecialState.origin.toArray()),last);
 assert.ok(a.pos.y>a._s3AllSpecialState.origin.y,'recall marker stays at the supported floor');
});
test('Ultra Stamp selects its 8F swing when ZR is pressed after leaving the floor',()=>{
 world();const a=actor('ultraStamp',[0,5,0]);a.grounded=false;tick(a,20);a.intent.fire=true;
 const swings=[],off=f.on('all:special',e=>{if(e.actor===a&&['swing','jumpSwing'].includes(e.action))swings.push(e);});
 try{tick(a,1);tick(a,7);assert.equal(swings.length,0);tick(a,1);assert.equal(swings.length,1);assert.equal(swings[0].action,'jumpSwing');}
 finally{off?.();}
});
test('Ultra Stamp guard is absent while idle, before the first swing, and after releasing ZR',()=>{
 world();const a=actor('ultraStamp'),shooter=f.make();shooter.team=1;
 const candidate=()=>f.G.projectiles.kitDefenseCandidate({owner:shooter,team:1,prev:new f.THREE.Vector3(0,.78,3),pos:new f.THREE.Vector3(0,.78,.2),damage:20,size:.15,ghost:false});
 assert.equal(candidate(),null);tick(a,17);a.intent.fire=true;tick(a,30);assert.equal(candidate(),null);
 tick(a,1);assert.equal(candidate()?.kind,'ultra-stamp-guard');a.intent.fire=false;tick(a,1);assert.equal(candidate(),null);
});
test('remote Stamp guard follows accepted attack/release events rather than its whole activation',()=>{
 world();const a=actor('ultraStamp'),shooter=f.make();shooter.team=1;a.remote=true;
 const candidate=()=>f.G.projectiles.kitDefenseCandidate({owner:shooter,team:1,prev:new f.THREE.Vector3(0,.78,3),pos:new f.THREE.Vector3(0,.78,.2),damage:20,size:.15,ghost:false});
 let seed=1;const replay=action=>f.replaySpecial(f.installedRuntime,{...JSON.parse(JSON.stringify({id:'ultraStamp',activation:99,action,pos:[0,0,0],seed:seed++,duration:7.5})),actor:a});
 replay('activate');assert.equal(candidate(),null);replay('swing');assert.equal(candidate()?.kind,'ultra-stamp-guard');
 replay('swingEnd');assert.equal(candidate(),null);replay('jumpSwing');assert.equal(candidate()?.kind,'ultra-stamp-guard');replay('end');assert.equal(candidate(),null);
});
test('Booyah armor uses one 100-damage threshold and 80 cap per attack, independently of its remaining HP',()=>{
 world();const a=actor('booyahBomb'),shooter=f.make();shooter.team=1;tick(a,30);a.hp=500;
 const hit=(damage,group=null)=>f.G.projectiles.applyHit(shooter,a,damage,'shooter',group);
 hit(53,71);assert.equal(a.hp,500);hit(167,71);assert.equal(a.hp,420,'one 53+167 action penetrates 80 total');
 const b=actor('booyahBomb');tick(b,30);b.hp=500;
 // Respect the real main-weapon object multiplier while bringing armor below
 // the next shot's damage. Remaining shield HP is never a body damage budget.
 while(b._s3AllSpecialState.armorHP>30)f.G.projectiles.applyHit(shooter,b,30,'shooter');
 assert.ok(b._s3AllSpecialState.armorHP>0);assert.equal(b.hp,500);
 f.G.projectiles.applyHit(shooter,b,100,'shooter');assert.equal(b._s3AllSpecialState.armorHP,0);assert.equal(b.hp,500,'a breaking shot at the 100 threshold is fully absorbed');
 f.G.projectiles.applyHit(shooter,b,30,'shooter');assert.equal(b.hp,470,'the next shot reaches the body after armor is gone');
 const c=actor('booyahBomb');tick(c,30);c.hp=500;f.G.projectiles.applyHit(shooter,c,500,'shooter');assert.equal(c.hp,420,'a single very large hit is capped at 80');
});
