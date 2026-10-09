// #894 — the judge presentation must be Splatoon 3's Judd + Li'l Judd stage result scene:
// both referees stand for their team beside the stage/turf plate, the authoritative winner
// drives their flag/outcome, and no synthetic percentage is ever displayed while judging.
//
// Controls are baseline-sensitive: they run the published overlay (raw `inkwave-public`
// source) next to the composed scene, so a rename or a re-timed bar cannot pass, and they
// re-check the #158/#381/#720 winner and coverage contracts the scene must not disturb.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource, replaceOnce } from '../adapter.mjs';
import { adaptJuddResult } from '../judd-result-adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { fixture, readSource } from '../../reliability/tests/hud-fixture.mjs';
import { captureFinishMapSnapshot } from '../runtime/turf-finish.mjs';
import { turfExperience } from '../runtime/results-scoring.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const compose = (rel, code = read(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
function section(code) {
  const a = code.indexOf('  judge('), b = code.indexOf('\n  _live()', a);
  assert.ok(a >= 0 && b > a, 'actual judge method boundary');
  return code.slice(a, b);
}
const rawFixture = () => fixture({ hudSource: readSource('src/ui/hud.js') });
const MAP_DATA = 'data:image/png;base64,actual-stage-and-ink-fixture';
const sceneFixture = async ({ pendingBands = 0 } = {}) => {
  const f = await fixture({ hudSource: compose('src/ui/hud.js'), gameSource: compose('src/main.js'), globals: { turfExperience } });
  const calls = [];
  const canvas = {
    width: 420, height: 240,
    toDataURL(type) { calls.push({ kind: 'snapshot', type }); return MAP_DATA; },
  };
  const minimap = {
    canvas, _band: pendingBands,
    update(dt, force) { calls.push({ kind: 'update', dt, force, band: this._band }); if (this._band > 0) this._band--; },
  };
  f.G.game = { minimap }; f.G.match = f.match;
  f.hud._mapCanvas = canvas;
  f.mapFixture = { calls, canvas, minimap };
  captureFinishMapSnapshot(f.match, minimap);
  return f;
};
const texts = (root, sel) => root.querySelectorAll(sel).map(n => n.textContent);
const scaleX = root => root.querySelectorAll('.iw-jd__bar').map(b => Number((b.style.transform.match(/scaleX\(([^)]+)\)/) || [])[1]));
const flagOf = ref => ref.querySelectorAll('.iw-jd__flag')[0];

test('#894 controls: upstream keeps the JUDGING bar, the composed judge is the referee scene and its anchors fail closed', () => {
  const raw = read('src/ui/hud.js');
  assert.match(raw, /'JUDGING'/);
  assert.match(raw, /Math\.random\(\) \* 60/);
  assert.doesNotMatch(raw, /iw-jd__ref\b/);
  assert.doesNotMatch(raw, /iw-jd--refs/);

  const scene = compose('src/ui/hud.js');
  const body = section(scene);
  assert.doesNotMatch(body, /Math\.random/);
  assert.doesNotMatch(body, /'JUDGING'/);
  assert.match(body, /'TURF WAR'/);
  assert.match(body, /is-judd/);
  assert.match(body, /is-liljudd/);
  assert.match(body, /iw-jd__stage/);
  assert.match(body, /iw-jd__map-snapshot/);
  assert.match(body, /setRefOutcome/);
  assert.match(body, /prefersReducedMotion/);
  new vm.SourceTextModule(scene); // the composed module still parses

  assert.throws(() => adaptJuddResult('src/ui/hud.js', scene, replaceOnce), /patch conflict/);
  assert.equal(adaptJuddResult('src/game/weapons.js', 'unchanged', replaceOnce), 'unchanged');
  assert.equal(adaptJuddResult('src/ui/hud.js', raw, replaceOnce).includes('iw-jd--refs'), true);
});

