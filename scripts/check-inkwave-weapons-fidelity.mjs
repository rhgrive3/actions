#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './weapons-fixture.mjs';
import { CASES, reset, launch, finish, paintMetrics, measure } from './measure-weapons-fidelity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--site');
const site = path.resolve(at >= 0 ? process.argv[at + 1] : path.join(root, '_site'));
const near = (a,b,t=1e-7) => assert.ok(Math.abs(a-b) <= t, `${a} != ${b} ±${t}`);

const data = await measure({ site, fidelity: true, detail: false });
// Deterministic integrated-world receipts, not Nintendo meter measurements.
// PR1083 composes native InkFlight hurtboxes with the sourced trailing/nearest
// paint owners (Shooter/Dualies/Splatling), Roller maximum/impact paint and
// Slosher intermediate drops. These replace the prior pre-integration receipts.
// PR1168's reconciled Charger range maps the first legal linear charge (8/60)
// to DistanceMinCharge. Re-measured composed source and emitted-build receipts
// below retain that legal-minimum band and the canonical scoring-paint owner.
// Keep the .1-unit collision sweep and .25-unit scoring grid exact.
const golden = {
  shooter:[12.6,12.2,14.375,1],
  'dualies-normal':[12.2,11.5,14.375,1],
  'dualies-post':[12.3,11.5,14.375,1],
  blaster:[13.5,10.7,11.875,1],
  'splatling-partial':[14.7,14,16.875,1],
  'splatling-first':[20.1,19.4,22.375,1],
  'splatling-full':[20.1,19.4,22.375,1],
  'charger-0':[9.8,9.8,13.375,0],
  'charger-0.25':[11.8,11.8,14.875,0],
  'charger-0.5':[16.1,16.1,18.875,0],
  'charger-0.75':[20.4,20.4,23.375,0],
  'charger-1':[24.8,24.8,26.875,0],
  // #771: the horizontal Roller launch yaw now consumes the pinned
  // SwerveRateBySpeed, so the fixed-seed practical hit boundary moves one
  // 0.1-unit sample (11.2 -> 11.1). Paint bound, full-damage range and the
  // 12+1 glob count are unchanged.
  'roller-horizontal':[11.1,6.1,14.125,13],
  'roller-vertical':[16.3,6.9,19.125,5],
  slosher:[13.5,13.5,13.625,9],
};
for (const [key,[hit,full,paint,count]] of Object.entries(golden)) {
  const c = data.cases[key];
  near(c.practicalHitRange,hit); near(c.fullDamageRange,full);
  near(c.paint.bounds.maxZ,paint,.001); assert.equal(c.projectileCount,count,key);
}
// Independently execute the current unminified six-adapter source graph at the
// measured hit boundary and on the real paint grid. The built receipt cannot
// become a replacement for source/build equivalence.
const sourceFixture = await fixture({ site:path.join(root,'.ci-scratch/unbuilt-weapons-source'), fidelity:true });
for (const c of CASES) {
  const expected=data.cases[c.key];
  let actor=reset(sourceFixture,c);launch(sourceFixture,actor,c);finish(sourceFixture,actor);
  assert.deepEqual(paintMetrics(sourceFixture).bounds,expected.paint.bounds,c.key+' source/build paint bounds');
  for(const z of [expected.practicalHitRange,Math.round((expected.practicalHitRange+.1)*10)/10]){
    actor=reset(sourceFixture,c,z);launch(sourceFixture,actor,c);finish(sourceFixture,actor);
    const damage=sourceFixture.hits.reduce((sum,hit)=>sum+hit.damage,0);
    const recorded=expected.hitSamples.find(sample=>sample.z===z);
    near(damage,recorded.damage,1e-7);
  }
}
assert.equal(data.runner.blaster.shots,4);
for (const interval of data.runner.blaster.intervals) near(interval,50/60,1e-7);
assert.equal(data.runner['splatling-full'].shots,40);
near(data.runner['splatling-full'].inkSpent,22.5);
near(data.runner['charger-1'].inkSpent,18);

