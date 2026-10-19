import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const browser = fs.readFileSync(new URL('../../../scripts/check-inkwave-ranked-browser.mjs', import.meta.url), 'utf8');
// Execute the browser callback's exact setup, without importing its Playwright CLI
// or maintaining a second implementation of the fix.
const setupSource = browser.match(/\/\/ BEGIN RAINMAKER PROOF TARGET SETUP[^\n]*\n([\s\S]*?)\/\/ END RAINMAKER PROOF TARGET SETUP/)?.[1];
assert.ok(setupSource, 'browser target setup is explicitly delimited');
const prepare = vm.runInNewContext(`(${setupSource.trim()})`);
// Exact previous setup as a negative control: only omit the new native reset.
const prepareWithoutWeaponReset = vm.runInNewContext(`(${setupSource.replace('target.weaponRunner.reset();', '').trim()})`);
async function boot() {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource,
    extraExports: `export { Match } from './inkwave-public/src/game/match.js';
      export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
      export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
      export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';` });
  f.context.structuredClone = structuredClone; f.installRanked({ ...f.installedRuntime, structuredClone });
  f.G.scene = { add() {}, remove() {} }; f.G.netm = null;
  f.G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80,0,0],[80,0,0]], spawnBarrier: 0,
    half: [], single: [{ kind: 'box', min: [-100,-.5,-100], max: [100,0,100] }] });
  f.G.physics = new f.Physics(f.G.level); f.G.paint = { sample: () => 1, splat: () => 0 };
  return f;
}
function scenario(f, vx, stable, { weapon='shooter', charge=false, rollFrames=null, reset=true, wall=false }={}) {
  const { G } = f, dt = 1/60; G.actors = []; G.time = 0; G.projectiles.clear();
  const a = f.make(), target = f.make(weapon);
  Object.assign(a, { nid: 1, slot: 0, team: 0, invuln: 0 }); Object.assign(target, { nid: 2, slot: 0, team: 1, invuln: 0 });
  for (const p of [a,target]) { delete p._integrate; p.s3.spawnArmor = null; p.pos.set(0,0,0); p.vel.set(0,0,0); p.grounded = p.ground.hit = true; p.ground.block = 0; p.groundN.set(0,1,0); }
  const e = new f.RankedEngine('rainmaker', { id: 'proof-target', rainmaker: { center: [0,0,0], goals: [[0,0,40],[0,0,-40]], checkpoints: [[],[]] } });
  const m = G.match = Object.assign(Object.create(f.Match.prototype), { mode: 'rainmaker', state: 'playing', actors: [a,target], local: a, ranked: e,
    rankedGains: [0,0], rankedBarrierHits: [], time: 300, duration: 300, canRespawn: () => false,
    rankedWorld: { zoneCoverage: () => [], floorAt: () => 0, blocked: () => false, update() {} } });
  m.rankedEffects = f.createRankedEffects(f.installedRuntime,m);
  target.pos.set(0,0,2); e.rule.state.barrier.active = false; m.advanceRanked(dt); assert.equal(e.rule.state.carrier, '1');
  // Enter action state through the real runner; do not invent private state.
  if (charge) {
    target.form='kid';target.aimYaw=Math.atan2(.17865936485435868,-.9839109875135237);target.aimPitch=0;
    target.aimDir.set(.17865936485435868,0,-.9839109875135237);target.intent.move.copy(target.aimDir);target.intent.fire=true;
    for(let i=0;i<180;i++)target.weaponRunner.update(dt,{fire:true});
    assert.equal(target.weaponRunner.charging,true);
  }
  if (rollFrames!==null) {
    target.intent.fire=true;target.intent.move.set(.17865936485435868,0,-.9839109875135237);
    assert.equal(target.weaponRunner.tryDodge(target.intent.move),true);
    for(let i=0;i<rollFrames;i++){G.time+=dt;target.update(dt);}
    assert.ok(target.weaponRunner.dodge||target.weaponRunner.s3DualiesGlide||target.weaponRunner.catalogState?.roll||target.weaponRunner.catalogState?.slip,'real native/catalogue roll or slide is active');
  }
  const actionBefore={nativeRoll:!!target.weaponRunner.dodge,nativeSlide:!!target.weaponRunner.s3DualiesGlide,catalogRoll:!!target.weaponRunner.catalogState?.roll,catalogSlip:!!target.weaponRunner.catalogState?.slip};
  target.vel.set(vx,0,0); target.grounded = target.ground.hit = false;
  // Original incomplete browser setup, retained as the negative control.
  target.pos.set(0,0,2); target.invuln = 0; target.s3.spawnArmor = null; target.intent.move.set(0,0,0);
  target.intent.fire = target.intent.sub = target.intent.special = target.intent.squid = false;
  if (stable) (reset?prepare:prepareWithoutWeaponReset)(target, {x:0,z:2}, 0, G.physics, f.PLAYER.footRadius);
  a.form = 'kid'; a.aimYaw = a.aimPitch = 0; a.aimDir.set(0,0,1); a.intent.move.set(0,0,0); a.vel.set(0,0,0);
  const damage = [], shots = [], hurt = target.damage, play = m.playRankedEvents;
  target.damage = function(amount,...args) { damage.push(amount); return hurt.call(this,amount,...args); };
  m.playRankedEvents = function(events,...args) { shots.push(...events.filter(e => e.kind === 'rainmaker-shot')); return play.call(this,events,...args); };
  const step = (n, fire) => { for(let i=0;i<n;i++) { G.time += dt; a.intent.fire=fire; a.intent.sub=a.intent.squid=false; a.update(dt); target.update(dt); m.advanceRanked(dt); } };
  step(61,true); assert.equal(e.rule.state.charge.value,1); step(1,false); step(20,true);
  assert.equal(shots.length,1); assert.ok(e.rule.state.charge.seconds <= 1e-8); step(20,false);
  const result = { actionBefore, damage:[...damage], alive:target.alive, pos:target.pos.toArray(), shots:shots.length };
  if (wall) {
    const owner=f.make();Object.assign(owner,{team:1,nid:3,slot:1,invuln:0});owner.pos.set(40,0,40);
    owner.weapon={...owner.weapon,sub:'splashWall'};owner.s3.abilityPoints={...owner.s3.abilityPoints,subPower:0};a.s3.objectHitGear=false;
    const shield=G.projectiles.throwBomb(owner);assert.equal(shield.subId,'splashWall');
    shield.phase='deployed';shield.pos.set(a.pos.x,a.pos.y,a.pos.z+1.2);shield.yaw=0;
    const before=shield.hp,beforeInk=a.ink,beforeSpecial=a.special,beforeShots=shots.length;
    step(61,true);step(1,false);step(20,true);step(20,false);
    assert.equal(before,800);assert.equal(shield.hp,380);assert.equal(shots.length-beforeShots,1);
    assert.equal(a.ink,beforeInk);assert.equal(a.special,beforeSpecial);
    result.wall={before,after:shield.hp,shots:shots.length-beforeShots};
  }
  m.rankedEffects.dispose(); return result;
}

