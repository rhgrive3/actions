// menu-layout.mjs caps the entrance stagger (ENTRANCE_STAGGER_CAP), so every
// .iw-in past the cap used to start the same spring animation on one frame:
// ~146 weapon cards at once on each loadout re-open. List items past three
// times the cap now render in their final state (CSS only; menu-layout.mjs is
// a source-identity-pinned owner and is unchanged). Static semantic check,
// not a browser frame-time measurement.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const css = fs.readFileSync(new URL('../ui.css', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../runtime/menu-layout.mjs', import.meta.url), 'utf8');
test('entrance items past 3x the stagger cap skip the simultaneous burst', () => {
  const cap = Number(layout.match(/export const ENTRANCE_STAGGER_CAP = (\d+);/)[1]);
  const rule = css.match(/\.iw-ui \.iw-in:nth-child\(n\+(\d+)\) \{ animation: none !important; \}/);
  assert.ok(rule, 'shipped stylesheet carries the burst guard');
  const first = Number(rule[1]);
  assert.equal(first, cap * 3 + 1, 'guard starts right after the first animated screenful');
  // 160 weapon cards: at most first-1-cap share the capped delay, instead of 160-cap.
  const together = Math.max(0, Math.min(160, first - 1) - cap);
  assert.ok(together <= cap * 2, `simultaneous entrance animations: ${together}`);
});
