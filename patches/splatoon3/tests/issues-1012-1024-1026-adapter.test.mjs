import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = rel => fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');
const adapt = rel => adaptSource(rel, read(rel));

test('#1012 adapted PlayerController removes rim acceleration and caps steady yaw below 360deg/s', () => {
  const code = adapt('src/game/player.js');
  assert.ok(code.includes('const yawRate = Math.min(3.6 * ps, Math.PI * 2 - 1e-6);'));
  assert.ok(code.includes('rig.yaw -= this.padLook.x * yawRate * friction * dt;'));
  assert.ok(!code.includes('const boost = 1 + 0.55'));
  assert.ok(!code.includes('* ps * boost * friction * dt'));
});

test('#1024 pad disappearance is marked as cancellation and PlayerController consumes it without release actions', () => {
  const input = adapt('src/core/input.js');
  assert.ok(input.includes("const previousPad = this.pad, padOwned = !!previousPad && this.lastDevice === 'pad';"));
  assert.ok(input.includes('this._s3PadCanceled = true; this.padPrev.length = 0;'));

  const player = adapt('src/game/player.js');
  assert.ok(player.includes('if (inp._s3PadCanceled) {'));
  assert.ok(player.includes('a.weaponRunner?.cancelPendingInput?.();'));
  assert.ok(player.includes('a.weaponRunner.aimingSub = false;'));
  assert.ok(player.includes('a._prevIntent.fire = false; a._prevIntent.sub = false;'));
});

test('#1026 touch-primary effective quality halves sun-shadow refresh cadence', () => {
  const code = adapt('src/main.js');
  assert.ok(code.includes('const shadowQuality = effectiveQuality(this.settings, this.mobile);'));
  assert.ok(code.includes('const halfRateShadow = !!this.mobile?.touch || shadowQuality.shadowSize <= 1024;'));
  assert.ok(code.includes("if (!worldHidden && (!halfRateShadow || (this._frameN & 1))) sm.needsUpdate = true;"));
  assert.ok(!code.includes("this.settings.quality !== 'low' || (this._frameN & 1)"));
});
