import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import {
  effectiveSubCost,
  subReadyFor,
  adaptIssue432,
} from '../runtime/issue-432-sub-cost.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UP = path.join(ROOT, 'inkwave-public');
const read = (rel) => fs.readFileSync(path.join(UP, rel), 'utf8');

test('issue-432 helper matches throw-gate math and isolates actors; negative main control shows stale HUD', async () => {
  const f = await fixture();
  const base = f.SUB.bomb;
  assert.ok(Number.isFinite(base.inkCost) && base.inkCost > 0);
  const mk = (scale) => ({ s3: { modifiers: { inkSaverSub: scale } }, ink: 0 });
  const a0 = mk(1);
  assert.equal(effectiveSubCost(a0, base), base.inkCost);
  assert.equal(subReadyFor(a0, base, base.inkCost), true);
  assert.equal(subReadyFor(a0, base, base.inkCost - 1e-9), false);
  // 10 AP example from the issue: multiplier 0.9394 on the current curve.
  const eff10 = base.inkCost * 0.9394;
  const a10 = mk(0.9394);
  assert.ok(Math.abs(effectiveSubCost(a10, base) - eff10) < 1e-9);
  assert.equal(subReadyFor(a10, base, 66), 66 >= eff10);
  // Negative main control: the published Game frame reads restored base 70.
  const staleHudSaysReady = (ink) => ink >= base.inkCost;
  assert.equal(staleHudSaysReady(66), false, 'unpatched HUD disagrees with the throw gate at 66% ink / 10 AP');
  assert.equal(subReadyFor(a10, base, 66), true, 'helper agrees with the throw gate at 66% ink / 10 AP');
  assert.equal(subReadyFor(a10, base, eff10 - 1e-6), false);
  assert.equal(subReadyFor(a10, base, eff10), true);
  // Per-actor isolation: one actor's gear never leaks into another's cost.
  const b = mk(0.8);
  const c = mk(1);
  assert.ok(Math.abs(effectiveSubCost(b, base) - base.inkCost * 0.8) < 1e-9);
  assert.equal(effectiveSubCost(c, base), base.inkCost);
  assert.equal(Number(f.SUB.bomb.inkCost), Number(base.inkCost), 'shared SUB.bomb untouched by helper reads');
  // Missing modifier falls back to base cost (0 AP behavior).
  assert.equal(effectiveSubCost({}, base), base.inkCost);
  assert.equal(subReadyFor({}, base, base.inkCost), true);
  // Practice Range isolation: same helper path, local actor only.
  const pr = mk(0.9);
  assert.ok(Math.abs(effectiveSubCost(pr, base) - base.inkCost * 0.9) < 1e-9);
});
test('issue-432 adapter transforms fail closed on exact anchors', () => {
  const main = adaptIssue432('src/main.js', read('src/main.js'));
  assert.ok(main.includes('effectiveSubCost(a, SUB.bomb) / PLAYER.inkMax'));
  assert.ok(main.includes('subReady: subReadyFor(a, SUB.bomb, a.ink)'));
  assert.ok(main.includes('subReady: frame.subReady });'));
  assert.ok(main.includes('issue-432-sub-cost.mjs'));
  const hud = adaptIssue432('src/ui/hud.js', read('src/ui/hud.js'));
  assert.ok(hud.includes('const ok = f.subReady ?? ('));
  assert.ok(hud.includes('!(f.subReady ?? (ink >= sub))'));
  assert.equal(adaptIssue432('src/config.js', 'const x = 1;'), 'const x = 1;');
  assert.throws(() => adaptIssue432('src/main.js', 'no anchor'), /patch conflict/);
  assert.throws(() => adaptIssue432('src/ui/hud.js', 'no anchor'), /patch conflict/);
  assert.throws(
    () => adaptIssue432('src/main.js', read('src/main.js') + '\nsubCost: SUB.bomb.inkCost / PLAYER.inkMax,'),
    /patch conflict/,
  );
});
