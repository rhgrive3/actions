import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveLobbyQualityName, lobbyShadowDue,
  LOBBY_SHADOW_INTERVAL_LOW,
} from '../issue-472-adapter.mjs';
import { patchLobbySetShowcase } from '../lobby-quality-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

test('touch maps every raw quality to native LOW; desktop passes through natively', () => {
  for (const raw of ['high', 'medium', 'low', 'ultra', undefined, 'bogus']) {
    assert.equal(resolveLobbyQualityName(raw, { touch: true }), 'low');
    assert.equal(resolveLobbyQualityName(raw, { touch: true, ios: true }), 'low');
  }
  assert.equal(resolveLobbyQualityName('high', null), 'high');
  assert.equal(resolveLobbyQualityName('medium', undefined), 'medium');
  assert.equal(resolveLobbyQualityName('low', {}), 'low');
  assert.equal(resolveLobbyQualityName('high', { touch: false }), 'high');
  // Negative main control: desktop HIGH keeps the 0.5x reflection + 2048 shadow preset.
  const lobby = read('inkwave-public/src/game/lobbySet.js');
  assert.match(lobby, /high:\s*\{\s*refl:\s*0\.5,\s*shadow:\s*2048/);
  assert.match(lobby, /low:\s*\{\s*refl:\s*0,\s*shadow:\s*1024/);
  // Native LOW reflection fallback is the env map (no nested scene render).
  assert.match(lobby, /if \(this\._inRefl \|\| !this\.Q\.refl\) return;/);
  assert.match(lobby, /if \(!this\.Q\.refl\) this\.mats\.ground\.userData\.refl\.on\.value = 0;/);
});

test('lobby shadow cadence: LOW 1/3 frames, desktop HIGH/MEDIUM every frame', () => {
  assert.equal(LOBBY_SHADOW_INTERVAL_LOW, 3);
  const L = { quality: 'low' };
  const got = [lobbyShadowDue(L), lobbyShadowDue(L), lobbyShadowDue(L), lobbyShadowDue(L)];
  assert.deepEqual(got, [true, false, false, true]);
  // Mode isolation: desktop lobby owner keeps every-frame updates.
  for (const quality of ['high', 'medium']) {
    const D = { quality };
    assert.equal(lobbyShadowDue(D), true);
    assert.equal(lobbyShadowDue(D), true);
    assert.equal('_lobShadowTick' in D, false);
  }
  // Owner isolation: counters do not leak across lobby owners.
  const A = { quality: 'low' }, B = { quality: 'low' };
  assert.equal(lobbyShadowDue(A), true);
  assert.equal(lobbyShadowDue(B), true);
  assert.equal(lobbyShadowDue(A), false);
  assert.equal(lobbyShadowDue(B), false);
});

test('build-only showcase patch hits lobby anchors exactly once, leaves arena alone', () => {
  const raw = read('inkwave-public/src/game/showcase.js');
  const out = patchLobbySetShowcase('src/game/showcase.js', raw);
  assert.equal((out.match(/issue-472-adapter\.mjs/g) || []).length, 1);
  assert.equal((out.match(/resolveLobbyQualityName\(G\.settings\?\.quality, G\.mobile \?\? G\.game\?\.mobile\)/g) || []).length, 2);
  assert.equal((out.match(/if \(lobbyShadowDue\(L\)\) r\.shadowMap\.needsUpdate = true;/g) || []).length, 1);
  // LOW/touch native-correct fallback: native constructor + setQuality rows used, no invented fields.
  assert.match(out, /new mod\.LobbySet\(this\.r, \{ quality: q,/);
  assert.match(out, /S\.setQuality\?\.\(q\)/);
  // The studio overlay branch still forces its own shadow pass every frame.
  assert.match(out, /const opacity = OVERLAY\.has\(this\.mode\) \? eOut3\(this\.fadeIn\) : c01\(this\._out \/ \(this\._outDur \|\| 0\.2\)\);\n      r\.shadowMap\.needsUpdate = true;/);
  // Arena/world paths untouched: no gameplay, collision, or renderer-wide edit.
  assert.equal(out.includes('G.scene'), false);
  assert.equal((out.match(/r\.shadowMap\.needsUpdate = true/g) || []).length, 4);
  assert.equal((out.match(/^      r\.shadowMap\.needsUpdate = true;$/gm) || []).length, 1);
  // Unrelated file passthrough + idempotency guard.
  assert.equal(patchLobbySetShowcase('src/game/lobbySet.js', 'x'), 'x');
  assert.throws(() => patchLobbySetShowcase('src/game/showcase.js', out), /patch conflict/);
});

test('current studio-shadow owner and lobby quality compose in both orders',async()=>{
  const {adaptShowcaseShadow}=await import('../showcase-shadow-adapter.mjs');
  const {replaceOnce}=await import('../adapter.mjs');
  const rel='src/game/showcase.js',raw=read('inkwave-public/'+rel);
  for(const first of ['studio','lobby']){
    const out=first==='studio'?patchLobbySetShowcase(rel,adaptShowcaseShadow(rel,raw,replaceOnce)):adaptShowcaseShadow(rel,patchLobbySetShowcase(rel,raw),replaceOnce);
    assert.equal((out.match(/import \{ resolveLobbyQualityName, lobbyShadowDue \}/g)||[]).length,1);
    assert.equal((out.match(/syncStudioShadow\(this.key/g)||[]).length,3);
    assert.ok(out.includes('releaseStudioShadow(this.key);'));
    assert.ok(out.includes('if (lobbyShadowDue(L)) r.shadowMap.needsUpdate = true;'));
  }
});
