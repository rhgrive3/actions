#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fixture } from './weapons-fixture.mjs';
import { CASES, reset, launch, finish, paintMetrics, measure, projectileParams } from './measure-weapons-fidelity.mjs';
import { isSourcedStamp, rasterFlatSourcedStamp } from './lib/source-paint-oracle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--site');
const site = path.resolve(at >= 0 ? process.argv[at + 1] : path.join(root, '_site'));
const near = (a,b,t=1e-7) => assert.ok(Math.abs(a-b) <= t, `${a} != ${b} ±${t}`);

const data = await measure({ site, fidelity: true, detail: false });
// Preserve the old archives. Only the reviewed silhouettes, the previously
// approved Roller birth correction and the Spinner relative-speed correction
// replace their affected receipts; unchanged physics stays bound to history.
const baselineBytes = fs.readFileSync(new URL('./fixtures/weapons-fidelity-9c070329.json', import.meta.url));
assert.equal(createHash('sha256').update(baselineBytes).digest('hex'), 'b79883e3c0e14e0a4ba9577d01d162dbcfe530a7d03c75b22187df18c0ea1259');
const baseline = JSON.parse(baselineBytes);
assert.equal(baseline.baselineCommit, '9c0703298aed297667837533c32454cc60980603');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// #1512 intentionally changes only Roller birth positions, which also moves
// landing/scoring cells and hit-sweep samples. Keep the old archive intact and
// pin the two corrected rows separately. The source inverse-birth proof below
// still requires every non-position birth field to match the old archive.
const rollerBytes = fs.readFileSync(new URL('./fixtures/weapons-fidelity-roller-birth-8e55bfcb.json', import.meta.url));
assert.equal(createHash('sha256').update(rollerBytes).digest('hex'), '48ea0079e7fffca667ffa3626abbb34c2b42eb1d7997c4ff64df4db5c54fd9f4');
const rollerBaseline = JSON.parse(rollerBytes);
assert.equal(rollerBaseline.baselineCommit, '8e55bfcbcdf9cd82df76dbf1a6948f9a075b6719');
assert.deepEqual(Object.keys(rollerBaseline.cases), ['roller-horizontal', 'roller-vertical']);
const expectedCases = { ...baseline.cases, ...rollerBaseline.cases };
function pinnedFixture(name,hash) {
  const bytes=fs.readFileSync(new URL('./fixtures/'+name,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name+' immutable receipt');
  return JSON.parse(bytes);
}
const physicalBaseline=pinnedFixture('weapons-physical-bf9a8a92.json','07bcfd60ef35aacd055144413f27ef20e13b8e4e95435dc703bc0aa183719dc3');
const current=pinnedFixture('weapons-fidelity-main-20261017.json','7dc914f9bbf1a85639ba9562ff8ad2318d7a41ff8ebe58d733471192c02cb548');
const contours=pinnedFixture('weapons-fidelity-contours-20261018.json','6542db95eef491315ceaa4e854ab05d81199f06f026f87064281cd18e9837e6c');
assert.equal(physicalBaseline.baselineCommit,'bf9a8a9270b349a3b20c9550ff6ed78a61c9e729');
assert.deepEqual(Object.keys(current.cases),CASES.map(c=>c.key));
for(const c of CASES) {
  const prior=physicalBaseline.cases[c.key];
  assert.equal(digest(prior.initialProjectiles),baseline.cases[c.key].initialProjectilesHash,c.key+' independent old checkout reproduces every archived birth');
  assert.equal(prior.oldCellsHash,baseline.cases[c.key].cellsHash,c.key+' independent old checkout reproduces archived scoring');
}
// The shared Roller spawn base (ROLLER_SPAWN_BASE, 1.30 -> 1.35 m) moves only
// the two Roller rows' births, and with them their landings, scoring cells,
// stamps and hit-sweep samples. The ranges, reach and glob counts stay equal to
// the main receipt. Keep that receipt intact and pin the two rows separately;
// the inverse-birth proof below removes the base shift as well.
const spawnBase=pinnedFixture('weapons-fidelity-roller-spawn-base-20261018.json','14188c7eb7ee27db12cca9ffd4af765cb573d7756db68fd619d13426fdc318b5');
assert.deepEqual(Object.keys(spawnBase.cases),['roller-horizontal','roller-vertical']);
assert.equal(spawnBase.contentHash,digest(spawnBase.cases));
for(const [key,row] of Object.entries(spawnBase.cases))assert.deepEqual(row.golden,current.cases[key].golden,key+' spawn base keeps reach and counts');
const golden = Object.fromEntries(Object.entries(current.cases).map(([key, row]) => [key, row.golden]));
// The reviewed Charger silhouette intentionally changes scoring pixels and
// forward ink reach, not the pinned source width/depth, projectile births,
// hit sweeps or stamp timing. These five observed areas/maxZ are fixed from
// exact-head Validate #39087874007 (02:22 UTC, 2026-10-18), NOT inferred
// from the old circular/stencil archive. Keep these earlier observations as
// an additional constraint on the new exact-cell/stamp receipt. The reviewed
// Blaster/Splatling masks are pinned separately too; all physical history and
// the independent frozen edge oracle below remain required.
const chargerOrganic = Object.freeze({
  'charger-0': { maxZ:13.125, area:24.4375 },
  'charger-0.25': { maxZ:15.125, area:25.625 },
  'charger-0.5': { maxZ:18.875, area:35.5625 },
  'charger-0.75': { maxZ:22.625, area:51.625 },
  'charger-1': { maxZ:26.625, area:73.5 },
});
assert.deepEqual(Object.keys(contours.cases).sort(),['blaster',...Object.keys(chargerOrganic),'splatling-partial','splatling-first','splatling-full'].sort(),'reviewed contour receipt scope');
for (const [key,[hit,full,paint,count]] of Object.entries(golden)) {
  const c = data.cases[key], expected = spawnBase.cases[key] || current.cases[key], organic = chargerOrganic[key], contour=contours.cases[key];
  if (organic) {
    assert.notEqual(digest(c.paint.cellsXZ), expected.cellsHash, key + ' new organic Charger contour must differ from the old stamp');
    near(c.paint.area, organic.area, 1e-7);
  }
  assert.equal(digest(c.paint.cellsXZ), contour?.cellsHash ?? expected.cellsHash, key + ' main scoring cells');
  if(contour)near(c.paint.area,contour.area);
  assert.equal(digest(c.hitSamples), expected.hitSamplesHash, key + ' main full hit sweep');
  assert.equal(digest(c.initialProjectiles), expected.initialProjectilesHash, key + ' main projectile births');
  assert.equal(digest(c.paintPoints),contour?.paintPointsHash ?? expected.paintPointsHash,key+' all source stamp dimensions and recorded shape');
  assert.equal(digest(c.groundImpacts),expected.impactsHash,key+' all terrain impacts');
  if(!key.startsWith('splatling-')&&!spawnBase.cases[key]) {
    assert.equal(digest(c.hitSamples),expectedCases[key].hitSamplesHash,key+' unaffected hit sweep remains pinned');
    assert.equal(digest(c.initialProjectiles),expectedCases[key].initialProjectilesHash,key+' unaffected birth remains pinned');
  }
  near(c.practicalHitRange,hit); near(c.fullDamageRange,full);
  near(c.paint.bounds.maxZ,contour?.maxZ ?? paint,.001); assert.equal(c.projectileCount,count,key);
}
// Independently execute the current unminified six-adapter source graph at the
// measured hit boundary and on the real paint grid. The built receipt cannot
// become a replacement for source/build equivalence.
const sourceFixture = await fixture({ site:path.join(root,'.ci-scratch/unbuilt-weapons-source'), fidelity:true });
// The archives were captured with the native 1.30 m Roller birth height.
const ROLLER_BASE_SHIFT = sourceFixture.ROLLER_SPAWN_BASE.height - 1.3;
// Independently remove only the two sourced birth-coordinate deltas from raw
// pre-integration rounds, then compare the complete legacy birth record. This
// catches changes to speed, radii, damage, lifetime, RNG-derived appearance,
// count and every other serialized birth property instead of blessing them
// through the new golden. Round once, after the inverse, as in the archive.
for (const c of CASES.filter(row => row.id === 'roller')) {
  const actor = reset(sourceFixture, c);
  launch(sourceFixture, actor, c);
  const raw = sourceFixture.profile.weaponsFidelityCompletion.weapons.roller;
  const groups = raw[c.vertical ? 'VerticalSwingUnitGroupParam' : 'WideSwingUnitGroupParam'].Unit;
  assert.equal(raw.WideSwingUnitGroupParam.Unit[0].SpawnPositionWidth, .8);
  assert.deepEqual(raw.VerticalSwingUnitGroupParam.Unit.map(unit => unit.SpawnPositionHeight || 0), [0, .25, .25]);
  const offsets = new Map();
  const legacyBirths = sourceFixture.projectiles.list.map(p => {
    const group = p.fidelityRollerUnitIndex, unit = groups[group];
    const offset = offsets.get(group) || 0;
    offsets.set(group, offset + 1);
    const start = p.start.clone();
    start.y -= ROLLER_BASE_SHIFT;
    if (c.vertical) start.y += (1 - offset) * (unit.SpawnPositionHeight || 0);
    else {
      const count = unit.BulletNum ?? 1, fan = count > 1 ? 2 * offset / (count - 1) - 1 : 0;
      start.x += fan * (unit.SpawnPositionWidth || 0) * .5;
    }
    return projectileParams({ ...p, start });
  });
  assert.equal(digest(legacyBirths), baseline.cases[c.key].initialProjectilesHash, c.key + ' only the reviewed birth coordinates differ from the archived gameplay');
}
// Independent scalar raster of sourced stamps on this fixture's flat grid.
// It scans every cell and reads frozen profile bytes, without importing the
// production profile generator, mask or culling helpers.
// Generic stamps keep their existing mask; their observed deltas are included
// separately and are not claimed as an independent generic-mask oracle.
const paintSystem=sourceFixture.G.paint,realSplat=paintSystem.splat;
let sourceCells,sourceStampCount;
paintSystem.splat=function(center,radius,team,opts={}){
  assert.equal(team,0,'golden fixture paint owner');
  const stamp={center,radius,team,...opts},sourced=isSourcedStamp(stamp);
  const before=sourced?null:Uint8Array.from(this.grid);
  if(sourced&&!opts.cosmetic){
    sourceStampCount++;
    rasterFlatSourcedStamp(this,sourceCells,stamp);
  }
  const value=realSplat.call(this,center,radius,team,opts);
  if(!sourced)for(let i=0;i<this.grid.length;i++)if(this.grid[i]!==before[i])sourceCells[i]=this.grid[i];
  return value;
};

// Restore the prior masks without changing physical stamp dimensions. #1525
// also opted the one release-time Roller foot stamp into SOURCE_SPLASH; that
// stamp used the generic mask before this change, unlike the flight stamps.
const circleFixture=await fixture({site:path.join(root,'.ci-scratch/unbuilt-weapons-circle-control'),fidelity:true});
const circleSplat=circleFixture.G.paint.splat;
let circleCase;
circleFixture.G.paint.splat=function(center,radius,team,opts={}){
  if(circleCase.id==='blaster'&&opts.footprint==='ink-blast-rectified'){
    assert.ok(opts.kind==='source-shot'||opts.kind==='source-splash','only the two reviewed native burst phases');
    assert.deepEqual(Array.from(opts.stretch.toArray()),[0,0,1],'saved incoming bearing');
    assert.equal(opts.stretchAmt,0,'orientation does not extend physical radius');
    // #1583/#1585 added a mask bearing and moved the falling phase from the
    // generic drop mask to SOURCE_SPLASH. Restore exactly these metadata fields,
    // retaining center/radius/seed/time/ownership and the complete flight.
    return circleSplat.call(this,center,radius,team,{...opts,footprint:null,kind:opts.kind==='source-splash'?'drop':'source-shot',stretch:undefined,stretchAmt:undefined});
  }
  if(circleCase.id==='roller'&&this===circleFixture.G.paint&&circleFixture.G.time===0&&circleFixture.paints.length===0){
    assert.equal(opts.kind,'source-splash','release foot stamp entered the sourced mask');
    assert.equal(opts.footprint,'ink-flick','release foot stamp uses the reviewed Roller profile');
    assert.equal(opts.stretchAmt,0,'release foot heading adds no physical stretch');
    assert.deepEqual(Array.from(opts.stretch.toArray()),[0,0,1]);
    return circleSplat.call(this,center,radius,team,{...opts,footprint:null,kind:undefined,stretch:undefined,stretchAmt:undefined});
  }
  return circleSplat.call(this,center,radius,team,{...opts,footprint:null});
};
const plain=value=>JSON.parse(JSON.stringify(value));
const physicalStamps=stamps=>plain(stamps.map(({area,footprint,...stamp})=>stamp));
function legacyPhysicalStamps(c,stamps,prior){
  const result=physicalStamps(stamps);
  if(c.id==='blaster'){
    assert.deepEqual(stamps.map((s,i)=>s.footprint==='ink-blast-rectified'?i:null).filter(i=>i!==null),[1,7],'exactly the reviewed sphere/falling stamps');
    for(const [i,kind] of [[1,'source-shot'],[7,'source-splash']]){
      const s=result[i],old=physicalStamps(prior.paintPoints)[i];
      assert.equal(s.kind,kind,'reviewed burst phase kind');
      assert.deepEqual(s.stretch,[0,0,1],'reviewed burst bearing');
      assert.equal(s.stretchAmt,0,'reviewed burst keeps spherical dimensions');
      assert.equal(old.kind,i===1?'source-shot':'drop','immutable historical burst kind');
      assert.equal(old.stretch,null);assert.equal(old.stretchAmt,null);
      result[i]={...s,kind:old.kind,stretch:old.stretch,stretchAmt:old.stretchAmt};
    }
  }
  return result;
}
for (const c of CASES) {
  const expected=data.cases[c.key];
  let actor=reset(sourceFixture,c);sourceCells=new Uint8Array(paintSystem.grid.length);sourceStampCount=0;
  launch(sourceFixture,actor,c);
  const births=plain(sourceFixture.projectiles.list.map(projectileParams)),prior=physicalBaseline.cases[c.key];
  assert.equal(sourceFixture.draws(),prior.birthDraws,c.key+' unchanged birth RNG consumption');
  assert.deepEqual(births,plain(expected.initialProjectiles),c.key+' source/build every birth field');
  if(c.id==='splatling') {
    const base=c.charge>=2/3?126:63+(126-63)*(c.charge/(2/3));
    for(let i=0;i<births.length;i++) {
      const {velocity:oldVelocity,...oldRest}=prior.initialProjectiles[i],{velocity,...rest}=births[i];
      assert.deepEqual(rest,oldRest,c.key+' only birth velocity changes');
      const oldNorm=Math.hypot(...oldVelocity),norm=Math.hypot(...velocity);
      const biasedDraw=(oldNorm-base)/7.2;
      near(norm,base*(1+.12*biasedDraw),1e-7);
      for(let axis=0;axis<3;axis++)near(velocity[axis]/norm,oldVelocity[axis]/oldNorm,1e-8);
    }
  }
  finish(sourceFixture,actor);
  assert.equal(sourceFixture.draws(),prior.flightDraws,c.key+' unchanged complete-flight RNG consumption');
  if(c.id!=='splatling'&&c.id!=='roller') {
    assert.deepEqual(legacyPhysicalStamps(c,sourceFixture.paints,prior),physicalStamps(prior.paintPoints),c.key+' same historical stamp position, width, depth, seed and time');
    assert.deepEqual(plain(sourceFixture.impacts),prior.impacts,c.key+' unchanged physical terrain impacts');
  }
  assert.ok(sourceStampCount>0,c.key+' sourced stamp oracle exercised');
  assert.deepEqual(Uint8Array.from(paintSystem.grid),sourceCells,c.key+' independent sourced scoring cells');
  const sourcePaint=paintMetrics(sourceFixture);
  assert.deepEqual(sourcePaint.bounds,expected.paint.bounds,c.key+' source/build paint bounds');
  assert.deepEqual(sourcePaint.cellsXZ,expected.paint.cellsXZ,c.key+' source/build every scoring cell');
  assert.deepEqual(plain(sourceFixture.paints),expected.paintPoints,c.key+' source/build every stamp and seed');
  if(c.id!=='splatling') {
    circleCase=c;
    const controlActor=reset(circleFixture,c);launch(circleFixture,controlActor,c);finish(circleFixture,controlActor);
    const circlePaint=paintMetrics(circleFixture);
    // Roller base shift moves its painted pixels, but preserves frozen masks.
    // Use the independent new-origin receipt only for the two shifted cases.
    assert.equal(digest(circlePaint.cellsXZ),spawnBase.cases[c.key]?.circleCellsHash??expectedCases[c.key].cellsHash,c.key+' restoring the prior mask metadata restores every archived scoring cell');
    const subjectStamps=legacyPhysicalStamps(c,sourceFixture.paints,prior);
    if(c.id==='roller') {
      assert.equal(subjectStamps[0].time,0,'one release-time Roller foot stamp');
      const priorFoot=physicalStamps(prior.paintPoints)[0];
      subjectStamps[0]={...subjectStamps[0],kind:null,stretch:null,stretchAmt:null};
      assert.deepEqual(subjectStamps[0],priorFoot,c.key+' unchanged foot position, radius, seed and time');
    }
    assert.deepEqual(physicalStamps(circleFixture.paints),subjectStamps,c.key+' historical mask control retains every physical stamp');
  }
  for(const z of [expected.practicalHitRange,Math.round((expected.practicalHitRange+.1)*10)/10]){
    actor=reset(sourceFixture,c,z);sourceCells=new Uint8Array(paintSystem.grid.length);launch(sourceFixture,actor,c);finish(sourceFixture,actor);
    const damage=sourceFixture.hits.reduce((sum,hit)=>sum+hit.damage,0);
    const recorded=expected.hitSamples.find(sample=>sample.z===z);
    near(damage,recorded.damage,1e-7);
  }
}
assert.equal(data.runner.blaster.shots,4);
for (const interval of data.runner.blaster.intervals) near(interval,50/60,1e-7);
assert.equal(data.runner['splatling-full'].shots,41);
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