// Exercise the installed packet recorder, including the existing replication
// mode/seed/identity prefix and owner-tick/sequence footer. The unit is inserted
// between that unchanged prefix and footer, after the native ink-flight metadata and kit columns.
for (const key of ['shooter','roller-horizontal','roller-vertical']) {
  const c = CASES.find(x => x.key === key);
  const f = await fixture({ site, fidelity:true, floor:false, network:true });
  const a = reset(f,c); a.nid=42;
  // Use the installed recorder, including the existing birth metadata and
  // owner-tick/sequence footer. This adds no protocol fields or runtime changes.
  const network={s:{_inkwaveEventSeq:0},mute:0,out:[],_rec:f.NetMatch.prototype._rec,recProj:f.NetMatch.prototype.recProj,recSplat(){},shouldApplyHit:f.NetMatch.prototype.shouldApplyHit};
  f.G.netm=network; launch(f,a,c); const locals=[...f.projectiles.list], packets=network.out;
  assert.equal(packets.length,locals.length,key);
  for (const [i,p] of packets.entries()) {
    assert.equal(p.length,36,key+' complete packet shape');
    assert.deepEqual(p[27],locals[i].inkMeta||null,key+' native ink-flight metadata slot');
    assert.equal(p[28],0,key+' ordinary projectile volley index');
    assert.equal(p[29],0,key+' ordinary projectile action index');
    assert.equal(p[30],locals[i].s3Vertical?1:0,key+' birth mode');
    assert.equal(p[31],locals[i].seed,key+' appearance seed');
    assert.equal(p[32],locals[i]._netId,key+' projectile identity');
    assert.equal(p[33],locals[i].fidelityRollerUnitIndex ?? -1,key+' immutable roller unit');
    assert.equal(p[34],Math.round((f.G.time||0)*60),key+' owner tick');
    assert.equal(p[35],i+1,key+' event sequence');
  }
  assert.equal(network.s._inkwaveEventSeq,packets.length,key+' session event sequence');
  const ghost=f.make(c.id,{name:'remote'}); ghost.remote=true; f.projectiles.list.length=0;
  packets.forEach(e=>f.projectiles.ghostProjectile(ghost,e)); const ghosts=[...f.projectiles.list];
  assert.equal(ghosts.length,locals.length,key);
  for(let i=0;i<locals.length;i++){
    const p=locals[i],q=ghosts[i];
    assert.equal(q.fidelityMode,p.fidelityMode,key);
    if (key.startsWith('roller-')) {
      near(q.fidelityPlayerCollision.initRadius,p.fidelityPlayerCollision.initRadius,1e-9);
      near(q.fidelityPlayerCollision.endRadius,p.fidelityPlayerCollision.endRadius,1e-9);
      near(q.fidelityPlayerCollision.changeTime,p.fidelityPlayerCollision.changeTime,1e-9);
    }
    near(q.straight,p.straight,.00051); near(q.life,p.life,.00051);
    for(let step=0;step<20;step++){
      f.advanceFidelityProjectile(p,1/60); f.advanceFidelityProjectile(q,1/60);
      assert.ok(p.pos.distanceTo(q.pos)<.012,`${key} remote drift ${p.pos.distanceTo(q.pos)}`);
    }
    assert.equal(q.damage,0,key+' ghost damage');
  }
}
// `duplicateBurst` is the positive control only: it forces one extra REAL native
// application inside the wall-drop so the applied-burst accounting below is proven to
// report 2 and therefore able to fail the single-application assertion.
async function wallDropCase(id, dt = 1/60, ghost = false, { duplicateBurst = false } = {}) {
  const f = await fixture({ site, fidelity:true, floor:true, seed:0x576597 });
  f.wall(4, { height:8 });
  const weapon = id.startsWith('roller-') ? 'roller' : id;
  const a = f.make(weapon);
  a.aimPoint.set(0, 1.05, 20);
  // Count the burst where it is APPLIED to the world, not where it is requested.
  // #729 deliberately turns one terrain impact into an enqueue plus a next-tick
  // application, so wrapping _blastBurst counted the deferral as a second burst and
  // reported a duplicate that never reaches the world. G.fx.explosion is the native
  // application boundary the upstream burst calls, so it measures the effect itself
  // and cannot miss an unrelated burst that took some other path.
  let bursts = 0, ticks = 0;
  const explosionTicks = [];
  const fx = f.G.fx ?? (f.G.fx = {});
  // G.fx was null here, so every fx call was already an optional-call no-op. Supply the
  // plain particle entry point as a no-op and keep anything the fixture already had.
  if (typeof fx.burst !== 'function') fx.burst = () => {};
  const realExplosion = fx.explosion;
  fx.explosion = (...args) => { bursts++; explosionTicks.push(ticks); return realExplosion?.apply(fx,args); };
  const nativeBurst = f.projectiles._blastBurst;
  if (id === 'blaster') f.projectiles.fireBlaster(a,a.weapon,0);
  else if (id === 'splatling') {
    a.weaponRunner.fidelitySplatlingCharge = 1;
    f.projectiles.fireSplatling(a,a.weapon,0);
  } else if (id === 'dualies') f.projectiles.fireDualies(a,a.weapon,0,0);
  else {
    a.weaponRunner.s3FlickVertical = id === 'roller-vertical';
    f.projectiles.fireFlick(a,a.weapon);
  }
  let p;
  if (id === 'roller-horizontal-near') p = f.projectiles.list.find(x=>x.s3FlickUnit===1);
  else p = f.projectiles.list[0];
  assert.ok(p, id+' projectile created');
  if (id.startsWith('roller-')) f.projectiles.list.splice(0,f.projectiles.list.length,p);
  if (ghost) p.ghost = true;
  let state = null, contactTick = -1, injected = false;
  for (let i=0; i<600 && f.projectiles.list.includes(p); i++) {
    ticks++;
    f.G.time += dt;
    f.projectiles.update(dt);
    if (!state && p.fidelityWallDrop) {
      assert.ok(p.prev.distanceTo(p.pos)<1e-9,id+' contact frame starts at the wall, not overshoot');
      const s=p.fidelityWallDrop;
      state={firstFrames:s.firstFrames,secondFrames:s.secondFrames,lastFrames:s.lastFrames,
        firstSpeed:s.firstSpeed,secondSpeed:s.secondSpeed,shockRadius:s.shockRadius,
        fallRadius:s.fallRadius,groundRadius:s.groundRadius};
      contactTick = ticks;
      // A real duplicate: apply the native burst once more with the #729 deferral
      // marker cleared, so the extra explosion is genuinely applied to the world.
      if (duplicateBurst && !injected) {
        injected = true;
        const marked = p.s3TerrainBurst;
        p.s3TerrainBurst = false;
        try { nativeBurst.call(f.projectiles, p, p.pos, null); }
        finally { p.s3TerrainBurst = marked; }
      }
    }
  }
  assert.ok(state,id+' retained wall-drop state');
  assert.ok(!f.projectiles.list.includes(p),id+' wall-drop terminates');
  return {f,p,state,bursts,explosionTicks,contactTick};
}

