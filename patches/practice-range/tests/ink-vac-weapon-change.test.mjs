import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const EXTRA_EXPORTS = `
  export { RangeSession } from './patches/practice-range/runtime/session.mjs';
  export { inkVacState, INK_VAC_EVENTS } from './patches/splatoon3/runtime/kit-ink-vac.mjs';
  export { KIT_FORWARD } from './patches/splatoon3/runtime/kit-network.mjs';
`;
let runtime;
async function installed() {
  if (!runtime) runtime = fixture({ fullRuntime: true, productionComposition: true, extraExports: EXTRA_EXPORTS });
  return runtime;
}

async function world() {
  const R = await installed(), { G, THREE } = R;
  G.scene = new THREE.Scene();
  G.level = { blocks: [], groundHeight: () => 0,
    spawnPads: [new THREE.Vector3(), new THREE.Vector3()] };
  G.time = 0; G.actors = []; G.local = null;
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; },
    groundProbe: (_x, _y, _z, _r, _h, _foot, out) => { out.hit = false; return out; } };
  const projectiles = new R.Projectiles(G.scene);
  G.projectiles = projectiles;
  const local = R.make('charger'); local.isLocal = true;
  local.character.actor = local;
  const match = { actors: [local], local, state: 'playing', paused: false,
    canRespawn: () => true, opts: { range: true } };
  G.actors = match.actors; G.match = match; G.local = local;
  const session = new R.RangeSession(match, { headless: true });
  match.range = session;
  const defaultFinishFrame = local._finishFrame;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) R.tick(local); };
  return { R, G, local, match, session, projectiles, defaultFinishFrame, tick };
}

function prepare(w) {
  const { G, local, match, session, projectiles, defaultFinishFrame } = w;
  if (local.weaponId !== 'charger') session.setWeapon('charger');
  local.reset();
  for (const [key, value] of Object.entries(local.intent)) local.intent[key] = typeof value === 'number' ? 0 : false;
  for (const [key, value] of Object.entries(local._prevIntent)) local._prevIntent[key] = typeof value === 'number' ? 0 : false;
  local._finishFrame = defaultFinishFrame;
  projectiles.clear(); G.time = 0;
  G.actors = match.actors; G.match = match; G.local = local;
}

function activateInkVac(w) {
  const { local, R } = w;
  assert.equal(local.weapon.special, 'inkVac', 'the full production installer gives the real Actor Ink Vac');
  local.special = local.specialCost();
  local._startSpecial();
  const state = R.inkVacState(local);
  assert.equal(state?.phase, 'inhale', 'the real installed Actor owns a held inhale');
  return state;
}

function watchDisposals(w) {
  const events = [];
  const off = w.R.on(w.R.INK_VAC_EVENTS.dispose, event => events.push(event));
  return { events, off };
}

