import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { RainmakerRule, RAINMAKER_CARRY_SECONDS } from '../runtime/ranked/rainmaker.mjs';
import { CLAMS_RULE_PARAMETERS } from '../runtime/ranked/clams.mjs';
import { installRankedBots } from '../runtime/ranked/bots.mjs';
import { installTeamSignals, BOT_OUCH_DELAY } from '../runtime/team-signals.mjs';
import { advanceTenacity } from '../runtime/tenacity.mjs';
import { adaptSource } from '../adapter.mjs';

const RM_STAGE = {
  id: 'audit-rm',
  rainmaker: {
    center: [0, 0, 0],
    goals: [[0, 0, 20], [0, 0, -20]],
    checkpoints: [[], []],
    retreatZ: [-15, 15],
  },
};

function makeRainmakerOvertimeSetup({ losingTeam = 1 } = {}) {
  const winningTeam = 1 - losingTeam;
  const engine = new RankedEngine('rainmaker', RM_STAGE);
  engine.counts[winningTeam] = 40;
  engine.counts[losingTeam] = 80;
  engine.leader = winningTeam;
  engine.rule.state.barrier.active = false;
  const carrier = { id: 'carrier', team: losingTeam, pos: [0, 0, 0], alive: true, grounded: true, swimming: false };
  engine.rule.update(1 / 60, { actors: [carrier], inputs: {}, floorAt: () => 0 });
  assert.equal(engine.rule.state.carrier, 'carrier');
  assert.equal(engine.rule.beginOvertime(), true);
  assert.equal(engine.rule.state.overtime.active, true);
  assert.equal(engine.rule.state.overtime.losingTeam, losingTeam);
  return { engine, rule: engine.rule, carrier, losingTeam, winningTeam };
}

test('P0-4: Rainmaker overtime ends immediately when losing carrier disconnects between ticks', () => {
  const { engine, rule, winningTeam } = makeRainmakerOvertimeSetup({ losingTeam: 1 });
  assert.equal(Object.hasOwn(rule.snapshot(), 'overtimeCarrierLost'), false);

  // Carrier disconnects between ticks: removeActor -> _drop(null, 'death')
  rule.removeActor('carrier');
  assert.equal(rule.state.carrier, null);
  assert.equal(rule.state.overtimeCarrierLost, true);

  // Next tick ages lastDropAge from 0 -> dt before updateOvertime runs
  rule.update(1 / 60, { actors: [], inputs: {}, floorAt: () => 0 });
  assert.ok(rule.state.lastDropAge > 0);
  rule.updateOvertime(1 / 60, { actors: [], inputs: {}, floorAt: () => 0 });

  assert.equal(engine.winner, winningTeam);
  assert.equal(engine.reason, 'rainmaker-overtime-carrier-lost');
  assert.equal(Object.hasOwn(rule.snapshot(), 'overtimeCarrierLost'), false);
});

test('P0-4: Rainmaker overtime ends on own-half fall and own-half timeout despite _resetToCenter', () => {
  // Own-half fall (team 1 own half is z > centerZ = 0)
  {
    const { engine, rule, carrier, winningTeam } = makeRainmakerOvertimeSetup({ losingTeam: 1 });
    carrier.pos = [0, -10, 5];
    carrier.grounded = false;
    rule.update(1 / 60, { actors: [carrier], inputs: {}, floorAt: () => 0 });
    assert.equal(rule.state.carrier, null);
    assert.equal(rule.state.overtimeCarrierLost, true);
    rule.updateOvertime(1 / 60, { actors: [carrier], inputs: {}, floorAt: () => 0 });
    assert.equal(engine.winner, winningTeam);
    assert.equal(engine.reason, 'rainmaker-overtime-carrier-lost');
    assert.equal(Object.hasOwn(rule.snapshot(), 'overtimeCarrierLost'), false);
  }

  // Own-half timeout (team 1 own half is z > centerZ = 0)
  {
    const { engine, rule, carrier, winningTeam } = makeRainmakerOvertimeSetup({ losingTeam: 1 });
    carrier.pos = [0, 0, 5];
    carrier.grounded = true;
    rule.state.holderTime = RAINMAKER_CARRY_SECONDS - 0.005;
    rule.update(1 / 60, { actors: [carrier], inputs: {}, floorAt: () => 0 });
    assert.equal(rule.state.carrier, null);
    assert.equal(rule.state.overtimeCarrierLost, true);
    rule.updateOvertime(1 / 60, { actors: [carrier], inputs: {}, floorAt: () => 0 });
    assert.equal(engine.winner, winningTeam);
    assert.equal(engine.reason, 'rainmaker-overtime-carrier-lost');
    assert.equal(Object.hasOwn(rule.snapshot(), 'overtimeCarrierLost'), false);
  }
});