const wallExpected={
  blaster:{first:[15,30],second:35,last:[20,35],speeds:[.07,.04],radii:[1.3,1,.6]},
  splatling:{first:[15,30],second:5,last:[15,30],speeds:[.06,.06],radii:[1.3,.65,.6]},
  dualies:{first:[20,40],second:10,last:[15,35],speeds:[.06,.06],radii:[1.3,.65,.6]},
  'roller-horizontal-main':{first:[60,80],second:5,last:[20,35],speeds:[0,.08],radii:[0,0,.5]},
  'roller-horizontal-near':{first:[60,80],second:5,last:[20,35],speeds:[.06,.08],radii:[1.3,.65,.5]},
  'roller-vertical':{first:[60,80],second:5,last:[20,35],speeds:[.08,.10],radii:[1.4,.7,.65]},
};
for (const id of Object.keys(wallExpected)) {
  const r=await wallDropCase(id),e=wallExpected[id],s=r.state;
  assert.ok(s.firstFrames>=e.first[0]&&s.firstFrames<=e.first[1],id+' first phase');
  assert.equal(s.secondFrames,e.second,id+' second phase');
  assert.ok(s.lastFrames>=e.last[0]&&s.lastFrames<=e.last[1],id+' last phase');
  near(s.firstSpeed,e.speeds[0]); near(s.secondSpeed,e.speeds[1]);
  near(s.shockRadius,e.radii[0]); near(s.fallRadius,e.radii[1]); near(s.groundRadius,e.radii[2]);
  for (const radius of e.radii.filter(x=>x>0)) assert.ok(r.f.paints.some(x=>Math.abs(x.radius-radius)<1e-9),id+' paint radius '+radius);
  if (id==='blaster') {
    assert.equal(r.bursts,1,'terrain Blaster burst remains single-application');
    // The applied burst must stay exactly one fixed tick after contact, so this
    // accounting fix cannot quietly relax #729's post-tick ordering.
    assert.ok(r.contactTick>0,'the wall-drop contact tick is recorded');
    assert.deepEqual(r.explosionTicks,[r.contactTick+1],'the single applied terrain burst stays at N+1');
  }
}

