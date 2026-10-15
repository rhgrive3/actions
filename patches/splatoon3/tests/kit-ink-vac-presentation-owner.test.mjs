import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

const f = await sourceLoadedActorFixture();
after(() => f.reset());

function ownsVac(a) {
  const ch = a.character, snapshot = f.specialPresentationSnapshot(ch);
  assert.equal(a.specialActive?.id, 'inkVac');
  assert.equal(ch.sourceMotion.status, 'ready');
  assert.equal(ch.sourceMotion.active, true);
  assert.equal(ch.sourceMotion.sourceUpper, false, 'native Vac owns the real Actor.update upper pose');
  assert.equal(snapshot?.kind, 'inkVac', 'normal update selects the Vac presentation');
  assert.equal(snapshot.heldVisible, true);
  assert.ok(snapshot.handError < 1e-5, 'actual native special grips');
  assert.ok(Array.from(ch.P).every(Number.isFinite));
}

for (const hz of [30, 60, 120]) test(`loaded source: real Actor.update owns Vac and returns to carry at ${hz} Hz`, async () => {
  f.reset(); const a = await f.make(), dt = 1 / hz;
  for (let i = 0; i < hz * 2; i++) f.tick(a, dt);
  assert.equal(a.character.sourceMotion.sourceUpper, true);
  a.weapon = { ...a.weapon, special: 'inkVac' }; a.special = a.specialCost(); a._startSpecial();
  const ch = a.character, advance = ch.sourceMotion.advance;
  let maskedRigTicks = 0;
  ch.sourceMotion.advance = function (dt, input) {
    assert.equal(a.specialActive, null, 'gameplay token remains masked during delegated update');
    assert.equal(a.intent.fire, false, 'main trigger remains suppressed');
    assert.equal(f.specialPresentationToken(a)?.id, 'inkVac');
    assert.equal(f.nativeWeaponPoseRequired(ch, input), true);
    maskedRigTicks++;
    return advance.call(this, dt, input);
  };
  a.intent.fire = true;
  for (let i = 0; i < hz; i++) { f.tick(a, dt); ownsVac(a); }
  assert.equal(maskedRigTicks, hz);
  assert.equal(f.inkVacState(a).sucking, true);
  assert.equal(f.G.projectiles.list.length, 0, 'no main shot escapes the mask');
  a.intent.fire = false;
  for (let i = 0; i < hz / 2; i++) { f.tick(a, dt); ownsVac(a); }
  assert.equal(f.inkVacState(a).sucking, false);
  ch.sourceMotion.advance = advance;
  f.disposeInkVac(a);
  assert.equal(f.specialPresentationToken(a), null, 'scope cannot outlive disposal');
  for (let i = 0; i < hz; i++) f.tick(a, dt);
  assert.equal(f.specialPresentationSnapshot(ch)?.kind ?? null, null);
  assert.equal(ch.sourceMotion.sourceUpper, true);
  a.intent.fire = true;
  for (let i = 0; i < hz / 2; i++) {
    f.tick(a, dt);
    assert.equal(ch.sourceMotion.sourceUpper, false, 'normal main firing still owns upper pose');
  }
  assert.ok(f.G.projectiles.list.length > 0);
});

test('real Actor.update retains 17F activation, 12F intake start and 20F countershot transition', async () => {
  f.reset(); const a = await f.make();
  for (let i = 0; i < 120; i++) f.tick(a);
  a.weapon = { ...a.weapon, special: 'inkVac' }; a.special = a.specialCost(); a._startSpecial();
  a.intent.fire = true;
  for (let frame = 1; frame <= 29; frame++) {
    f.tick(a); ownsVac(a);
    assert.equal(f.inkVacState(a).sucking, false, `no suction before activation+intake startup, frame ${frame}`);
  }
  f.tick(a); ownsVac(a); assert.equal(f.inkVacState(a).sucking, true);
  while (f.inkVacState(a)?.phase === 'inhale') { f.tick(a); ownsVac(a); }
  assert.equal(f.inkVacState(a)?.phase, 'exhale');
  a.intent.fire = false;
  for (let frame = 1; frame < 20; frame++) {
    f.tick(a); ownsVac(a); assert.equal(f.G.projectiles.list.length, 0, 'countershot waits full transition');
  }
  f.tick(a);
  assert.equal(f.inkVacState(a), null);
  assert.equal(a.specialActive, null);
  assert.equal(f.G.projectiles.list.length, 1, 'one native countershot');
  f.tick(a);
  assert.equal(f.specialPresentationSnapshot(a.character)?.kind ?? null, null);
});

test('presentation context is nested, cancellation-aware and exception-safe without gameplay writes', () => {
  const actor = { alive: true, specialActive: null }, first = { id: 'inkVac' }, second = { id: 'trizooka' };
  let current = true;
  assert.throws(() => f.withSpecialPresentation(actor, first, () => current, () => {
    assert.equal(actor.specialActive, null);
    assert.equal(f.specialPresentationToken(actor), first);
    f.withSpecialPresentation(actor, second, () => true, () => assert.equal(f.specialPresentationToken(actor), second));
    assert.equal(f.specialPresentationToken(actor), first);
    assert.throws(() => f.withSpecialPresentation(actor, second, () => true, () => {
      assert.equal(f.specialPresentationToken(actor), second);
      throw new Error('nested diagnostic');
    }), /nested diagnostic/);
    assert.equal(f.specialPresentationToken(actor), first, 'inner throw restores outer scope');
    current = false; assert.equal(f.specialPresentationToken(actor), null);
    throw new Error('diagnostic');
  }), /diagnostic/);
  assert.equal(f.specialPresentationToken(actor), null);
  assert.equal(Object.getOwnPropertySymbols(actor).length, 0);
  assert.equal(actor.specialActive, null);
  actor.specialActive = second;
  f.withSpecialPresentation(actor, first, () => true, () => assert.equal(f.specialPresentationToken(actor), second));
});

test('real update clears scoped ownership on exception and native disposal', async () => {
  f.reset(); const a = await f.make();
  for (let i = 0; i < 120; i++) f.tick(a);
  a.weapon = { ...a.weapon, special: 'inkVac' }; a.special = a.specialCost(); a._startSpecial();
  const token = a.specialActive, finish = a._finishFrame;
  a._finishFrame = function () {
    assert.equal(this.specialActive, null);
    assert.equal(f.specialPresentationToken(this), token);
    throw new Error('native finish diagnostic');
  };
  assert.throws(() => f.tick(a), /native finish diagnostic/);
  assert.equal(a.specialActive, token, 'native finally still restores the gameplay token');
  a.specialActive = null;
  assert.equal(f.specialPresentationToken(a), null, 'exception leaves no hidden presentation token');
  a.specialActive = token;
  a._finishFrame = function (dt) {
    f.disposeInkVac(this);
    assert.equal(f.specialPresentationToken(this), null, 'native cancellation invalidates scoped token immediately');
    return finish.call(this, dt);
  };
  f.tick(a);
  a._finishFrame = finish;
  assert.equal(a.specialActive, null);
  assert.equal(f.inkVacState(a), null);
  assert.equal(f.specialPresentationSnapshot(a.character)?.kind ?? null, null);
});
