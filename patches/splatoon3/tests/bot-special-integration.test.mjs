import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBotSpecialFixture as boot, STEP, SPECIALS } from './bot-special-fixture.mjs';

test('normal turf BotBrain never spends a full special on an empty battlefield', async () => {
  const f = await boot();
  for (const special of SPECIALS) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    const a = f.make(special), b = f.brain(a);
    f.setRandom(() => 0); // Exercise the old unconditional paint-mode special branch.
    // Observe the current short, unproductive route before navigation picks a
    // new distant paint goal that could legitimately justify a support special.
    f.tick(a, b, 6);
    assert.equal(a.stats.specials, 0, special + ' no enemy/objective/team benefit');
    assert.equal(a.special, a.specialCost(), special + ' gauge remains available');
    assert.equal(!!a.specialActive, false, special + ' no phantom activation');
  }
});

test('the four specials outside the base-kit table admit through actual catalogue choices', async () => {
  const f = await boot();
  for (const special of ['krakenRoyale', 'superChump', 'splattercolorScreen', 'tripleSplashdown']) {
    const { a, b } = f.scenario(special);
    for (let frame = 0; frame < 90 && a.stats.specials === 0; frame++) f.tick(a, b);
    assert.equal(a.weapon.special, special);
    assert.equal(a.stats.specials, 1, special + ' actual registered admission');
    assert.equal(a.specialReady(), false);
  }
});

test('held specials reach their native throw/release effects through the complete bot input path', async () => {
  const f = await boot();
  for (const [special, action, count] of [
    ['booyahBomb', 'throw', 1], ['ultraStamp', 'throw', 1], ['tripleInkstrike', 'marker', 3],
    ['superChump', 'balloon', 12],
  ]) {
    const { a, b } = f.scenario(special);
    let held = false, released = false;
    for (let i = 0; i < 600; i++) {
      const wasHeld = held;
      f.tick(a, b); held ||= a.intent.sub;
      released ||= wasHeld && !a.intent.sub;
      if (f.events.filter(e => e.actor === a && e.id === special && e.action === action).length >= count) break;
    }
    assert.equal(a.stats.specials, 1, special + ' exactly one native admission');
    assert.equal(f.events.filter(e => e.actor === a && e.id === special && e.action === action).length, count,
      special + ' actual effect events, not activation-only coverage');
    if (special !== 'superChump') {
      assert.equal(held, true, special + ' sub hold');
      assert.equal(released, true, special + ' sub release');
    }
    assert.equal(a.specialReady(), false, special + ' spent gauge');
  }
  const { a, b } = f.scenario('storm');
  let held = false, thrown = false;
  const throwStorm = f.G.projectiles.throwStorm;
  f.G.projectiles.throwStorm = function (owner, ...args) {
    if (owner === a) thrown = true;
    return throwStorm.call(this, owner, ...args);
  };
  for (let i = 0; i < 180 && !thrown; i++) { f.tick(a, b); held ||= a.intent.sub; }
  assert.equal(a.stats.specials, 1, 'Ink Storm admitted once');
  assert.equal(held, true, 'Ink Storm held through native sub input');
  assert.equal(thrown, true, 'Ink Storm reached native throwStorm after release');
});

test('Kraken holds and releases a real charge, then suppresses empty-field jumps', async () => {
  const f = await boot(), { a, b, enemy } = f.scenario('krakenRoyale');
  let charged = false, released = false, dash = false;
  for (let frame = 0; frame < 180 && !dash; frame++) {
    f.tick(a, b);
    charged ||= !!a.intent.fire && a._s3AllSpecialState?.phase === 'charge' && a._s3AllSpecialState.chargeT > 0;
    released ||= charged && !a.intent.fire;
    dash ||= a.specialActive?.phase === 'dash' || a._s3AllSpecialState?.phase === 'dash';
  }
  assert.equal(a.stats.specials, 1);
  assert.equal(charged, true, 'full native Kraken charge was held');
  assert.equal(released, true, 'Kraken fire-up edge was generated');
  assert.equal(dash, true, 'Actor accepted the charged rush');
  enemy.alive = false; b.target = null; b.seeTimer = 0;
  b.noProg = 1; b.jumpCd = -1; b._needJump = true;
  for (let frame = 0; frame < 20; frame++) {
    f.tick(a, b);
    assert.equal(a.intent.jump, false, 'ordinary stuck-hop cannot overwrite special jump policy');
  }
});

test('local and remote Actors retain their input without bot takeover', async () => {
  const f = await boot();
  for (const status of [{ isLocal: true }, { remote: true }, { isBot: false }]) {
    const { a, b, enemy } = f.scenario('booyahBomb');
    Object.assign(a, status);
    Object.assign(a.intent, { fire: true, sub: true, jump: true, special: false });
    a.intent.move.set(.4, 0, -.7);
    const before = JSON.stringify({ ...a.intent, move: a.intent.move.toArray() });
    assert.equal(f.driveCanonicalBotSpecial(a, a.intent, STEP, enemy, { world: f.G, brain: b }), null);
    assert.equal(JSON.stringify({ ...a.intent, move: a.intent.move.toArray() }), before);
    assert.equal(a.stats.specials, 0);
  }
});

test('ranked objective tail preserves held-special aim and suppresses ordinary movement', async () => {
  const f = await boot();
  for (const mode of ['zones', 'rainmaker', 'clams']) {
    const { a, b, enemy } = f.scenario('booyahBomb');
    const goal = { action: mode === 'rainmaker' ? 'barrier' : mode === 'clams' ? 'throw' : 'paint',
      pos: [-12, 0, 0], aim: [-12, 1, 0] };
    f.G.match.mode = mode;
    f.G.match.ranked = { mode, stage: {}, rule: { state: {}, botGoal: () => goal },
      frame: { actors: [], inputs: {}, blocked: () => false } };
    for (let frame = 0; frame < 8; frame++) f.tick(a, b);
    assert.equal(a.stats.specials, 1, mode + ' ordinary ranked BotBrain activation');
    assert.ok(a.aimPoint.z > a.pos.z, mode + ' special faces the actual enemy after ranked tail');
    assert.ok(a.aimPoint.x > -1, mode + ' objective did not overwrite special aim');
    assert.equal(a.intent.move.lengthSq(), 0, mode + ' charge stays planted');
    assert.equal(enemy.alive, true);
  }
});