// Positive control: a genuinely duplicated terrain burst must be counted as 2, so the
// single-application assertion above is proven able to fail rather than always passing.
{
  const dup = await wallDropCase('blaster', 1/60, false, { duplicateBurst: true });
  assert.equal(dup.bursts, 2, 'a genuinely duplicated terrain blast must be counted, or the single-application assertion is vacuous');
  assert.notEqual(dup.bursts, 1, 'the duplicate control must not collapse back to a single applied burst');
}

// Render/update cadence cannot choose different sourced random periods or lose
// the terminal ground paint. The authoritative game still runs fixed 60 Hz;
// this regression additionally keeps the retained state stable if scheduling
// hands it 30/60/120 Hz-sized chunks.
const cadence=[];
for (const dt of [1/30,1/60,1/120]) {
  const r=await wallDropCase('blaster',dt);
  cadence.push([r.state.firstFrames,r.state.lastFrames]);
  assert.ok(r.f.paints.some(x=>Math.abs(x.radius-.6)<1e-9),'ground paint at '+Math.round(1/dt)+' Hz');
}
assert.deepEqual(cadence,[cadence[0],cadence[0],cadence[0]],'wall-drop source periods are cadence-independent');

// A remote/ghost projectile replays the same retained motion but never owns
// authoritative paint. No new packet field is required because its existing
// seed chooses the same first/last source-frame periods.
const ghost=await wallDropCase('splatling',1/60,true);
assert.equal(ghost.f.paints.length,0,'ghost wall-drop cannot mutate turf');
const ghostDualies=await wallDropCase('dualies',1/60,true);
assert.equal(ghostDualies.f.paints.length,0,'ghost Dualies wall-drop cannot mutate turf');

// Player contact remains terminal projectile damage, not terrain wall-drop.
{
  const f=await fixture({site,fidelity:true,floor:true,seed:0x576597});
  f.wall(5,{height:8});
  const a=f.make('blaster'),victim=f.make('shooter',{team:1,z:2,hp:100000});
  a.aimPoint.set(0,1.05,20); f.G.actors=[a,victim];
  f.projectiles.fireBlaster(a,a.weapon,0);
  const p=f.projectiles.list[0];
  for(let i=0;i<60&&f.projectiles.list.includes(p);i++){f.G.time+=1/60;f.projectiles.update(1/60);}
  assert.equal(p.fidelityWallDrop,null,'direct player hit never enters wall-drop');
}

