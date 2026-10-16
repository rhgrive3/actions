import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { realCharacter } from './real-character-fixture.mjs';
import { reverseShotRelease } from '../runtime/shooter-movement.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const DT = 1 / 60;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const candidate = (family = 'shooter') => ({
  alive: true, remote: false, form: 'kid', aimYaw: 0,
  weapon: { kind: family }, intent: { fire: false, sub: false, move: { x: 0, z: -1 } },
  weaponRunner: { slosh: -1, firingT: .35, s3ShooterMoveRemaining: 4 / 60 },
  fireFacing: .5,
});

test('reverse shot release is a pure presentation gate and respects active abilities', () => {
  for (const family of ['shooter','dualies','blaster','slosher','splatling']) {
    const a = candidate(family);
    assert.equal(reverseShotRelease(a), true, family);
    const original = JSON.stringify(a);
    assert.equal(reverseShotRelease(a), true);
    assert.equal(JSON.stringify(a), original, 'must not write gameplay or input');
    for (const [key, value] of [['fire', true], ['sub', true]]) {
      a.intent[key] = value; assert.equal(reverseShotRelease(a), false, family + '/' + key); a.intent[key] = false;
    }
    for (const [key, value] of [['aimingSub', true], ['charging', true], ['streaming', true], ['dodge', {t:0}], ['lockT', .1], ['s3ShooterPendingFirst', true], ['s3BlasterWindup', .2]]) {
      a.weaponRunner[key] = value; assert.equal(reverseShotRelease(a), false, family + '/' + key); delete a.weaponRunner[key];
    }
    a.intent.move.z = 1; assert.equal(reverseShotRelease(a), false, 'forward walk unaffected');
    a.intent.move.z = 0; a.intent.move.x = 1; assert.equal(reverseShotRelease(a), false, 'strafe unaffected');
    a.intent.move.set?.(0,0,0); a.intent.move.x = 0; a.intent.move.z = -.1;
    assert.equal(reverseShotRelease(a), false, 'stick deadzone untouched');
    a.intent.move.z = -1;
    a.remote = true; assert.equal(reverseShotRelease(a), false, 'remote replication owns body pose'); a.remote = false;
    a.specialActive = { id: 'storm' }; assert.equal(reverseShotRelease(a), false, 'special owns heading'); a.specialActive = null;
  }
  for (const family of ['roller','charger','brush','splatana','brella']) assert.equal(reverseShotRelease(candidate(family)), false, family + ' owns its real recovery');
  const catalog = candidate('catalog'); catalog.weapon.behaviorKind = 'shooter';
  assert.equal(reverseShotRelease(catalog), true, 'added shooters inherit release');
  catalog.weaponRunner.catalogState = { pending: { remaining: .2 } };
  assert.equal(reverseShotRelease(catalog), false, 'actual pending shot retains its pose');
  const blaster = candidate('blaster'); blaster.weaponRunner.s3BlasterMoveRemaining = 22 / 60;
  assert.equal(reverseShotRelease(blaster), false, 'sourced Blaster shot lock remains');
});

test('real Actor turns toward backward movement immediately on release, keeping the 4F movement cap', async () => {
  const f = await fixture(), a = f.make('shooter'), r = a.weaponRunner;
  a.form = 'kid'; a.grounded = true; a.aimYaw = 0; a.yaw = 0; a.yawVel = 0;
  a.intent.move.set(0, 0, -1); a.vel.set(0, 0, -4.32);
  a.intent.fire = true; a.fireFacing = .5; r.firingT = .35;
  a._face(DT, false); near(a.yaw, 0);
  a.intent.fire = false; r.s3ShooterMoveRemaining = 4 / 60;
  const before = r.moveSpeed(), lock = r.s3ShooterMoveRemaining;
  a._face(DT, false);
  assert.ok(Math.abs(a.yaw) > .01, 'body begins turning on first release tick despite two stale visual timers');
  assert.ok(a.fireFacing > .45 && r.firingT > 0, 'legacy latches are present but do not block facing');
  near(r.moveSpeed(), before); near(r.s3ShooterMoveRemaining, lock);
  a.intent.sub = true; a.yaw = a.yawVel = 0;
  a._face(DT, false); near(a.yaw, 0);
  a.intent.sub = false; a.intent.fire = true;
  a._face(DT, false); near(a.yaw, 0);
});

test('real complete Character retires reverse-fire aim without cancelling native shot recoil', async () => {
  const f = await fixture(), api = await realCharacter();
  const a = f.make('shooter'), r = a.weaponRunner;
  const ch = new api.Character({ name: 'reverse-fire regression', weapon: 'shooter',
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character = ch; ch.actor = a; ch.onEvent = null;
  a._finishFrame = f.Actor.prototype._finishFrame;
  a.grounded = true; a.form = 'kid'; a.pos.set(0,0,0);
  a.aimYaw = a.yaw = 0; a.intent.move.set(0,0,-1); a.vel.set(0,0,-2.88);
  const sample = (fire, first = false) => {
    a.intent.fire = fire; f.G.time += DT;
    r.update(DT, { fire, firePressed: first });
    a._finishFrame(DT);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  try {
    for (let i=0;i<32;i++)sample(true,i===0);
    assert.ok(ch.wAim > .95, 'held fire raises the actual weapon');
    const before = ch.wAim, shotAge = ch.lastShot;
    sample(false);
    assert.ok(ch.wAim < before, 'release starts normal carry on its first frame');
    assert.ok(shotAge < .5 && ch.lastShot < .5, 'source shot recoil age is preserved, not zeroed');
    assert.ok(r.firingT > 0, 'shot clock is not reset to fake a clean release');
    for (let i=0;i<11;i++)sample(false);
    assert.ok(ch.wAim < .07, 'no half-second post-shot aim pose when backing away');
    const yaw = a.yaw;
    assert.ok(Math.abs(yaw) > .1, 'authoritative Actor yaw follows backward stick');
    sample(true,true);
    assert.ok(ch.wAim > .1, 're-press immediately re-enters actual weapon aim');
    assert.ok(ch.weapon?.off, 'the same native weapon rig stays attached');
  } finally { ch.dispose(); }
});

test('fixed 60Hz backwards-release facing trace is independent of 30/60/120Hz presentation', async () => {
  const traces=[];
  for(const hz of [30,60,120]){
    const f=await fixture(), a=f.make('shooter'); a.aimYaw=0; a.yaw=0; a.yawVel=0;
    a.intent.move.set(0,0,-1); a.vel.set(0,0,-3); a.intent.fire=false;
    a.fireFacing=.5; a.weaponRunner.firingT=.35;
    const fixed=new FixedClock(), out=[];
    for(let frame=0;frame<hz;frame++)fixed.advance(1/hz,dt=>{
      a._face(dt,false); out.push([a.yaw,a.yawVel,a.fireFacing]);
    });
    traces.push(out);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