for (const hz of [30, 120]) test(`#894 ${hz}Hz judging shows both referees and never a synthetic percentage (baseline still does)`, async () => {
  const raw = await rawFixture(), scene = await sceneFixture();
  raw.hud.judge({ percents: [61, 39] });
  scene.hud.judge({ percents: [61, 39], winner: 0 });
  await raw.advance(1500); await scene.advance(1500);

  const rawRoot = raw.judges()[0], sceneRoot = scene.judges()[0];
  assert.equal(rawRoot.querySelectorAll('.iw-jd__ref').length, 0, 'published overlay has no referees');
  const rawNums = texts(rawRoot, '.iw-jd__num');
  assert.equal(rawNums.length, 2);
  assert.ok(rawNums.every(s => /^\d+\.\d%$/.test(s)), `baseline presents rolling percentages: ${JSON.stringify(rawNums)}`);
  assert.deepEqual(texts(sceneRoot, '.iw-jd__num'), ['', ''], 'the scene discloses nothing while the referees judge');

  const refs = sceneRoot.querySelectorAll('.iw-jd__ref');
  assert.equal(refs.length, 2);
  assert.ok(refs[0].classList.contains('is-judd') && refs[0].classList.contains('a'), 'Judd stands for the local team (Alpha)');
  assert.ok(refs[1].classList.contains('is-liljudd') && refs[1].classList.contains('b'), "Li'l Judd stands for the opponent");
  assert.equal(refs[0].dataset.team, '0');
  assert.equal(refs[1].dataset.team, '1');
  assert.equal(sceneRoot.querySelectorAll('.iw-jd__stage').length, 1, 'stage/map result plate');
  assert.equal(sceneRoot.querySelectorAll('.iw-jd__figure').length, 2);
  assert.ok(sceneRoot.classList.contains('is-racing'), 'the drumroll beat is unchanged');
  assert.equal(sceneRoot.querySelectorAll('.iw-jd__win').length, 1);

  await raw.advance(5400); await scene.advance(5400);
  assert.deepEqual(texts(sceneRoot, '.iw-jd__num'), ['61.0%', '39.0%'], 'the real coverage is revealed');
  assert.ok(scaleX(sceneRoot)[0] > 0.5, 'Alpha keeps the larger share of the stage plate');
});

test('#894 result plate uses the TIME UP stage and ink snapshot from the minimap renderer', async () => {
  const f = await sceneFixture({ pendingBands: 2 });
  const pending = f.hud.judge({ percents: [56, 44], winner: 0 });
  await f.advance(80);
  const root = f.judges()[0];
  const image = root.querySelectorAll('.iw-jd__map-snapshot')[0];
  assert.ok(image, 'the map plate contains a captured map image');
  assert.equal(image.src, MAP_DATA, 'pixels come from the current minimap canvas');
  assert.equal(f.mapFixture.minimap._band, 0, 'pending ink bands are composed before capture');
  assert.deepEqual(f.mapFixture.calls.map(x => x.kind), ['update', 'update', 'update', 'snapshot']);
  assert.ok(f.mapFixture.calls.slice(0, 3).every(x => x.dt === 0 && x.force === true), 'refresh advances no game time');
  assert.equal(f.mapFixture.calls.at(-1).type, 'image/png');
  assert.deepEqual(f.match.result.coverage, [0.6, 0.4], 'the map snapshot does not alter authoritative coverage');
  await f.advance(6000);
  await pending;
});

test("#894 Judd follows the local player's team and Li'l Judd the opponent", async () => {
  for (const team of [0, 1]) {
    const f = await sceneFixture();
    f.G.match = { local: { team } };
    f.hud.judge({ percents: [58, 42], winner: team });
    await f.advance(4300);
    const refs = f.judges()[0].querySelectorAll('.iw-jd__ref');
    const judd = refs.find(r => r.classList.contains('is-judd'));
    const lil = refs.find(r => r.classList.contains('is-liljudd'));
    assert.ok(judd && lil, 'both referees are present');
    assert.equal(judd.dataset.team, String(team), 'Judd is on the local team');
    assert.equal(lil.dataset.team, String(team === 0 ? 1 : 0), "Li'l Judd is on the opponent team");
    assert.ok(judd.classList.contains(team === 0 ? 'a' : 'b'));
    assert.ok(lil.classList.contains(team === 0 ? 'b' : 'a'));
    await f.advance(3000);
  }
});

