// Issue #580: a normal Turf War must not end with the custom two-splat "TIME'S UP!" card.
// Splatoon 3 punctuates 0:00 with its battle-finish tape, held dominant until the judge hand-over.
//
// Build-only adapter patches/local-quality/finish-tape-adapter.mjs. Raw inkwave-public immutable.
// Presentation only: no timer / score / projectile / online-ordering change, and no #121 / #410
// behaviour is touched. Boss Battle keeps its own SUNK! / TIME'S UP ending (hud-boss.js), which
// banner() reaches through its early return - proven below to still precede the finish branch.
//
// Cheap native tests only: the adapter is executed against the real baseline files, and the
// shipped clearFinishTape source is run in a VM against a stub layer. No browser, no --vm-modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptFinishTape, replaceOnceFinish } from '../finish-tape-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
// On-disk path (for read) and dispatch key (for adaptFinishTape) are deliberately separate names.
// Repo convention (tests/runtime-ui.test.mjs): read() is repo-root relative, while the adapter's
// dispatch key is the module path WITHOUT the `inkwave-public/` prefix. Handing a read path to the
// dispatcher silently returns unchanged source; every adaptFinishTape call below therefore passes
// the `*_REL` key and only `read()` uses the `inkwave-public/` path.
const HUD = 'inkwave-public/src/ui/hud.js';
const HUD_REL = 'src/ui/hud.js';
const CSS = 'inkwave-public/styles/hud.css';
const CSS_REL = 'styles/hud.css';
const BOSS = 'inkwave-public/src/ui/hud-boss.js';
const BOSS_REL = 'src/ui/hud-boss.js';
const MAIN = 'inkwave-public/src/main.js';
const MAIN_REL = 'src/main.js';

test('baseline still ships the two-splat TIME\'S UP card (the issue is really present)', () => {
  const hud = read(HUD);
  assert.ok(hud.includes(`timesup: "TIME'S UP!"`), 'baseline timesup label');
  assert.ok(hud.includes('iw-bn--timesup'), 'baseline timesup banner class');
  assert.ok(hud.includes(`cls: 'iw-fenemy'`) && hud.includes(`cls: 'iw-fself'`),
    'baseline two-team splat colouring');
});

test('adapter replaces the Turf finish banner with a team-neutral Finish tape', () => {
  const out = adaptFinishTape(HUD_REL, read(HUD));
  assert.ok(!out.includes('iw-bn--timesup'), 'old splat card is gone');
  assert.ok(out.includes('iw-bn--finish'), 'finish tape class present');
  assert.ok(out.includes('iw-bn__tape'), 'tape element present');
  assert.ok(out.includes(`timesup: 'FINISH!'`), 'reference word is FINISH!');
  assert.ok(!out.includes(`timesup: "TIME'S UP!"`), 'TIME\'S UP! default removed');
  // team-neutral: the finish markup must not reference either team's ink or the splat helper
  const branch = out.slice(out.indexOf(`} else if (k === 'timesup') {`),
    out.indexOf(`} else if (k === 'one_minute') {`));
  assert.ok(branch.length > 0, 'timesup branch located');
  for (const teamish of ['iw-fself', 'iw-fenemy', 'splatSVG', '--self', '--enemy']) {
    assert.ok(!branch.includes(teamish), `finish treatment must stay team-neutral (${teamish})`);
  }
});

test('the tape holds through the finish phase and is dropped at the judge hand-over', () => {
  const out = adaptFinishTape(HUD_REL, read(HUD));
  assert.ok(out.includes(`if (k !== 'timesup') {`), 'auto-removal skipped for the finish tape');
  // the removal must still be there for every other banner kind
  assert.ok(out.includes(`el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });`));
  assert.ok(out.includes(`setTimeout(() => el.remove(), 4000);`));
  assert.ok(out.includes(`if (state === 'judge') this.clearFinishTape();`), 'judge clears the tape');
  // anchor on the kcards line: `this._downs = [];` also occurs in the constructor (line ~70),
  // so slicing from its first occurrence would read the wrong place.
  const start = out.indexOf(`this.kcards.innerHTML = '';`);
  assert.ok(start > 0, '_startMatchHud reset line located');
  const round = out.slice(start, start + 220);
  assert.ok(round.includes('this.clearFinishTape();'), 'a fresh round clears a stale tape');
});