test('browser Rainmaker proof clears residual target drift without weakening direct/blast assertions', async () => {
  const f = await boot();
  for (const vx of [0,8,10]) {
    const old = scenario(f,vx,false), fixed = scenario(f,vx,true);
    assert.deepEqual(old.damage, vx === 0 ? [60,180] : [], 'old fixture misses solely from residual velocity');
    assert.deepEqual(fixed.damage,[60,180]); assert.equal(fixed.alive,false); assert.equal(fixed.shots,1);
    assert.equal(fixed.pos[0],0); assert.ok(Math.abs(fixed.pos[1]) < 1e-12); assert.equal(fixed.pos[2],2);
  }
});

test('browser target setup rejects flight, Spawn and missing real support instead of erasing those states', async () => {
  const f = await boot(), a = f.make(), lane = {x:0,z:2}; a.invuln = 0;
  a.superJumpState = {phase:'flight'};
  assert.throws(() => prepare(a,lane,0,f.G.physics,f.PLAYER.footRadius), /settled target/); assert.equal(a.superJumpState.phase,'flight');
  a.superJumpState = null; a.s3.squidSpawn = {phase:'flight'};
  assert.throws(() => prepare(a,lane,0,f.G.physics,f.PLAYER.footRadius), /settled target/); assert.equal(a.s3.squidSpawn.phase,'flight');
  a.s3.squidSpawn = null;
  assert.throws(() => prepare(a,lane,10,f.G.physics,f.PLAYER.footRadius), /native floor support/);
});

