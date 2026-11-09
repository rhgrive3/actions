// Owner requests 2026-11-09: Blaster impact mark on Shooter (1, fixed) and Dualies (2, moving);
// no synthesized title score; title A press / tone, GO and the judge flag recordings x1.5.
// Logic only: the levels and the reticle have not been compared on a device.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OWNER_SFX } from '../runtime/audio/owner-sfx-recordings.mjs';
import { blasterReticleMarkup } from '../runtime/blaster-reticle-presentation.mjs';
import { BLASTER_CAMERA_RING, BLASTER_MARK, S3_RETICLE_CSS, blasterMarkMarkup } from '../runtime/s3-reticle-look.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');

test('recorded title cues, GO and the judge flag are 1.5x their 2026-11-07 gains', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  close(OWNER_SFX.title_press.gain, 0.103 * 1.5);
  close(OWNER_SFX.title_follow.gain, 0.0415 * 1.5);
  close(OWNER_SFX.go_horn.gain, 0.125 * 1.5);
  close(OWNER_SFX.judge_reveal.gain, 0.149 * 1.5);
});

test('the title screen requests no synthesized score; other tracks pass through', () => {
  const main = adaptBuildSource('src/main.js', read('src/main.js'));
  const body = main.slice(main.indexOf('  _playMusic(t, fade = 1.2) {'), main.indexOf('  _playMusic(t, fade = 1.2) {') + 400);
  assert.match(body, /this\._musicTrack = t; try \{ G\.music\?\.play\(t === 'title' \? null : t, \{ fade \}\); \}/);
  // the title -> menu switch still compares against the recorded 'title' request
  assert.match(main, /if \(this\._musicTrack !== \(s === 'title' \? 'title' : 'menu'\)\) this\._playMusic\(s === 'title' \? 'title' : 'menu'\);/);
});

test('the copied mark carries the Blaster impact mark geometry and colours', () => {
  const blaster = blasterReticleMarkup();
  const impact = blaster.slice(blaster.indexOf('<g data-blaster="impact">'));
  const nums = s => [...s.matchAll(/r="([\d.]+)"|stroke-width(?:=|:)"?([\d.]+)/g)].map(m => Number(m[1] ?? m[2]));
  const mark = blasterMarkMarkup(0);
  // direct cross widths 3/1, ink ring r15 w4, white ring r12.5 w2, dot r3: same sequence as the Blaster
  assert.deepEqual(nums(mark), nums(impact));
  assert.deepEqual(nums(mark), [3, 1, 15, 4, 12.5, 2, 3]);
  assert.equal(BLASTER_MARK.inkRadius, 15);
  const cross = /d="([^"]+)"/.exec(impact)[1];
  assert.equal(/d="([^"]+)"/.exec(mark)[1], cross);
  assert.match(mark, /stroke:var\(--self, #7040ff\);stroke-width:4/);
  assert.match(mark, /transform="translate\(0 0\)"/);
  assert.match(blasterMarkMarkup(-17.5), /transform="translate\(-17\.5 0\)"/);
  // the on-target cross is hidden until the reticle is on an enemy, as on the Blaster
  assert.match(S3_RETICLE_CSS, /\.iw-xh \.iw-ret g\.s3-blast-direct \{ display: none; \}/);
  assert.match(S3_RETICLE_CSS, /\.iw-xh\.is-target \.iw-ret g\.s3-blast-direct \{ display: inline; \}/);
});

test('dualies fixed camera rings copy the Blaster fixed camera ring', () => {
  const ring = /<circle data-blaster="camera-ring" r="([\d.]+)" stroke="([^"]+)" stroke-width="([\d.]+)" opacity="([\d.]+)"/.exec(blasterReticleMarkup());
  assert.ok(ring, 'Blaster camera ring markup');
  assert.deepEqual([BLASTER_CAMERA_RING.radius, BLASTER_CAMERA_RING.stroke, BLASTER_CAMERA_RING.width, BLASTER_CAMERA_RING.opacity],
    [Number(ring[1]), ring[2], Number(ring[3]), Number(ring[4])]);
});