test('P0-4: Rainmaker non-overtime disconnect and snapshot/restore preserve baseline keys and active flag', () => {
  const engine = new RankedEngine('rainmaker', RM_STAGE);
  const rule = engine.rule;
  assert.equal(Object.hasOwn(rule.snapshot(), 'overtimeCarrierLost'), false);

  // Regular play disconnect does not set overtimeCarrierLost or finish match
  rule.state.barrier.active = false;
  const actor = { id: 'a0', team: 0, pos: [0, 0, 0], alive: true, grounded: true, swimming: false };
  rule.update(1 / 60, { actors: [actor], inputs: {}, floorAt: () => 0 });
  rule.removeActor('a0');
  assert.equal(engine.winner, null);
  assert.equal(Object.hasOwn(rule.snapshot(), 'overtimeCarrierLost'), false);

  // Restore normalizes falsy overtimeCarrierLost by deleting the key
  const snapWithFalsy = { ...rule.snapshot(), overtimeCarrierLost: false };
  rule.restore(snapWithFalsy);
  assert.equal(Object.hasOwn(rule.snapshot(), 'overtimeCarrierLost'), false);

  // Active overtimeCarrierLost survives snapshot -> restore and finishes on updateOvertime
  const ot = makeRainmakerOvertimeSetup({ losingTeam: 1 });
  ot.rule.removeActor('carrier');
  const activeSnap = ot.rule.snapshot();
  assert.equal(activeSnap.overtimeCarrierLost, true);

  const restoredEngine = new RankedEngine('rainmaker', RM_STAGE);
  restoredEngine.counts[0] = 40;
  restoredEngine.counts[1] = 80;
  restoredEngine.rule.restore(activeSnap);
  assert.equal(restoredEngine.rule.state.overtimeCarrierLost, true);
  restoredEngine.rule.updateOvertime(1 / 60, { actors: [], inputs: {}, floorAt: () => 0 });
  assert.equal(restoredEngine.winner, 0);
  assert.equal(restoredEngine.reason, 'rainmaker-overtime-carrier-lost');
  assert.equal(Object.hasOwn(restoredEngine.rule.snapshot(), 'overtimeCarrierLost'), false);

  // _tryPickup clears overtimeCarrierLost
  const ot2 = makeRainmakerOvertimeSetup({ losingTeam: 1 });
  ot2.rule.removeActor('carrier');
  assert.equal(ot2.rule.state.overtimeCarrierLost, true);
  ot2.rule.state.respawnRemaining = 0;
  ot2.rule.state.barrier.active = false;
  const teammate = { id: 'mate', team: 1, pos: [0, 0, 0], alive: true, grounded: true, swimming: false };
  ot2.rule._tryPickup([teammate]);
  assert.equal(Object.hasOwn(ot2.rule.snapshot(), 'overtimeCarrierLost'), false);
});