test('ranked browser keeps strict shot, 60/180 damage, 420 wall damage and failure state receipts', () => {
  for (const text of ['!v.superJumpState&&!v.s3?.squidSpawn', 'events.length!==1', '!damage.includes(60)||!damage.includes(180)||target.alive',
    'wallBefore!==800||Math.abs(wall.hp-380)>1e-8', 'targetBefore,targetPrepared,targetAfter:targetState(),damage,shots:events']) assert.ok(browser.includes(text), text);
});


test('stationary proof resets charged Splatana actions and preserves strict actor and wall damage', async () => {
  const f=await boot();
  for(const weapon of ['shooter','s3-saber-lite','s3-saber-normal','s3-saber-heavy'])for(const charge of weapon==='shooter'?[false]:[false,true]){
    const fixed=scenario(f,0,true,{weapon,charge,wall:true});
    assert.deepEqual(fixed.damage,[60,180]);assert.equal(fixed.alive,false);assert.equal(fixed.shots,1);
    assert.ok(Math.hypot(fixed.pos[0],fixed.pos[2]-2)<1e-10);assert.deepEqual(fixed.wall,{before:800,after:380,shots:1});
    if(charge){const old=scenario(f,0,true,{weapon,charge,reset:false});assert.deepEqual(old.damage,[]);assert.equal(old.alive,true);assert.ok(Math.hypot(old.pos[0],old.pos[2]-2)>2);}
  }
});

test('stationary proof resets native Dualies rolls after admission instead of relying on velocity alone', async () => {
  const f=await boot();
  for(const rollFrames of [0,3,6]){
    const old=scenario(f,0,true,{weapon:'dualies',rollFrames,reset:false});assert.deepEqual(old.damage,[]);assert.equal(old.alive,true);
    const fixed=scenario(f,0,true,{weapon:'dualies',rollFrames,wall:true});
    assert.deepEqual(fixed.damage,[60,180]);assert.equal(fixed.alive,false);assert.equal(fixed.shots,1);
    assert.ok(Math.hypot(fixed.pos[0],fixed.pos[2]-2)<1e-10);assert.deepEqual(fixed.wall,{before:800,after:380,shots:1});
  }
});

test('failure receipts retain target weapon and bounded native/catalogue action state',()=>{
  for(const text of ['weapon:target.weaponId','charging:r.charging','charge:r.charge','dodge:phase(r.dodge)',
    'chargeF:c?.chargeF','stop:c?.stop','roll:phase(c?.roll)','lunge:phase(c?.lunge)','pending:!!c?.pending','stepStick:Array.from'])assert.ok(browser.includes(text),text);
});


test('stationary proof resets a catalogue Dualies roll and its distinct post-roll slip', async () => {
  const f=await boot();
  for(const [rollFrames,phase] of [[0,'catalogRoll'],[8,'catalogRoll'],[20,'catalogSlip']]){
    const opts={weapon:'s3-maneuver-long',rollFrames};
    const old=scenario(f,0,true,{...opts,reset:false});assert.equal(old.actionBefore[phase],true);
    assert.ok(Math.hypot(old.pos[0],old.pos[2]-2)>.2,'old action moves despite prepared velocity0');
    const fixed=scenario(f,0,true,{...opts,wall:true});assert.equal(fixed.actionBefore[phase],true);
    assert.deepEqual(fixed.damage,[60,180]);assert.equal(fixed.alive,false);assert.equal(fixed.shots,1);
    assert.ok(Math.hypot(fixed.pos[0],fixed.pos[2]-2)<1e-10);assert.deepEqual(fixed.wall,{before:800,after:380,shots:1});
  }
});
