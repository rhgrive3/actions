import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Actual production Actor -> Sub Resistance -> movement armor -> native HP,
// with controlled physics/render sinks. PvP 11.3.0 community armor reference,
// no retail/video parity claim. Never manufacture spawnArmor as Zipcaster.
const EXTRA="export {zipcasterArmorSnapshot} from './patches/splatoon3/runtime/zipcaster-armor.mjs';";
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const enemy=f.make();enemy.team=1;enemy.pos.set(100,0,100);
  function make({surface='wall',distance=30,resistance=false}={}){
    const a=f.make();a.weapon={...a.weapon,special:'zipcaster',specialCost:100};a.special=100;
    a.invuln=0;a._resolve=()=>{};a.owner='victim';a.aimDir.set(0,0,1);a.aimPoint.set(0,1,35);
    if(resistance){a.s3.loadout[0].subs[0]='subResistance';a.s3RefreshGear();}
    f.G.physics.raycast=(origin,dir,_length,h)=>{
      h.hit=true;h.point.copy(origin).addScaledVector(dir,distance);
      h.normal.set(0,surface==='floor'?1:surface==='ceiling'?-1:0,surface==='wall'?-1:0);return h;
    };
    a._startSpecial();assert.equal(a.specialActive?.id,'zipcaster');
    return a;
  }
  const tick=(a,n=1,dt=1/60)=>{for(let i=0;i<n;i++){f.G.time+=dt;if(a.specialActive)a._updateSpecial(dt);}};
  const hook=a=>{a.intent.sub=true;tick(a);a.intent.sub=false;assert.equal(a._s3AllSpecialState.phase,'hookFlight');};
  const pulling=a=>{hook(a);for(let i=0;i<30&&a._s3AllSpecialState.phase!=='zip';i++)tick(a);assert.equal(a._s3AllSpecialState.phase,'zip');};
  const arrive=a=>{for(let i=0;i<150&&a._s3AllSpecialState.phase!=='hookWait';i++)tick(a);assert.equal(a._s3AllSpecialState.phase,'hookWait');};
  const hit=(a,amount,source='shooter',group=null)=>f.G.projectiles.applyHit(enemy,a,amount,source,group);
  return {f,enemy,make,tick,hook,pulling,arrive,hit,snapshot:f.zipcasterArmorSnapshot};
}
const near=(actual,expected,label='')=>assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} != ${expected}`);

test('Zipcaster armor starts at actual pull, not activation or hook flight, and zero HP lasts 20F once',async()=>{
  const w=await world(),a=w.make();
  assert.equal(w.snapshot(a),null);w.hook(a);assert.equal(w.snapshot(a),null);
  w.hit(a,20);near(a.hp,80,'hook flight is vulnerable');a.hp=100;
  for(let i=0;i<30&&a._s3AllSpecialState.phase!=='zip';i++)w.tick(a);
  assert.equal(w.snapshot(a).hp,30);w.hit(a,30);near(a.hp,100);
  assert.equal(w.snapshot(a).hp,0);near(w.snapshot(a).breakRemainingFrames,20);
  w.tick(a,19);w.hit(a,20);near(a.hp,100,'broken armor remains during its fixed grace');
  near(w.snapshot(a).breakRemainingFrames,1,'another hit cannot restart grace');
  w.tick(a);assert.equal(w.snapshot(a),null);w.hit(a,20);near(a.hp,80);
  w.tick(a);assert.equal(w.snapshot(a),null,'same pull cannot replenish broken armor');
});

test('Zipcaster 100 threshold and 80 penetration cap apply to native HP for individual and grouped hits',async()=>{
  const w=await world();
  for(const [amount,through] of [[50,0],[100,0],[120,20],[180,80],[220,80],[500,80]]){
    const a=w.make();w.pulling(a);w.hit(a,amount);near(a.hp,100-through,`hit ${amount}`);
  }
  const a=w.make();w.pulling(a);w.hit(a,53,'trizooka',781);w.hit(a,167,'trizooka',781);
  near(a.hp,20,'53 splash +167 direct upgrade is one capped 220 action');
  w.hit(a,10,'trizooka',781);near(a.hp,20,'the same action cannot exceed its 80 penetration cap');
  w.hit(a,120,'trizooka',782);near(a.hp,0,'a separate action gets its own threshold');
});

test('Sub Resistance reduces armor debit once; a lethal sub hit keeps its original 100+ classification',async()=>{
  const w=await world(),base=w.make(),resistant=w.make({resistance:true});
  w.pulling(base);w.pulling(resistant);
  w.hit(base,30,'bomb');w.hit(resistant,30,'bomb');
  assert.equal(w.snapshot(base).hp,0);
  near(w.snapshot(resistant).hp,30-30*resistant.s3.modifiers.subResistance,'sub resistance reaches armor before HP');
  assert.ok(w.snapshot(resistant).hp>0);near(resistant.hp,100);
  const strong=w.make({resistance:true});w.pulling(strong);w.hit(strong,180,'bomb');
  near(strong.hp,20,'180 enters armor unchanged; 80 penetration is not reduced a second time');
  const naked=w.make({resistance:true});w.hit(naked,80,'bomb');
  assert.ok(naked.hp>20,'negative control: raw 80 sub damage is ordinarily reduced');
  w.enemy.s3.modifiers.objectShredder=true;
  const shredder=w.make();w.pulling(shredder);w.hit(shredder,20);near(w.snapshot(shredder).hp,10,'Object Shredder has no player-armor multiplier');
});

test('Zipcaster arrival retires floor/ceiling armor immediately and wall armor at 18F',async()=>{
  const w=await world();
  for(const surface of ['floor','ceiling','wall']){
    const a=w.make({surface,distance:8});w.pulling(a);w.arrive(a);
    if(surface!=='wall'){assert.equal(w.snapshot(a),null);w.hit(a,20);near(a.hp,80);continue;}
    assert.equal(w.snapshot(a).phase,'wall');near(w.snapshot(a).remainingFrames,18);
    w.tick(a,17);assert.ok(w.snapshot(a));near(w.snapshot(a).remainingFrames,1);
    w.tick(a);assert.equal(w.snapshot(a),null);w.hit(a,20);near(a.hp,80);
  }
});

test('Held ZR cannot cancel wall armor before actual fire, including its full 18F when no shot is admitted',async()=>{
  const w=await world();
  for(const delayed of [false,true]){
    const a=w.make({distance:8});w.pulling(a);a.intent.fire=true;
    if(delayed)a.weaponRunner.cooldown=100;
    const fired=[];w.f.on('weapon:fire',e=>{if(e.actor===a)fired.push(e);});
    w.arrive(a);assert.ok(w.snapshot(a));assert.equal(fired.length,0,'held ZR is blocked during pull');
    let shotFrame=null;
    for(let frame=1;frame<=18;frame++){
      w.tick(a);
      if(fired.length&&shotFrame===null)shotFrame=frame;
      if(fired.length||frame===18)assert.equal(w.snapshot(a),null,`wall frame ${frame}, fired=${fired.length}`);
      else assert.ok(w.snapshot(a),`wall frame ${frame}: unaccepted ZR keeps protection`);
      if(frame<12)assert.equal(fired.length,0,'hookWait does not admit an attack');
    }
    if(delayed)assert.equal(shotFrame,null,'cooldown prevents actual fire through the 18F boundary');
    else assert.ok(shotFrame>=12&&shotFrame<18,`real shooter fires after hookWait, at ${shotFrame}`);
  }
});

test('Wall armor ends on actual squid form transition or admitted jump, never their blocked hookWait input',async()=>{
  const w=await world();
  for(const action of ['squid','jump']){
    const a=w.make({distance:8});w.pulling(a);w.arrive(a);a.intent[action]=true;
    const jumps=[];w.f.on('actor:jump',e=>{if(e.actor===a)jumps.push(e);});
    w.tick(a,12);assert.equal(a._s3AllSpecialState.phase,'ready');
    assert.ok(w.snapshot(a),'held action is still blocked by hookWait');
    assert.equal(a.form,'kid');assert.equal(jumps.length,0);
    // This fixture freezes integration; supply a support contact so the real
    // ready-state jump admission can execute. This does not model wall-jump physics.
    if(action==='jump')a.grounded=true;
    w.tick(a);assert.equal(w.snapshot(a),null,action);
    if(action==='squid')assert.equal(a.form,'squid');
    else {assert.equal(jumps.length,1);assert.ok(a.vel.y>0);}
  }
});

test('Extending another hook preserves wall armor until the next actual pull refreshes it',async()=>{
  const w=await world();
  const a=w.make({distance:8});w.pulling(a);w.arrive(a);w.hit(a,10);w.tick(a,12);
  assert.equal(a._s3AllSpecialState.phase,'ready');
  a.intent.sub=true;w.tick(a);a.intent.sub=false;
  assert.equal(a._s3AllSpecialState.phase,'hookFlight');assert.equal(w.snapshot(a).hp,20,'hook extension is not an armor cancel');
  for(let i=0;i<30&&a._s3AllSpecialState.phase!=='zip';i++)w.tick(a);
  assert.equal(w.snapshot(a).hp,30,'a distinct movement gets fresh armor');
});

test('Zipcaster is the single shield owner; ordinary spawn and roll pools remain untouched',async()=>{
  const w=await world(),a=w.make();w.pulling(a);
  a.s3.spawnArmorManaged=true;a.s3.spawnArmor={hp:30,remaining:3,breakRemaining:null};
  const actions=w.f.movementState(a);actions.armor={armorHP:30,armorTime:1,armorThreshold:100};a.form='squid';
  w.hit(a,220);near(a.hp,20);assert.equal(a.s3.spawnArmor.hp,30);assert.equal(actions.armor.armorHP,30);
  const spawn=w.make();spawn.s3.spawnArmorManaged=true;spawn.s3.spawnArmor={hp:30,remaining:3,breakRemaining:null};
  w.hit(spawn,120);near(spawn.hp,80,'ordinary spawn armor still owns its existing penetration law');
  const roll=w.make();roll.form='squid';w.f.movementState(roll).armor={armorHP:30,armorTime:1,armorThreshold:100};
  w.hit(roll,220);near(roll.hp,-20,'ordinary roll has no Zipcaster 80 cap');
});

test('Enemy ink and an invulnerable hit cannot spend Zipcaster armor or reserve a grouped hit',async()=>{
  const w=await world(),a=w.make();w.pulling(a);
  w.hit(a,5,'ink');near(a.hp,95);assert.equal(w.snapshot(a).hp,30);
  a.hp=100;a.invuln=1;w.hit(a,53,'trizooka',995);near(a.hp,100);assert.equal(w.snapshot(a).hp,30);
  a.invuln=0;w.hit(a,220,'trizooka',995);near(a.hp,20,'rejected hit did not take part of the 100 threshold or 80 cap');
});

test('Actual shooter contact and victim-owned hit delivery reach the Zipcaster armor owner',async()=>{
  const w=await world(),a=w.make();w.pulling(a);
  w.enemy.pos.copy(a.pos).add(new w.f.THREE.Vector3(0,0,-2));w.enemy.character.root.position.copy(w.enemy.pos);
  w.enemy.aimDir.set(0,0,1);w.enemy.aimPoint.copy(a.pos).y+=.7;
  w.f.G.physics.raycast=(_a,_b,_c,h)=>{h.hit=false;return h;};
  const pBefore=w.f.G.projectiles.list.length;w.f.G.projectiles.fireShooter(w.enemy,w.enemy.weapon,0);
  assert.ok(w.f.G.projectiles.list.length>pBefore,'native shooter emits a real projectile');
  for(let i=0;i<15&&w.snapshot(a)?.hp===30;i++)w.f.G.projectiles.update(1/60);
  assert.ok(w.snapshot(a).hp<30,'real native contact spends armor');near(a.hp,100);
  const fresh=w.make();w.pulling(fresh);const sent=[];
  w.f.G.netm={shouldApplyHit:()=> 'send',sendHit:(...args)=>{sent.push(args);return true;}};
  w.hit(fresh,220);near(fresh.hp,100,'sender does not predict remote-owned defense');assert.equal(w.snapshot(fresh).hp,30);
  w.f.G.netm=null;
  for(const args of sent)w.f.G.projectiles.applyHit(...args);
  near(fresh.hp,20,'victim-owned receive applies the capped penetration');
});

test('Zipcaster armor retires on reset/death/life/owner change and never grants authority to a replica',async()=>{
  const w=await world();
  for(const change of ['reset','death','life','owner','remote','end']){
    const a=w.make();w.pulling(a);assert.ok(w.snapshot(a));
    if(change==='reset')a.reset();
    if(change==='death')a.splat(null,'test');
    if(change==='life')a.netLife=(a.netLife||0)+1;
    if(change==='owner')a.owner='new-owner';
    if(change==='remote')a.remote=true;
    if(change==='end'){a._s3AllSpecialState.inkFuel=0;for(let i=0;i<120&&a.specialActive;i++)w.tick(a);}
    assert.equal(w.snapshot(a),null,change);
  }
});

test('20F break and 18F wall clocks use elapsed source time at 30/60/120Hz',async()=>{
  const w=await world();
  for(const hz of [30,60,120]){
    const a=w.make();w.pulling(a);w.hit(a,30);
    w.tick(a,Math.round(hz/3)-1,1/hz);assert.ok(w.snapshot(a),`${hz}Hz before 20F`);
    w.tick(a,1,1/hz);assert.equal(w.snapshot(a),null,`${hz}Hz at 20F`);
    const b=w.make({distance:8});w.pulling(b);w.arrive(b);
    w.tick(b,Math.round(hz*.3)-1,1/hz);assert.ok(w.snapshot(b),`${hz}Hz before 18F`);
    w.tick(b,1,1/hz);assert.equal(w.snapshot(b),null,`${hz}Hz at 18F`);
  }
});