// Once a terrain hit has converted the projectile to wall ink, that retained
// state must never regain projectile HP damage on its terminal frame.
//
// The victim must only exist once the IMPACT blast has already resolved. #729 defers
// that blast to contact+1, and the wall-drop contact point sits inside its own splash
// radius, so a victim added on the contact tick catches the legitimate impact splash
// (35 HP here) and this guard would misreport it as retained-ink damage. Measured on the
// bound site: contact tick 4, victim added tick 4, the single hit at tick 5 = contact+1,
// victim distance to the wall-drop column 0. The damage is the deferred impact burst, not
// the retained fall. So the impact tick is allowed to resolve first and the victim is
// then placed on the retained path, where the guard actually measures what it claims.
// The legitimate contact+1 blast damage stays asserted by the owned #729 suite
// ("ground contact: ... burst and damage at R+1"), and the burst itself is required to
// have happened here, so nothing is spliced away.
{
  const f=await fixture({site,fidelity:true,floor:true,seed:0x576597});
  f.wall(4,{height:8});
  const a=f.make('blaster'); a.aimPoint.set(0,1.05,20); f.G.actors=[a];
  let bursts=0; const fx=f.G.fx??(f.G.fx={}); if(typeof fx.burst!=='function')fx.burst=()=>{};
  const realExplosion=fx.explosion; fx.explosion=(...args)=>{bursts++;return realExplosion?.apply(fx,args);};
  f.projectiles.fireBlaster(a,a.weapon,0);
  const p=f.projectiles.list[0];
  for(let i=0;i<120&&!p.fidelityWallDrop;i++){f.G.time+=1/60;f.projectiles.update(1/60);}
  assert.ok(p.fidelityWallDrop,'wall-drop begins before terminal damage guard test');
  // One tick only, so the #729 deferred impact burst resolves at contact+1 before any
  // victim exists. No extra time, no loosened threshold: the blast must land right here.
  f.G.time+=1/60; f.projectiles.update(1/60);
  assert.equal(bursts,1,'the impact blast resolves at contact+1 before the victim exists');
  assert.equal(f.hits.length,0,'no actor is damaged by the impact burst in this guard');
  const dropZ=p.pos.z;
  const victim=f.make('shooter',{team:1,z:dropZ,hp:100000});
  f.G.actors.push(victim); const hp=victim.hp;
  // The victim really is standing on the retained wall-drop path.
  assert.ok(Math.abs(victim.pos.z-dropZ)<1e-9,'victim is placed on the retained wall-drop path');
  for(let i=0;i<300&&f.projectiles.list.includes(p);i++){f.G.time+=1/60;f.projectiles.update(1/60);}
  assert.ok(p.fidelityWallDrop,'the retained wall-drop ran to completion');
  assert.equal(f.hits.length,0,'the retained wall ink deals no projectile HP damage at all');
  assert.equal(victim.hp,hp,'retained wall ink never deals projectile HP damage');
}

// Network catch-up originally budgets a ghost from the projectile's flight life.
 // Blaster wall-drop outlives its 13F airburst lifetime, so the terrain transition
 // must extend that existing projectile's budget without adding a packet field.
 {
  const f=await fixture({site,fidelity:true,floor:true,seed:0x576597,network:true});
  f.wall(4,{height:8});
  const a=f.make('blaster'); a.nid=42; a.aimPoint.set(0,1.05,20);
  const packets=[];
  const recorder={s:{_inkwaveEventSeq:0},mute:0,out:packets,_rec:f.NetMatch.prototype._rec,recProj:f.NetMatch.prototype.recProj,recSplat(){},shouldApplyHit:f.NetMatch.prototype.shouldApplyHit};
  f.G.netm=recorder;
  f.projectiles.fireBlaster(a,a.weapon,0);
  assert.equal(packets.length,1,'Blaster birth packet recorded');
  const ghost=f.make('blaster',{name:'remote'}); ghost.remote=true;
  f.projectiles.list.length=0; f.paints.length=0;
  f.projectiles.ghostProjectile(ghost,packets[0]);
  const q=f.projectiles.list[0];
  assert.ok(q?.ghost,'remote Blaster ghost reconstructed');
  q._netBorn=0; q._netBornTick=0; q._netSteps=0;
  q._netPeer={tr:4,lastTs:4,sim:240};
  q._netMaxSteps=Math.ceil((q.life+Math.max(0,q.delay||0))*60)+2;
  const birthBudget=q._netMaxSteps;
  f.G.netm={mute:0};
  f.projectiles.update(1/60);
  assert.ok(q.fidelityWallDrop,'ghost reaches retained wall-drop during catch-up');
  assert.ok(q._netMaxSteps>birthBudget,'wall-drop extends the original ghost catch-up budget');
  for(let i=0;i<4&&f.projectiles.list.includes(q);i++) f.projectiles.update(1/60);
  assert.ok(!f.projectiles.list.includes(q),'extended ghost budget reaches deterministic wall-drop terminal');
  assert.equal(f.paints.length,0,'network ghost wall-drop remains non-authoritative for turf');
 }

console.log(JSON.stringify({status:'passed',contentHash:data.artifactIdentity.contentHash,cases:Object.keys(golden).length,networkModes:3,wallDropFamilies:4,wallDropCases:Object.keys(wallExpected).length,completion:'finite-charger-continuous-collision-wall-drop'}));