test('Practice Range Ink Vac weapon-change lifecycle through the complete six-adapter composition', async t => {
  const w = await world();
  const { R, G, local, session, projectiles, tick } = w;
  try {
    await t.test('different valid weapon change disposes inhale and releases new-weapon fire', async () => {
      prepare(w);
      const { events, off } = watchDisposals(w);
      try {
        const state = activateInkVac(w);
        local.intent.fire = true;
        session.setWeapon('shooter');
        assert.equal(local.weaponId, 'shooter');
        assert.equal(R.inkVacState(local) === null, true, 'successful change retires the old state');
        assert.equal(local.specialActive, null, 'the visible held token is retired');
        assert.equal(local.special, 0, 'the consumed gauge is not refunded');
        assert.equal(events.length, 1, 'the owner emits one existing dispose event');
        assert.equal(events[0].actor === local, true); assert.equal(events[0].serial, state.serial);
        tick(12);
        assert.ok(projectiles.list.some(p => p.owner === local), 'held fire reaches the new weapon after the switch');
      } finally { off(); }
    });

    await t.test('same-weapon refresh preserves the active Ink Vac', async () => {
      prepare(w);
      const { events, off } = watchDisposals(w);
      try {
        const state = activateInkVac(w), token = local.specialActive;
        session.setWeapon('charger');
        assert.equal(local.weaponId, 'charger');
        assert.equal(R.inkVacState(local) === state, true);
        assert.equal(local.specialActive, token);
        assert.equal(events.length, 0);
      } finally { off(); }
    });

    await t.test('invalid and failed weapon changes preserve the held state', async () => {
      prepare(w);
      const { events, off } = watchDisposals(w);
      const original = local.setWeapon;
      try {
        const state = activateInkVac(w);
        session.setWeapon('not-a-weapon');
        local.setWeapon = function (id) {
          if (id === 'shooter') throw new Error('weapon change rejected');
          return original.call(this, id);
        };
        assert.throws(() => session.setWeapon('shooter'), /weapon change rejected/);
        assert.equal(local.weaponId, 'charger');
        assert.equal(R.inkVacState(local) === state, true);
        assert.ok(local.specialActive);
        assert.equal(events.length, 0);
        local.setWeapon = function (id) {
          original.call(this, id);
          throw new Error('downstream observer failed after commit');
        };
        assert.throws(() => session.setWeapon('shooter'), /downstream observer failed after commit/);
        assert.equal(local.weaponId, 'shooter', 'the requested native loadout change already landed');
        assert.equal(R.inkVacState(local), null, 'the old input owner is retired even when a later observer throws');
        assert.equal(local.specialActive, null);
        assert.equal(events.length, 1, 'partial setter failure emits disposal exactly once');
      } finally { local.setWeapon = original; off(); }
    });

    await t.test('existing reset and death hooks still dispose a held Ink Vac', async () => {
      prepare(w);
      activateInkVac(w);
      local.reset();
      assert.equal(R.inkVacState(local) === null, true, 'reset disposes the held state');
      assert.equal(local.specialActive, null);
      local.special = local.specialCost(); local._startSpecial();
      assert.ok(R.inkVacState(local) !== null, 'the reset actor can activate again');
      local.splat();
      assert.equal(R.inkVacState(local) === null, true, 'death disposes the next held state');
      assert.equal(local.specialActive, null);
    });

    await t.test('a released blast and spent gauge survive a later weapon change', async () => {
      prepare(w);
      activateInkVac(w); tick(30);
      local.intent.fire = true; tick(); local.intent.fire = false;
      const blast = projectiles.list.find(p => p.type === 'blast' && p.owner === local);
      assert.ok(blast, 'the real native projectile path launched its blast');
      const age = blast.age;
      assert.equal(local.special, 0);
      session.setWeapon('shooter');
      assert.ok(projectiles.list.includes(blast), 'the already released projectile keeps its owner');
      assert.equal(blast.age, age, 'the synchronous switch does not advance projectile time');
      assert.equal(local.special, 0, 'the spent gauge remains spent');
    });

    await t.test('a reentrant switch inside Actor.update cannot restore the cancelled inhale', async () => {
      prepare(w);
      const { events, off } = watchDisposals(w);
      try {
        activateInkVac(w);
        const finishFrame = local._finishFrame;
        let switched = false;
        local._finishFrame = function (dt) {
          if (!switched) { switched = true; session.setWeapon('shooter'); }
          return finishFrame.call(this, dt);
        };
        tick();
        local._finishFrame = finishFrame;
        assert.equal(switched, true, 'the Range change ran inside the enclosing native update');
        assert.equal(local.weaponId, 'shooter');
        assert.equal(R.inkVacState(local) === null, true);
        assert.equal(local.specialActive, null, 'the enclosing update did not restore its stale token');
        assert.equal(events.length, 1);
      } finally { local._finishFrame = w.defaultFinishFrame; off(); }
    });

    await t.test('existing network disposal event forwards while normal battle setup stays untouched', async () => {
      prepare(w);
      const { events, off } = watchDisposals(w);
      let battleActor;
      try {
        activateInkVac(w);
        session.setWeapon('shooter');
        assert.equal(events.length, 1);
        assert.ok(R.KIT_FORWARD.includes(R.INK_VAC_EVENTS.dispose), 'the existing protocol forwards disposal to replicas');

        battleActor = R.make('charger'); battleActor.isLocal = true;
        G.match = { playing: () => true }; G.actors = [battleActor]; G.local = battleActor;
        battleActor.special = battleActor.specialCost(); battleActor._startSpecial();
        const battleState = R.inkVacState(battleActor);
        battleActor.setWeapon('shooter');
        assert.equal(R.inkVacState(battleActor) === battleState, true, 'the Range-only hook does not wrap normal Actor.setWeapon');
        assert.equal(events.filter(e => e.actor === battleActor).length, 0);
        assert.equal(events.filter(e => e.actor === local).length, 1);
      } finally { battleActor?.reset(); off(); }
    });
  } finally {
    local.reset();
    session.dispose();
  }
});
