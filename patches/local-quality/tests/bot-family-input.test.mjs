// Owner-forwarded review 2026-11-05: Bot turf outliers. Real composed BotBrain
// + Actor + catalogue WeaponRunner in paint mode on bare ground (navigation,
// perception and stage stubbed). Logic-only: compares the trigger pattern with
// a control that has this adapter's edits reverted; it is not a browser match
// and not a Splatoon 3 turf comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const composed = (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
// Negative control: the same composition with this adapter's edits undone.
const control = (rel, code) => {
  code = composed(rel, code);
  if (rel !== 'src/game/bots.js') return code;
  const undo = (from, to) => { assert.equal(code.split(from).length - 1, 1, from); code = code.replace(from, to); };
  undo(" && (!brella || botReadyPress(a));\n          }", ";\n          }");
  undo("inkFrac > 0.18 && (!brella || botReadyPress(a));\n      }", "inkFrac > 0.18;\n      }");
  undo("else it.fire = !brella || botReadyPress(a);", "else it.fire = true;");
  undo(" ||\n      family === 'splatana');", ");");
  undo(`        if (brush) {
          // Brushes paint with rapid flicks; brush-run (held ZR) is travel across enemy ink.
          if (needPaint && inkFrac > 0.08) it.fire = botReadyPress(a);
          else it.fire = inkFrac > 0.08 && wantMove && a.groundTeam === 2;
        } else it.fire`, "        it.fire");
  return code;
};

async function world(weapon, adapt, hz = 60, { walk = false } = {}) {
  const f = await fixture({ adapt, fullRuntime: true, realProjectiles: true,
    extraExports: "export * from './inkwave-public/src/game/bots.js';" });
  const a = f.make(weapon); a.isBot = true; a.isLocal = false; a.remote = false;
  a.ink = f.PLAYER.inkMax; a.hp = f.PLAYER.hp; a.lastFire = 99; a.lastDamage = 99;
  f.G.paint.sample = () => 0;
  f.G.paint.regionStats = (_x, _y, _z, _r, _t, out) => Object.assign(out, { own: 0, enemy: 0, empty: 1, n: 1 });
  const brain = new f.BotBrain(a, 'normal'); a.bot = brain;
  brain._perceive = () => {}; brain._steer = () => new f.THREE.Vector3(0, 0, walk ? 1 : 0);
  brain._pickPaintGoal = () => { brain.path = null; brain.goalTimer = 1; };
  const fires = [];
  f.on('weapon:fire', e => { if (e.actor === a) fires.push(e); });
  const dt = 1 / hz;
  let canopyOpen = 0, rolling = 0;
  const pitch = [], yaw = [];
  const run = seconds => {
    for (let i = 0; i < Math.round(seconds * hz); i++) {
      f.G.time += dt; a.ink = f.PLAYER.inkMax; brain.update(dt); a.update(dt);
      if (a.weaponRunner.catalogState?.canopy?.open) canopyOpen += dt;
      if (a.weaponRunner.rolling) rolling += dt;
      pitch.push(brain.aimPitch); yaw.push(brain.aimYaw);
    }
  };
  return { f, a, brain, fires, run, get canopyOpen() { return canopyOpen; }, get rolling() { return rolling; }, pitch, yaw };
}

for (const hz of [30, 60, 120]) {
  test(`Brella Bot taps the shotgun in paint mode instead of holding the canopy open (${hz}Hz)`, async () => {
    const before = await world('s3-shelter-normal', control, hz), after = await world('s3-shelter-normal', composed, hz);
    before.run(4); after.run(4);
    assert.equal(before.brain.mode, 'paint'); assert.equal(after.brain.mode, 'paint');
    assert.ok(before.canopyOpen > 1, `control holds the canopy open (${before.canopyOpen.toFixed(2)} s)`);
    assert.equal(after.canopyOpen, 0, 'tapped trigger never opens the canopy');
    assert.ok(after.fires.length >= 2 * Math.max(1, before.fires.length),
      `tapping fires the shotgun repeatedly (${before.fires.length} -> ${after.fires.length})`);
  });

  test(`Splatana Bot paints with horizontal-swing taps, not 45 % charges plus pauses (${hz}Hz)`, async () => {
    const before = await world('s3-saber-normal', control, hz), after = await world('s3-saber-normal', composed, hz);
    before.run(4); after.run(4);
    // The source WeakSwingFrame is the tap cadence ceiling (one swing per
    // cooldown); taps should sit at that ceiling, the control below it.
    const frame = after.a.weapon.catalogRecord.parameters.spl__WeaponSaberParam.SwingParam.WeakSwingFrame;
    const ceiling = Math.floor(4 * 60 / frame) + 1;
    assert.ok(after.fires.length > before.fires.length, `swing count ${before.fires.length} -> ${after.fires.length}`);
    // A press/release edge pair costs two ticks; at 30 Hz that is 4F per swing.
    assert.ok(after.fires.length >= ceiling - (hz < 60 ? 2 : 1), `taps reach the ${frame}F swing cadence (${after.fires.length}/${ceiling})`);
    assert.ok(after.fires.every(e => !(e.charge >= 1)), 'paint taps never become the full-charge vertical slash');
  });

  test(`Brush Bot paints unpainted ground with flicks, not by brush-running (${hz}Hz)`, async () => {
    const before = await world('s3-brush-mini', control, hz, { walk: true }), after = await world('s3-brush-mini', composed, hz, { walk: true });
    before.run(3); after.run(3);
    assert.ok(before.rolling > 1.5, `control brush-runs to paint (${before.rolling.toFixed(2)} s)`);
    assert.equal(after.rolling, 0, 'neutral ground is painted with flicks, not by brush-running');
    // Flicks follow the aim: paint aim sits slightly above level (not the
    // Roller's 0.42 rad down) and sweeps across the lane.
    assert.ok(after.pitch.at(-1) > 0.15, `brush paint aim is raised (${after.pitch.at(-1).toFixed(2)} rad)`);
    const yaws = after.yaw.slice(Math.floor(after.yaw.length / 2));
    assert.ok(Math.max(...yaws) - Math.min(...yaws) > 0.3, 'brush paint aim sweeps across the lane');
    // Inkbrush repeats a flick every 7F (first interval 6F) while tapped.
    assert.ok(after.fires.length >= 10 * Math.max(1, before.fires.length) / 2 && after.fires.length >= 10,
      `flick count ${before.fires.length} -> ${after.fires.length}`);
  });
}