for (const winner of [0, 1]) test(`#894 authoritative winner ${winner} drives the referee flags even when the coverage points the other way`, async () => {
  const f = await sceneFixture();
  const pending = f.hud.judge({ percents: [62, 38], winner });
  await f.advance(4300);
  const root = f.judges()[0];
  assert.ok(root.classList.contains(winner === 1 ? 'is-win-b' : 'is-win-a'));
  const judd = root.querySelectorAll('.iw-jd__ref.is-judd')[0];
  const lil = root.querySelectorAll('.iw-jd__ref.is-liljudd')[0];
  // local team 0 ⇒ Judd = Alpha, Li'l Judd = Bravo; the authority (not the 62/38 roll) decides.
  assert.equal(judd.classList.contains('is-win'), winner === 0);
  assert.equal(judd.classList.contains('is-lose'), winner === 1);
  assert.equal(lil.classList.contains('is-win'), winner === 1);
  assert.equal(lil.classList.contains('is-lose'), winner === 0);
  assert.equal(flagOf(judd).classList.contains('is-up'), winner === 0);
  assert.equal(flagOf(lil).classList.contains('is-up'), winner === 1);
  assert.deepEqual(texts(root, '.iw-jd__num'), ['62.0%', '38.0%'], 'the disclosed coverage stays the measured one');
  await f.advance(2000);
  assert.equal((await pending).winner, winner, 'the authoritative winner is what the scene resolves');
  assert.equal(f.judges().length, 0, 'the scene hands back to the existing flow');
});

test('#894 reduced motion still presents the two-referee result without the full animation', async () => {
  const f = await sceneFixture();
  f.hud._juddReducedMotion = () => true;
  const pending = f.hud.judge({ percents: [55, 45], winner: 0 });
  await f.advance(80);
  const root = f.judges()[0];
  assert.equal(root.querySelectorAll('.iw-jd__ref').length, 2, 'both referees are visible immediately');
  assert.ok(root.classList.contains('is-winner') && root.classList.contains('is-win-a'), 'outcome is not animation-gated');
  const judd = root.querySelectorAll('.iw-jd__ref.is-judd')[0];
  const lil = root.querySelectorAll('.iw-jd__ref.is-liljudd')[0];
  assert.ok(judd.classList.contains('is-win') && flagOf(judd).classList.contains('is-up'));
  assert.ok(lil.classList.contains('is-lose') && flagOf(lil).classList.contains('is-down'));
  assert.deepEqual(texts(root, '.iw-jd__num'), ['55.0%', '45.0%'], 'final coverage without the count-up');
  const bars = scaleX(root);
  assert.ok(Math.abs(bars[0] - 0.55) < 1e-4 && Math.abs(bars[1] - 0.45) < 1e-4, `stage plate settled: ${bars}`);
  await f.advance(6000);
  assert.equal((await pending).winner, 0);
});

test('#894 owner cancellation releases the map-backed judge through the existing cleanup path', async () => {
  const f = await sceneFixture();
  let current = true;
  const pending = f.hud.judge({ percents: [60, 40], winner: 0, isCurrent: () => current });
  await f.advance(900);
  assert.equal(f.judges()[0].querySelectorAll('.iw-jd__map-snapshot').length, 1);
  current = false;
  await f.advance(50);
  assert.equal((await pending).cancelled, true);
  assert.equal(f.judges().length, 0);
  assert.equal(f.hud._fxMap.has('judge'), false);
  assert.equal(f.rafs.size, 0);
  assert.equal(f.timers.size, 0);
  assert.ok(f.voices.every(v => v.stopped === 1), 'the owned judge sound is stopped on cancellation');
});