test('the authoritative state progression and boss path are untouched', () => {
  const out = adaptFinishTape(HUD_REL, read(HUD));
  // boss early return must still come BEFORE the finish-tape branch, or Boss would get the tape
  const early = out.indexOf(`if (kind === 'timesup' && this.boss.timesUp())`);
  const branch = out.indexOf(`} else if (k === 'timesup') {`);
  assert.ok(early > 0 && branch > 0 && early < branch, 'boss early-return precedes the finish branch');
  assert.ok(out.includes(`if (state === 'finish' || state === 'judge') { this.el.classList.remove('is-live'); this._clearDamageDirs(); }`),
    'existing finish/judge handling unchanged');

  // hud-boss.js (SUNK! / TIME'S UP ending) and main.js (the finish trigger) must be byte-identical
  assert.equal(adaptFinishTape(BOSS_REL, read(BOSS)), read(BOSS), 'boss HUD must not be rewritten');
  assert.equal(adaptFinishTape(MAIN_REL, read(MAIN)), read(MAIN), 'main.js must not be rewritten');
});

test('adapter is inert on unrelated files and guards against double application', () => {
  const other = read('inkwave-public/src/game/actor.js');
  assert.equal(adaptFinishTape('src/game/actor.js', other), other, 'unrelated module untouched');
  const css = adaptFinishTape(CSS_REL, read(CSS));
  assert.ok(css.includes('.iw-bn--finish') && css.includes('@keyframes iw-bn-fin'), 'tape CSS added');
  assert.ok(css.includes('repeating-linear-gradient(115deg'), 'tape is a striped ribbon');
  assert.ok(css.startsWith(read(CSS)), 'CSS is append-only, so it cannot fight an existing rule');
  // the sibling local-quality adapters wired through adaptQualitySource all use this namespace,
  // so the shared double-apply guards in quality.test.mjs / runtime-ui.test.mjs still apply
  assert.throws(() => adaptFinishTape(CSS_REL, css), /quality patch conflict/, 'CSS double-apply guarded');
  const out = adaptFinishTape(HUD_REL, read(HUD));
  assert.throws(() => adaptFinishTape(HUD_REL, out), /quality patch conflict/, 'hud.js double-apply guarded');
  assert.throws(() => replaceOnceFinish('nope', 'missing-anchor', 'x', 'probe'), /quality patch conflict/,
    'a lost anchor fails loudly instead of silently no-oping');
});

test('shipped clearFinishTape removes exactly the finish tape (native, real source)', () => {
  const out = adaptFinishTape(HUD_REL, read(HUD));
  // the definition is a one-line method body in the shipped source; run THAT text, not a re-implementation
  const m = out.match(/clearFinishTape\(\) \{([^\n]*)\}/);
  assert.ok(m, 'clearFinishTape is present in the shipped source');
  const body = m[1];
  assert.ok(body.includes(`querySelectorAll('.iw-bn--finish')`), 'it selects the finish tape');

  const removed = [];
  const kept = [];
  const banners = [
    { cls: 'iw-bn iw-bn--finish', remove() { removed.push(this.cls); } },
    { cls: 'iw-bn iw-bn--go', remove() { kept.push(this.cls); } },
    { cls: 'iw-bn iw-bn--minute', remove() { kept.push(this.cls); } },
  ];
  const bannerLayer = {
    // a real querySelectorAll returns only the matches for the selector it is given
    querySelectorAll(sel) {
      assert.equal(sel, '.iw-bn--finish');
      return banners.filter((b) => b.cls.split(/\s+/).includes(sel.replace(/^\./, '')));
    },
  };
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    `globalThis.run = function (self) { self.clearFinishTape = function () {${body}}; self.clearFinishTape(); }`,
    ctx);
  ctx.run({ bannerLayer });
  assert.deepEqual(removed, ['iw-bn iw-bn--finish'], 'the tape is removed');
  assert.deepEqual(kept, [], 'other banners are never touched by the judge clear');
});