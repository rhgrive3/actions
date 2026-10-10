import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  captureFinishMapSnapshot,
  captureTurfFinish,
  validFinishCoverage,
  validFinishMapDataUrl,
} from '../runtime/turf-finish.mjs';
import { cancelPortraitWeaponInput } from '../../local-quality/portrait-guard.mjs';

test('#1095 portrait entry cancels held release-triggered weapon state without synthesizing release', () => {
  let cancelled = 0;
  const actor = {
    fireBuffer: 1,
    intent: { fire: true, sub: true },
    _prevIntent: { fire: true, sub: true },
    weaponRunner: {
      aimingSub: true,
      charging: true,
      cancelPendingInput() { cancelled++; this.charging = false; },
    },
  };
  assert.equal(cancelPortraitWeaponInput(actor), true);
  assert.equal(cancelled, 1);
  assert.equal(actor.weaponRunner.charging, false);
  assert.equal(actor.weaponRunner.aimingSub, false);
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.sub, false);
  assert.equal(actor._prevIntent.fire, false);
  assert.equal(actor._prevIntent.sub, false);
  assert.equal(actor.fireBuffer, 0);
  assert.equal(cancelPortraitWeaponInput(null), false);
});

test('#1092 deadline map snapshot is immutable presentation input, not a later live paint read', () => {
  let updates = 0;
  const minimap = {
    _band: 2,
    update() { updates++; if (this._band > 0) this._band--; },
    canvas: { toDataURL: () => 'data:image/png;base64,ZmFrZQ==' },
  };
  const match = {};
  const frozen = captureFinishMapSnapshot(match, minimap);
  assert.equal(frozen, 'data:image/png;base64,ZmFrZQ==');
  assert.equal(match.s3FinishMapDataUrl, frozen);
  assert.ok(updates >= 3);
  assert.equal(validFinishMapDataUrl(frozen), true);
  assert.equal(validFinishMapDataUrl('https://example.invalid/map.png'), false);
});

test('#1114 host commits already-received deadline paint before freezing coverage exactly once', () => {
  const state = { cov: [1 / 3, 2 / 3], commits: 0 };
  const paint = { coverage: () => [...state.cov] };
  const netm = {
    commitDeadlinePaint() {
      state.commits++;
      state.cov = [2 / 3, 1 / 3];
      return 1;
    },
  };
  const minimap = {
    _band: 0,
    update() {},
    canvas: { toDataURL: () => 'data:image/png;base64,ZGVhZGxpbmU=' },
  };
  const match = { state: 'playing', follower: false, bossMode: false, local: null };
  captureTurfFinish(match, 'finish', paint, netm, minimap);
  assert.equal(state.commits, 1);
  assert.deepEqual(match.s3FinishCoverage, [2 / 3, 1 / 3]);
  assert.equal(Object.isFrozen(match.s3FinishCoverage), true);
  assert.equal(match.s3FinishMapDataUrl, 'data:image/png;base64,ZGVhZGxpbmU=');
  assert.equal(validFinishCoverage(match.s3FinishCoverage), true);
});

test('#1094 follower finish transition preserves propagated host snapshot for later migration', () => {
  const authoritative = Object.freeze([0.51, 0.49]);
  const match = {
    state: 'playing',
    follower: true,
    bossMode: false,
    local: null,
    s3FinishCoverage: authoritative,
    s3FinishMapDataUrl: 'data:image/png;base64,aG9zdA==',
  };
  const paint = { coverage: () => [0.1, 0.9] };
  captureTurfFinish(match, 'finish', paint, { commitDeadlinePaint() { throw new Error('follower must not commit'); } }, null);
  assert.equal(match.s3FinishCoverage, authoritative);
  assert.deepEqual(match.s3FinishCoverage, [0.51, 0.49]);
  assert.equal(match.s3FinishMapDataUrl, 'data:image/png;base64,aG9zdA==');
});

test('network composition carries finish authority and never double-applies committed deadline paint', () => {
  const source = fs.readFileSync(new URL('../../network-replication/adapter.mjs', import.meta.url), 'utf8');
  assert.match(source, /commitDeadlinePaint\(\)/);
  assert.match(source, /e\._deadlineEligible/);
  assert.match(source, /e\._finishPaintApplied/);
  assert.match(source, /if \(!e\._finishPaintApplied\) this\._applyRemoteSplatEvent\(e\)/);
  assert.match(source, /validFinishCoverage\(m\.s3FinishCoverage\)/);
  assert.match(source, /validFinishMapDataUrl\(m\.s3FinishMapDataUrl\)/);
  assert.match(source, /m\.s3FinishCoverage = Object\.freeze\(\[d\.fc\[0\], d\.fc\[1\]\]\)/);
  assert.match(source, /m\.s3FinishMapDataUrl = d\.fm/);
});

test('#1101 adoption transfer carries remaining main-weapon cooldown across runner reset', () => {
  const source = fs.readFileSync(new URL('../../network-replication/adapter.mjs', import.meta.url), 'utf8');
  assert.match(source, /ADOPTION_COOLDOWN_MAX/);
  assert.match(source, /actor\.weaponRunner\?\.cooldown/);
  assert.match(source, /!\[8,9,10,11\]\.includes\(row\.length\)/);
  assert.match(source, /out\.cooldown = Math\.max\(0, \(a\.cooldown \|\| 0\) - dt\)/);
  assert.match(source, /actor\.weaponRunner\.cooldown = Math\.max\(actor\.weaponRunner\.cooldown \|\| 0, current\.cooldown \|\| 0\)/);
});

test('Judd result adapter consumes only the frozen finish map', () => {
  const source = fs.readFileSync(new URL('../judd-result-adapter.mjs', import.meta.url), 'utf8');
  assert.match(source, /s3FinishMapDataUrl/);
  assert.doesNotMatch(source, /minimap\.update\(0, true\)/);
});