test('P1-7: team-signals clears state on non-playing match:state, guards drawSignals, and safely wraps HUD.prototype.dispose', () => {
  const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, clone() { return vec(this.x, this.y, this.z); } });
  const makeNode = () => {
    const node = {
      style: {},
      className: '',
      innerHTML: '',
      textContent: '',
      hidden: false,
      removed: false,
      parentNode: null,
      children: [],
      firstChild: { style: {}, textContent: '' },
      setAttribute() {},
      addEventListener() {},
      remove() { this.removed = true; this.parentNode = null; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      append(c) { c.parentNode = this; this.children.push(c); return c; },
    };
    return node;
  };

  const listeners = new Map();
  const on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  };
  const emitEvent = (name, payload) => {
    for (const fn of listeners.get(name) || []) fn(payload);
  };

  class PlayerController {
    constructor(a) {
      this.a = a;
      this.enabled = true;
      this.mapHeld = false;
      this.input = { down: () => false, padButton: () => false };
    }
    update() {}
  }
  let originalDisposeCalls = 0;
  class HUD {
    constructor() {
      this._visible = true;
      this.downLayer = makeNode();
      this._project = () => ({ x: 0, y: 0, z: 0.5 });
    }
    update() {}
    dispose() { originalDisposeCalls++; return 'disposed'; }
  }

  const me = { name: 'Me', team: 0, alive: true, pos: vec(0, 0, 0), intent: {} };
  const mate = { name: 'Mate', team: 0, alive: true, pos: vec(5, 0, 0), intent: {} };
  const bot = { name: 'Bot', team: 0, alive: false, pos: vec(2, 0, 0), intent: {}, bot: {} };
  const mobileRoot = makeNode();
  const G = {
    match: { state: 'playing', paused: false, local: me },
    actors: [me, mate, bot],
    camera: {},
    input: { mobile: { active: true, root: mobileRoot } },
  };

  installTeamSignals({ G, PlayerController, HUD, on, emit: () => {} });
  const prevDoc = globalThis.document, prevW = globalThis.innerWidth, prevH = globalThis.innerHeight;
  globalThis.document = { createElement: makeNode };
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 450;

  try {
    const hud = new HUD();
    assert.equal(G.teamSignals.send(mate, 'thisWay'), true);
    emitEvent('splatted', { victim: bot });
    assert.equal(G.teamSignals.list.length, 1);
    assert.equal(G.teamSignals.pendingOuch.length, 1);

    // Draws while playing & visible
    hud.update();
    assert.equal(hud._signalEls.size, 1);
    const markerEl = [...hud._signalEls.values()][0];
    assert.equal(markerEl.removed, false);
    assert.ok(hud._signalTouch);

    // Hiding HUD removes active markers and skips drawing
    hud._visible = false;
    hud.update();
    assert.equal(hud._signalEls.size, 0);
    assert.equal(markerEl.removed, true);

    // Restoring visibility redraws while still playing
    hud._visible = true;
    hud.update();
    assert.equal(hud._signalEls.size, 1);

    // Non-playing match:state clears list, pendingOuch, and last WeakMap
    G.match.state = 'finish';
    emitEvent('match:state', { state: 'finish' });
    assert.equal(G.teamSignals.list.length, 0);
    assert.equal(G.teamSignals.pendingOuch.length, 0);
    // Throttle WeakMap reset allows immediate send again
    assert.equal(G.teamSignals.send(mate, 'thisWay'), true);
    // drawSignals does not draw while state !== 'playing'
    hud.update();
    assert.equal(hud._signalEls.size, 0);

    // Re-enter playing and draw, then test HUD.dispose()
    G.match.state = 'playing';
    hud.update();
    assert.equal(hud._signalEls.size, 1);
    const touchEl = hud._signalTouch;
    const sigEl = [...hud._signalEls.values()][0];
    assert.equal(hud.dispose(), 'disposed');
    assert.equal(originalDisposeCalls, 1);
    assert.equal(touchEl.removed, true);
    assert.equal(sigEl.removed, true);
    assert.equal(hud._signalTouch, null);
    assert.equal(hud._signalTouchUp, null);
    assert.equal(hud._signalTouchNice, null);
    assert.equal(hud._signalEls.size, 0);

    // Minimal HUD mock without dispose method does not throw
    class MinimalHUD {
      constructor() { this._visible = true; }
      update() {}
    }
    const G2 = { match: { state: 'playing', paused: false, local: me }, actors: [me] };
    installTeamSignals({ G: G2, PlayerController: class { update() {} }, HUD: MinimalHUD, on: () => {}, emit: () => {} });
    const minHud = new MinimalHUD();
    assert.doesNotThrow(() => minHud.dispose());
  } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    globalThis.innerWidth = prevW;
    globalThis.innerHeight = prevH;
  }
});

