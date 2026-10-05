import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, device } from './action-fixture.mjs';
import { STEP } from '../../splatoon3/runtime/clock.mjs';

const key = code => ({ code, repeat: false, preventDefault() {} });
const dodges = h => h.actor.character.events.filter(e => e[0] === 'dodge').length;

test('the exact fixed-step roll duration clears admission before the next press', async () => {
  for (const name of ['keyboard', 'gamepad', 'touch']) {
    const h = await boot(), set = device(h, name);
    set('fire', true); set('jump', true); h.frame();
    set('jump', false);
    const ticks = Math.round(h.actor.weapon.rollTime / STEP);
    assert.ok(Math.abs(ticks * STEP - h.actor.weapon.rollTime) < Number.EPSILON);
    for (let i = 1; i < ticks - 1; i++) h.frame();
    assert.ok(h.actor.weaponRunner.dodge, 'one tick before completion is still active');
    h.frame();
    assert.equal(h.actor.weaponRunner.dodge, null, 'rounding cannot add a stale admission tick');
    set('jump', true); h.frame();
    assert.equal(dodges(h), 2, name);
    h.frame(); assert.equal(dodges(h), 2, 'hold does not repeat');
  }
});

for (const name of ['keyboard', 'gamepad', 'touch']) {
  test(`${name}: release and repress between ticks starts a legal second dodge once`, async () => {
    const h = await boot(), set = device(h, name);
    set('fire', true); set('jump', true); h.frame();
    assert.equal(dodges(h), 1);
    assert.equal(h.actor.character.events.filter(e => e[0] === 'jump').length, 0);
    const firstDirection = h.actor.weaponRunner._dodgeDir.clone();
    for (let i = 0; i < 30; i++) h.frame();
    assert.equal(h.actor.weaponRunner.dodge, null);
    assert.equal(h.actor.grounded, true);
    if (name === 'keyboard') { h.event('keyup', key('KeyD')); h.event('keydown', key('KeyA')); }
    if (name === 'gamepad') h.input.pad.axes[0] = 1;
    if (name === 'touch') h.mobile.moveX = -1;
    set('jump', false); h.frame(0); set('jump', true); h.frame(STEP / 2);
    assert.equal(dodges(h), 1, 'render-only frame cannot consume a press');
    h.frame(STEP / 2);
    assert.equal(dodges(h), 2, 'physical edge survives unchanged prior simulation hold');
    assert.ok(firstDirection.dot(h.actor.weaponRunner._dodgeDir) < -.99, 'second dodge reverses direction');
    for (let i = 0; i < 90; i++) h.frame();
    assert.equal(dodges(h), 2, 'held press cannot retrigger');
    set('jump', false); h.frame();
    assert.equal(h.actor.intent.jump, false, 'release reaches simulation');
  });

  test(`${name}: completed simultaneous fire+jump tap is delivered through render-only frames`, async () => {
    const h = await boot(), set = device(h, name);
    set('fire', true); set('jump', true); h.frame(0);
    set('fire', false); set('jump', false); h.frame(STEP / 2);
    assert.equal(dodges(h), 0);
    h.frame(STEP / 2);
    assert.equal(dodges(h), 1);
    h.frame(STEP * 5);
    assert.equal(dodges(h), 1, 'catch-up ticks cannot replay a tap');
    assert.equal(h.actor.intent.jump, false);
    assert.equal(h.actor.intent.fire, false);
  });
}

test('sub hold takes priority over a new dodge; releasing an existing sub keeps its throw priority', async () => {
  const h = await boot(), set = device(h, 'keyboard');
  set('fire', true); set('sub', true); set('jump', true); h.frame();
  assert.equal(dodges(h), 0);
  assert.equal(h.actor.weaponRunner.aimingSub, true);
});

test('an observed partial gamepad trigger tap uses the canonical 0.3 threshold', async () => {
  for (const value of [.3, .300001, .49, .5, 1]) {
    const h = await boot(), set = device(h, 'gamepad');
    set('fire', true); set('jump', true); h.frame(0);
    h.input.pad.buttons[7].value = value;
    h.input.pad.buttons[7].pressed = value > .5;
    h.input.padPrev[7] = false; h.input.padPressed.delete(7); h.frame(0);
    set('fire', false); set('jump', false); h.frame(STEP);
    assert.equal(dodges(h), value > .3 ? 1 : 0, String(value));
  }
});

test('cancelled touch does not dodge, while a completed tap survives another pointer cancellation', async () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const h = await boot(), set = device(h, 'touch'); set('fire', true);
    const cancelled = h.press('jump'); h.mobile._up({ ...cancelled, type }); h.frame();
    assert.equal(dodges(h), 0, type);
    const completed = h.press('jump'), other = h.press('jump');
    h.release(completed); h.mobile._up({ ...other, type }); h.frame();
    assert.equal(dodges(h), 1, 'completed pointer owns its surviving edge');
    h.frame(); assert.equal(h.actor.intent.jump, false);
  }
});