for (const winner of [0, 1]) test(`#894 ${winner === 0 ? 'win' : 'loss'} judgement transitions into the existing post-battle results flow`, async () => {
  const f = await sceneFixture();
  f.match.result = { coverage: [0.6, 0.4], winner };
  f.match.local.team = 0;
  const pending = f.game._judge();
  await f.advance(4300);
  const root = f.judges()[0];
  assert.equal(root.querySelectorAll('.iw-jd__ref').length, 2, 'the game path renders the referee scene');
  assert.ok(root.classList.contains(winner === 0 ? 'is-win-a' : 'is-win-b'));
  assert.equal(root.querySelectorAll('.iw-jd__ref.is-judd')[0].classList.contains(winner === 0 ? 'is-win' : 'is-lose'), true);
  await f.advance(3200);
  await pending;
  assert.equal(f.count('results'), 1, 'the existing results screen is handed the battle');
  assert.equal(f.game.profile.matches, 1);
  assert.equal(f.game.profile.wins, winner === 0 ? 1 : 0);
  assert.equal(f.count('podium'), 1);
  assert.equal(f.judges().length, 0, 'the overlay is released to the results flow');
  assert.equal(f.hud._fxMap.has('judge'), false);
});

test('#894 the rendered scene and the shipped stylesheets agree on its classes', async () => {
  const f = await sceneFixture();
  f.hud.judge({ percents: [57, 43], winner: 1 });
  await f.advance(4300);
  const root = f.judges()[0];
  const css = fs.readFileSync(new URL('../../../patches/splatoon3/ui.css', import.meta.url), 'utf8')
    + fs.readFileSync(new URL('../../../inkwave-public/styles/hud.css', import.meta.url), 'utf8');
  const styled = ['iw-jd--refs', 'iw-jd__refs', 'iw-jd__ref', 'iw-jd__flag', 'iw-jd__pole', 'iw-jd__cloth',
    'iw-jd__figure', 'iw-jd__refname', 'iw-jd__stage', 'iw-jd__stagemap', 'iw-jd__map-snapshot', 'is-liljudd', 'is-win', 'is-lose',
    'is-up', 'is-down', 'is-flat', 'is-tie'];
  for (const cls of styled) assert.match(css, new RegExp('\\.' + cls + '(?![\\w-])'), `stylesheet styles .${cls}`);
  assert.match(css, /\.iw-jd__flag\.is-up\s+\.iw-jd__cloth/, 'the raised-flag rule selects the flag that receives is-up');
  assert.match(css, /\.iw-jd__flag\.is-down\s+\.iw-jd__cloth/, 'the lowered-flag rule selects the flag that receives is-down');
  assert.match(css, /\.iw-jd__flag\.is-flat\s+\.iw-jd__cloth/, 'the tie rule selects the flag that receives is-flat');
  assert.match(css, /\.iw-jd--refs\s+\.iw-jd__track\s*\{\s*display:\s*none\s*;\s*\}/,
    'the real-map result scene hides the inherited abstract race bar');
  assert.match(css, /\.iw-jd__stage\s*\{[^}]*min-height:/,
    'the stage/map plate keeps a visible area when the race bar is hidden');

  const rendered = new Set();
  const walk = node => {
    for (const c of String(node.className || '').split(/\s+/).filter(Boolean)) rendered.add(c);
    for (const kid of node.children) walk(kid);
  };
  walk(root);
  for (const cls of ['iw-jd--refs', 'iw-jd__refs', 'iw-jd__ref', 'is-judd', 'is-liljudd', 'iw-jd__flag', 'iw-jd__track',
    'iw-jd__figure', 'iw-jd__refname', 'iw-jd__stage', 'iw-jd__stagemap', 'iw-jd__map-snapshot', 'is-lose', 'is-up', 'is-down']) {
    assert.ok(rendered.has(cls), `scene renders .${cls}`);
  }
  const upFlag = root.querySelectorAll('.iw-jd__flag').find(flag => flag.classList.contains('is-up'));
  const downFlag = root.querySelectorAll('.iw-jd__flag').find(flag => flag.classList.contains('is-down'));
  assert.ok(upFlag?.querySelectorAll('.iw-jd__cloth').length === 1, 'the raised flag owns its cloth node');
  assert.ok(downFlag?.querySelectorAll('.iw-jd__cloth').length === 1, 'the lowered flag owns its cloth node');
  const figure = root.querySelectorAll('.iw-jd__figure')[0];
  assert.match(String(figure.innerHTML), /class="iw-jd__cat"/, 'the referee figure carries its styled svg');
  assert.match(String(figure.innerHTML), /viewBox="0 0 100 100"/);
});
