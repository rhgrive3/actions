import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stabilizeBotForm, BOT_FORM_HOLD } from '../runtime/bot-form-stability.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const bot = () => ({ alive: true, intent: { squid: false, fire: false, sub: false, special: false } });
// Count form changes the actor would see for a per-tick squid request.
function run(actor, requests, hz, extra = () => {}) {
  let changes = 0, last = null;
  requests.forEach((squid, i) => {
    actor.intent.squid = squid; actor.intent.fire = false; extra(actor, i);
    stabilizeBotForm(actor, 1 / hz);
    if (last !== null && actor.intent.squid !== last) changes++;
    last = actor.intent.squid;
  });
  return changes;
}

for (const hz of [30, 60, 120]) test(`an alternating squid request no longer flickers the CPU form at ${hz} Hz`, () => {
  const seconds = 2, requests = Array.from({ length: seconds * hz }, (_, i) => i % 2 === 0);
  const changes = run(bot(), requests, hz);
  assert.ok(changes <= Math.ceil(seconds / BOT_FORM_HOLD) + 1, 'at most one change per hold: ' + changes);
  assert.ok(changes >= 2, 'the CPU still changes form');
});

test('leaving squid form to shoot is immediate; diving again waits the hold', () => {
  const a = bot();
  a.intent.squid = true; stabilizeBotForm(a, 1); assert.equal(a.intent.squid, true);
  a.intent.squid = false; a.intent.fire = true; stabilizeBotForm(a, 1 / 60);
  assert.equal(a.intent.squid, false, 'fire pops out at once');
  a.intent.fire = false; a.intent.squid = true; stabilizeBotForm(a, 1 / 60);
  assert.equal(a.intent.squid, false, 'an immediate re-dive is held back');
  for (let t = 0; t < BOT_FORM_HOLD + .05; t += 1 / 60) { a.intent.squid = true; stabilizeBotForm(a, 1 / 60); }
  assert.equal(a.intent.squid, true, 'after the hold the CPU dives');
});

test('native traversal frames, climbing and specials pass the requested form through', () => {
  for (const setup of [a => { a.climbing = true; }, a => { a.specialActive = {}; }, a => { a.superJumpState = {}; }]) {
    const a = bot(); stabilizeBotForm(a, 1); setup(a);
    a.intent.squid = true; stabilizeBotForm(a, 1 / 60); assert.equal(a.intent.squid, true);
    a.intent.squid = false; stabilizeBotForm(a, 1 / 60); assert.equal(a.intent.squid, false);
  }
  const a = bot(); stabilizeBotForm(a, 1);
  a.intent.squid = true; stabilizeBotForm(a, 1 / 60, true); a.intent.squid = false; stabilizeBotForm(a, 1 / 60, true);
  assert.equal(a.intent.squid, false);
});

test('the match applies the hold right after each CPU brain update', () => {
  const source = fs.readFileSync(new URL('../../../inkwave-public/src/game/match.js', import.meta.url), 'utf8');
  const out = adaptBuildSource('src/game/match.js', source);
  assert.match(out, /a\.bot\.update\(dt\); stabilizeBotForm\(a, dt, !!a\.bot\._nativeTraversalHandled\);/);
});
