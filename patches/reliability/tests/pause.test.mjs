import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, pad, STEP, composed } from './pause-fixture.mjs';
import { adaptPause } from '../pause-adapter.mjs';

for (const hz of [60, 120, 144]) {
  test(`old ${hz}Hz Start control exposes the render-only duplicate`, async () => {
    const h = await boot(false); h.setPads(pad([9]));
    h.frame(1 / hz); assert.equal(h.m.paused, true);
    h.frame(1 / hz); assert.equal(h.m.paused, hz === 60);
  });
  test(`${hz}Hz Start holds pause until a second physical press`, async () => {
    const h = await boot(); h.setPads(pad([9]));
    for (let i = 0; i < 5; i++) h.frame(1 / hz);
    assert.equal(h.m.paused, true); assert.equal(h.menus.current, 'pause');
    h.setPads(pad()); h.frame(1 / hz);
    h.setPads(pad([9])); h.frame(1 / hz);
    assert.equal(h.m.paused, false); assert.equal(h.menus.current, null);
    for (let i = 0; i < 5; i++) h.frame(1 / hz);
    assert.equal(h.m.paused, false);
  });
}

for (const patched of [false, true]) test(`online pause ${patched ? 'blocks' : 'previously replayed'} local actor input`, async () => {
  const h = await boot(patched); h.G.netm = {}; h.game.pause();
  h.input.keys.add('KeyW'); h.input.mouse.left = true;
  assert.equal(h.controller.enabled, false);
  h.frame(STEP);
  assert.equal(h.menus.current, 'pause'); assert.equal(h.m.paused, false);
  assert.equal(h.controller.enabled, !patched);
  assert.equal(h.actor.intent.move.length(), patched ? 0 : 1);
  assert.equal(h.actor.intent.fire, !patched);
  assert.equal(h.ownedShots.filter(a => a === h.actor).length, patched ? 0 : 1);
});

test('online pause preserves actual Match clock and another actual actor firing; resume restores held input', async () => {
  const h = await boot(); h.G.netm = {};
  h.other.intent.fire = true; h.input.keys.add('KeyW'); h.input.mouse.left = true;
  h.game.pause(); const time = h.m.time;
  for (let i = 0; i < 5; i++) h.frame(STEP);
  assert.ok(h.m.time < time); assert.equal(h.game.s3Clock.ticks, 5);
  assert.ok(h.ownedShots.some(a => a === h.other)); assert.ok(!h.ownedShots.some(a => a === h.actor));
  assert.equal(h.actor.intent.move.length(), 0);
  h.game.resume(); h.frame(STEP);
  assert.equal(h.controller.enabled, true); assert.equal(h.actor.intent.move.length(), 1);
  assert.ok(h.ownedShots.some(a => a === h.actor));
});

for (const hz of [120, 144]) test(`${hz}Hz online Start blocks only local input until the second physical press`, async () => {
  const h = await boot(); h.G.netm = {}; h.setPads(pad([9]));
  h.input.mouse.left = true; h.frame(1 / hz);
  for (let i = 0; i < 5; i++) h.frame(1 / hz);
  assert.equal(h.menus.current, 'pause'); assert.equal(h.m.paused, false);
  assert.equal(h.controller.enabled, false); assert.equal(h.ownedShots.length, 0);
  h.setPads(pad()); h.frame(1 / hz); h.setPads(pad([9])); h.frame(1 / hz);
  assert.equal(h.menus.current, null);
  h.frame(STEP); assert.equal(h.controller.enabled, true); assert.ok(h.ownedShots.length > 0);
});

test('released controls and discarded look during online pause do not replay after resume', async () => {
  const h = await boot(); h.G.netm = {}; h.game.pause();
  h.event('keydown', { code: 'Space', repeat: false, preventDefault() {} });
  h.event('keyup', { code: 'Space' }); h.input.mouse.leftPressed = true; h.input.mouse.dx = 100;
  h.frame(STEP); h.game.resume(); h.frame(STEP);
  assert.equal(h.actor.intent.jump, false); assert.equal(h.actor.intent.fire, false);
  assert.equal(h.rig.yaw, 0); assert.equal(h.ownedShots.length, 0);
});

test('offline pause still freezes actual Match time and actors; resume restores controls', async () => {
  const h = await boot(); h.game.pause(); const time = h.m.time;
  h.input.keys.add('KeyW'); h.input.mouse.left = true; h.frame(STEP);
  assert.equal(h.controller.enabled, false); assert.equal(h.m.time, time);
  assert.equal(h.ownedShots.length, 0); h.game.resume(); h.frame(STEP);
  assert.ok(h.m.time < time); assert.equal(h.actor.intent.move.length(), 1);
  assert.equal(h.ownedShots.length, 1);
});