test('P1-8: ClamsRule small-clam bot passes to a teammate with small clams (not a Power Clam holder)', () => {
  const stage = {
    id: 'audit-clams',
    clams: { spawns: [[0, 0, 0]], goals: [[0, 0, 20], [0, 0, -20]] },
  };
  const engine = new RankedEngine('clams', stage);
  const rule = engine.rule;
  rule.state.clams = []; // no field clams to collect so pass logic runs

  const bot = { id: 'bot', team: 0, pos: [0, 0, 0], alive: true, grounded: true };
  const powerAlly = { id: 'powerAlly', team: 0, pos: [2, 0, 0], alive: true, grounded: true };
  const smallAlly = { id: 'smallAlly', team: 0, pos: [3, 0, 0], alive: true, grounded: true };
  const emptyAlly = { id: 'emptyAlly', team: 0, pos: [1, 0, 0], alive: true, grounded: true };

  rule.state.inventories = {
    bot: { team: 0, small: 3, power: false },
    powerAlly: { team: 0, small: 0, power: true },
    emptyAlly: { team: 0, small: 0, power: false },
  };

  // Should NOT pass to a teammate holding a Power Clam or 0 small clams
  const goalWithoutSmallAlly = rule.botGoal(bot, { actors: [bot, powerAlly, emptyAlly], blocked: () => false });
  assert.equal(goalWithoutSmallAlly.action, 'carry');
  assert.notEqual(goalWithoutSmallAlly.pass, true);

  // Should pass to a teammate holding 0 < small < CLAMS_PER_POWER and !power
  rule.state.inventories.smallAlly = { team: 0, small: CLAMS_RULE_PARAMETERS.clamsPerPower - 1, power: false };
  const goalWithSmallAlly = rule.botGoal(bot, { actors: [bot, powerAlly, emptyAlly, smallAlly], blocked: () => false });
  assert.equal(goalWithSmallAlly.action, 'throw');
  assert.equal(goalWithSmallAlly.pass, true);
  assert.deepEqual(goalWithSmallAlly.pos, [3, 0, 0]);
});

test('P1-9: installRankedBots disposer cleanly deletes _rankedBotWrapped and allows re-install', () => {
  class BotBrain {
    update(dt) { return dt; }
  }
  const origUpdate = BotBrain.prototype.update;
  const dispose = installRankedBots({ G: {}, BotBrain });
  assert.equal(BotBrain.prototype._rankedBotWrapped, true);
  assert.notEqual(BotBrain.prototype.update, origUpdate);

  assert.doesNotThrow(() => dispose());
  assert.equal(BotBrain.prototype._rankedBotWrapped, undefined);
  assert.equal(BotBrain.prototype.update, origUpdate);

  // Can re-install cleanly after disposal
  const dispose2 = installRankedBots({ G: {}, BotBrain });
  assert.equal(BotBrain.prototype._rankedBotWrapped, true);
  assert.doesNotThrow(() => dispose2());
});