test('repeated keyboard events and repeated pad polling cannot invent another physical press', async () => {
  const h = await boot(), set = device(h, 'keyboard');
  set('fire', true); set('jump', true); h.frame();
  for (let i = 0; i < 60; i++) {
    h.event('keydown', { ...key('Space'), repeat: true }); h.frame();
  }
  assert.equal(dodges(h), 1);
  const p = await boot(), buttons = device(p, 'gamepad');
  buttons('fire', true); buttons('jump', true); p.frame(0); p.frame(0); p.frame();
  assert.equal(dodges(p), 1);
  p.frame(); assert.equal(dodges(p), 1);
});

test('all sampled gamepad action edges match canonical tap and release semantics', async () => {
  for (const mapping of ['standard', '']) for (const [id, button] of [['jump', 0], ['squid', 6], ['fire', 7], ['sub', 5], ['special', 11], ...(mapping === '' ? [['special', 3]] : [])]) {
    const h = await boot({ weapon: 'shooter' }), set = device(h, 'gamepad');
    h.input.pollPad(); h.input.pad.mapping = mapping;
    if (id === 'jump' || id === 'fire' || id === 'sub') set(id, true);
    else { h.input.pollPad(); h.input.pad.buttons[button].pressed = true; h.input.pad.buttons[button].value = 1; }
    h.frame(0);
    h.input.pad.buttons[button].pressed = false; h.input.pad.buttons[button].value = 0;
    h.frame(STEP / 2); assert.equal(h.rows.length, 0);
    h.frame(STEP / 2); assert.equal(h.rows[0][id], true, `${id}/${button}`);
    h.frame(); assert.equal(h.rows[1][id], false, `${id}/${button} release`);
  }
});

test('standard top-face tap toggles map without emitting a Special action', async () => {
  const h = await boot({ weapon: 'shooter' }); device(h, 'gamepad'); h.input.pollPad();
  const top = h.input.pad.buttons[3]; top.pressed = true; top.value = 1; h.frame(0);
  top.pressed = false; top.value = 0; h.frame(STEP / 2); h.frame(STEP / 2);
  assert.equal(h.controller.padMapOpen, true); assert.equal(h.rows[0].special, false);
  h.frame(); assert.equal(h.controller.padMapOpen, true); assert.equal(h.rows[1].special, false);
});

test('pointer lock loss cancels pending mouse fire without replay', async () => {
  const h = await boot(); h.input.locked = true;
  h.event('mousedown', { button: 0 }); h.event('pointerlockchange', {});
  h.frame();
  assert.equal(h.actor.intent.fire, false);
});

test('illegal dodge conditions stay rejected without spending roll ink', async () => {
  for (const state of ['air', 'ink', 'rolls', 'still', 'dead', 'special', 'sub']) {
    const h = await boot(), set = device(h, 'keyboard');
    set('fire', true); set('jump', true);
    if (state === 'air') { h.actor.grounded = false; h.actor.coyote = 0; }
    if (state === 'ink') h.actor.ink = h.actor.weapon.rollInk - 1e-5;
    if (state === 'rolls') h.actor.weaponRunner.rollsLeft = 0;
    if (state === 'still') h.event('keyup', key('KeyD'));
    if (state === 'dead') { h.actor.alive = false; h.actor.respawnTimer = 10; }
    if (state === 'special') { h.actor.specialActive = {}; h.actor._updateSpecial = () => {}; }
    if (state === 'sub') h.actor.weaponRunner.aimingSub = true;
    h.frame(); assert.equal(dodges(h), 0, state);
  }
});

test('roll ink exact boundary and shot cooldown do not suppress the dodge', async () => {
  for (const cooldown of [-1e-10, 0, 1e-10, STEP / 2, STEP, .5]) {
    const h = await boot(), set = device(h, 'keyboard');
    h.actor.ink = h.actor.weapon.rollInk;
    h.actor.weaponRunner.cooldown = cooldown;
    set('fire', true); set('jump', true); h.frame();
    assert.equal(dodges(h), 1);
    assert.equal(h.actor.ink, 0, 'roll admission spends ink before simultaneous shot');
    assert.equal(h.shots.length, 0);
  }
});

test('landing uses the existing bounded jump buffer, without extending its deadline', async () => {
  const h = await boot(), set = device(h, 'keyboard');
  h.actor.grounded = false; h.actor.coyote = 0;
  h.actor._integrate = () => { h.actor.grounded = true; };
  set('fire', true); set('jump', true); h.frame();
  assert.equal(dodges(h), 0, 'airborne at admission');
  set('jump', false); h.frame();
  assert.equal(dodges(h), 1, 'landing next tick consumes existing jump buffer');
  h.frame(STEP * 10); assert.equal(dodges(h), 1);
});
