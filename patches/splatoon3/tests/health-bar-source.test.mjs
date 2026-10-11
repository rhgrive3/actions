import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENEMY_HEALTH_SECONDS } from '../runtime/combat-info.mjs';

// Ver.11.0 remaining-health bar (#716). spl__PlayerDispHPParam first appears in the
// 11.0.0 SplPlayer table and is unchanged through the pinned 11.3.0 table.
const PATCH = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = 'data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json#/GameParameters/spl__PlayerDispHPParam/';
const numbers = JSON.parse(fs.readFileSync(path.join(PATCH, 'reference/curated-numbers.json'), 'utf8')).parameters;
const raw = field => {
  const entry = numbers[SOURCE + field];
  assert.equal(entry?.status, 'extracted', field);
  return entry.value;
};
const css = fs.readFileSync(path.join(PATCH, 'ui.css'), 'utf8');
const rule = selector => css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'))?.[1] || '';

test('enemy bar lifetime is the pinned RecvDmgReactDispFrm at 60 Hz', () => {
  assert.equal(raw('RecvDmgReactDispFrm'), 180);
  assert.equal(ENEMY_HEALTH_SECONDS, raw('RecvDmgReactDispFrm') / 60);
});

test('bar keeps the unit-free source aspect ratio and opaque RGB 0.3 background', () => {
  const body = rule('.iw-health');
  const width = Number(body.match(/(?:^|;)width:(\d+(?:\.\d+)?)px/)?.[1]);
  const height = body.match(/(?:^|;)height:calc\((\d+(?:\.\d+)?)px \* (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?)\)/);
  assert.ok(width > 0, 'explicit pixel width');
  assert.ok(height, 'height is derived from the width by the source ratio');
  assert.equal(Number(height[1]), width);
  assert.equal(Number(height[2]) / Number(height[3]), raw('BarHeight') / raw('BarWidth'));
  const [r, g, b, a] = ['R', 'G', 'B', 'A'].map(c => raw('BarBgColor/' + c));
  assert.equal(a, 1, 'source background is opaque');
  const bg = body.match(/background:rgb\((\d+),(\d+),(\d+)\)/);
  assert.ok(bg, 'opaque rgb() background');
  assert.deepEqual(bg.slice(1).map(Number), [r, g, b].map(v => Math.round(v * 255)));
});

test('damage-reaction colour window stays recorded as unimplemented, not invented', () => {
  // RecvDmgReactColorFrm 12 is pinned but its colour is not a field of this table.
  assert.equal(raw('RecvDmgReactColorFrm'), 12);
  assert.doesNotMatch(css, /iw-health[^{]*react/i);
});