test('P1-10: renderBadge in adapted hud.js guards GLYPHS/AWARDS/AWARD_ICONS with Object.hasOwn', () => {
  const hudSrc = fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js', import.meta.url), 'utf8');
  const adapted = adaptSource('src/ui/hud.js', hudSrc);
  assert.match(adapted, /Object\.hasOwn\(GLYPHS,\s*key\)\s*&&\s*typeof GLYPHS\[key\] === 'string'/);
  assert.match(adapted, /Object\.hasOwn\(AWARDS,\s*key\)/);
  assert.match(adapted, /Object\.hasOwn\(AWARD_ICONS,\s*key\)/);

  // Execute extracted renderBadge with prototype keys to verify zero prototype leakage
  const start = adapted.indexOf('const stagText =');
  const end = adapted.indexOf('const makeStag =');
  assert.ok(start > 0 && end > start);
  const snippet = adapted.slice(start, end);
  const h = (tag, attrs, ...children) => ({ tag, attrs, children });
  const renderBadge = new Function('h', 'GLYPHS', 'AWARDS', 'AWARD_ICONS', 'awardIcon', `${snippet}\nreturn renderBadge;`)(
    h,
    { star: '<svg>star</svg>', badNum: 123 },
    { mvp: { metal: 'gold', label: 'MVP', icon: 'crown' } },
    { crown: '<svg>crown</svg>' },
    (k) => `<svg>${k}</svg>`,
  );

  for (const protoKey of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
    const res = renderBadge({ key: protoKey });
    assert.equal(res, null, `prototype key ${protoKey} must not resolve to a glyph/award badge`);
  }
  assert.equal(renderBadge({ key: 'badNum' }), null, 'non-string GLYPHS value must be rejected');
  const validGlyph = renderBadge({ key: 'star' });
  assert.equal(validGlyph?.attrs?.html, '<svg>star</svg>');
  const validAward = renderBadge({ key: 'mvp' });
  assert.equal(validAward?.attrs?.html, '<svg>crown</svg>');
});

test('P2-5: tenacity and ranked disconnected checks honor both actor.s3.disconnected and actor.s3Disconnected', () => {
  const makeActor = (team, extra = {}) => ({
    team,
    alive: true,
    remote: false,
    special: 0,
    specialActive: null,
    stormGaugeLock: 0,
    specialCost: () => 200,
    specialReady() { return this.special >= 200; },
    s3: { loadout: [{ main: 'tenacity' }], modifiers: { specialCharge: 1 } },
    ...extra,
  });

  const me = makeActor(0);
  const enemy1 = makeActor(1, { s3: { disconnected: true } });
  const enemy2 = makeActor(1, { s3Disconnected: true });
  const enemy3 = makeActor(1);
  const match = { state: 'playing', playing: () => true, actors: [me, enemy1, enemy2, enemy3] };
  const api = { G: { match, actors: match.actors }, emit: () => {} };

  // With enemy1 (s3.disconnected) and enemy2 (s3Disconnected) excluded, living count is 1 vs 1 -> deficit 0
  const gainEqual = advanceTenacity(me, 1, api);
  assert.equal(gainEqual, 0);

  // Reconnecting enemy1 creates a 2 vs 1 deficit -> +3.24 points/s
  enemy1.s3.disconnected = false;
  const gainDeficit = advanceTenacity(me, 1, api);
  assert.ok(Math.abs(gainDeficit - 3.24) < 1e-9);

  // Verify ranked/install.mjs and ranked/network.mjs both check a.s3?.disconnected || a.s3Disconnected
  const rankedInstallSrc = fs.readFileSync(new URL('../runtime/ranked/install.mjs', import.meta.url), 'utf8');
  const rankedNetworkSrc = fs.readFileSync(new URL('../runtime/ranked/network.mjs', import.meta.url), 'utf8');
  assert.match(rankedInstallSrc, /a\.s3\?\.disconnected \|\| a\.s3Disconnected/);
  assert.match(rankedNetworkSrc, /a\.s3\?\.disconnected \|\| a\.s3Disconnected/);
});

test('P2-6: runtime/install.mjs calls installChargerSurface(api) only once', () => {
  const installSrc = fs.readFileSync(new URL('../runtime/install.mjs', import.meta.url), 'utf8');
  const calls = installSrc.match(/installChargerSurface\(api\)/g) || [];
  assert.equal(calls.length, 1);
});