for (const button of [0, 1]) test(`menu ${button === 0 ? 'A accept' : 'B back'} resumes without jump; hold remains owned until release`, async () => {
  const h = await boot(); h.game.pause(); h.setPads(pad([button]));
  h.frame(STEP / 2); assert.equal(h.menus.current, null);
  for (let i = 0; i < 5; i++) h.frame(STEP / 2);
  assert.deepEqual(h.navCalls, [button === 0 ? 'accept' : 'back']);
  assert.ok(h.updates.every(row => !row.jump));
  assert.equal(h.input.padButton(button), false);
  h.setPads(pad()); h.frame(STEP); h.setPads(pad([button])); h.frame(STEP);
  assert.equal(h.input.padButton(button), true);
  if (button === 0) assert.equal(h.actor.intent.jump, true);
});

test('B backs from actual menu settings navigation once, then resumes once on a second press', async () => {
  const h = await boot(); h.game.pause(); h.menus.show('settings', { push: true });
  h.setPads(pad([1])); h.frame(STEP / 2);
  assert.equal(h.menus.current, 'pause');
  for (let i = 0; i < 4; i++) h.frame(STEP / 2);
  assert.equal(h.menus.current, 'pause'); assert.deepEqual(h.navCalls, ['back']);
  h.setPads(pad()); h.frame(STEP / 2); h.setPads(pad([1])); h.frame(STEP / 2);
  assert.equal(h.menus.current, null); assert.deepEqual(h.navCalls, ['back', 'back']);
});

for (const hz of [120, 144]) test(`${hz}Hz gameplay A/fire taps retain their original pending simulation delivery`, async () => {
  const h = await boot(); h.setPads(pad([0])); h.input.mouse.leftPressed = true;
  h.frame(1 / hz); assert.equal(h.game.s3Clock.ticks, 0);
  assert.equal(h.input.padPressed.has(0), true);
  h.setPads(pad());
  while (h.game.s3Clock.ticks === 0) h.frame(1 / hz);
  assert.equal(h.updates[0].jump, true); assert.equal(h.updates[0].fire, true);
  h.frame(STEP); assert.equal(h.updates.at(-1).jump, false); assert.equal(h.updates.at(-1).fire, false);
});

test('menu A is consumed while an unrelated fire tap remains available after resume', async () => {
  const h = await boot(); h.game.pause(); h.setPads(pad([0])); h.input.mouse.leftPressed = true;
  h.frame(STEP / 2); assert.equal(h.menus.current, null);
  h.setPads(pad()); h.frame(STEP / 2);
  assert.equal(h.actor.intent.jump, false); assert.equal(h.actor.intent.fire, true);
});

test('a render-only map d-pad tap keeps its actual super-jump edge until the simulation tick', async () => {
  const h = await boot(), targets = [];
  h.actor.canSuperJump = () => true; h.actor.superJump = target => targets.push(target);
  h.setPads(pad([8, 14])); h.frame(STEP / 2);
  assert.equal(targets.length, 0); assert.equal(h.input.padPressed.has(14), true);
  h.setPads(pad([8])); h.frame(STEP / 2);
  assert.deepEqual(targets, [h.other]); h.frame(STEP);
  assert.equal(targets.length, 1);
});

test('menu RB cannot leak as a held bomb after resuming', async () => {
  const h = await boot(); h.game.pause(); h.setPads(pad([5])); h.frame(STEP / 2);
  assert.deepEqual(h.navCalls, ['tab_next']); h.game.resume(); h.frame(STEP / 2);
  assert.equal(h.actor.intent.sub, false); assert.equal(h.input.padValue(5), 0);
  h.setPads(pad()); h.frame(STEP); h.setPads(pad([5])); h.frame(STEP);
  assert.equal(h.actor.intent.sub, true);
});

test('blur and no-pad disconnect clear menu state; reconnect requires release before a fresh button', async () => {
  const h = await boot(); h.setPads(pad([0])); h.input.pollPad();
  assert.equal(h.input.padMenuPressed.has(0), true); h.event('blur', {});
  assert.equal(h.input.padMenuPressed.size, 0);
  h.input.consumePadMenuButton(0); h.setPads([]); h.input.pollPad();
  assert.equal(h.input.padMenuBlocked.size, 0); assert.equal(h.input.padMenuPressed.size, 0);
  h.setPads(pad([0])); h.input.pollPad();
  assert.equal(h.input.padMenuPressed.has(0), false); assert.equal(h.input.padButton(0), false);
  h.setPads(pad()); h.input.pollPad();
  h.setPads(pad([0])); h.input.pollPad();
  assert.equal(h.input.padMenuPressed.has(0), true); assert.equal(h.input.padButton(0), true);
});

test('adapter rejects missing/duplicated/already applied anchors and leaves unrelated modules intact', () => {
  for (const rel of ['src/main.js', 'src/core/input.js', 'src/game/match.js']) {
    const source = composed(rel); assert.throws(() => adaptPause(rel, ''), /conflict/);
    assert.throws(() => adaptPause(rel, source + source), /conflict/);
    assert.throws(() => adaptPause(rel, adaptPause(rel, source)), /conflict/);
  }
  assert.equal(adaptPause('src/game/player.js', 'untouched'), 'untouched');
});
