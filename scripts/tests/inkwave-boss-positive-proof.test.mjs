import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { adaptBossHit } from '../../patches/local-quality/boss-hit-adapter.mjs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';

const sourceRoot = new URL('../../', import.meta.url);
const built = process.env.INKWAVE_BUILT_SITE;
const runtimeRoot = built ? pathToFileURL(path.resolve(built) + path.sep) : sourceRoot;
const runtimePaths = ['patches/network-replication/combat-provenance.mjs',
  'patches/splatoon3/runtime/sub-special-fidelity.mjs'];
if (built) {
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const manifest = JSON.parse(fs.readFileSync(new URL('inkwave-build.json', runtimeRoot), 'utf8'));
  assert.equal(manifest.schema, 1);
  assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
  for (const rel of runtimePaths) {
    assert.equal(hash(fs.readFileSync(new URL(rel, runtimeRoot))), manifest.artifacts[rel], 'actual emitted ' + rel);
  }
  for (const [key, rel] of [
    ['network-replication/combat-provenance.mjs', runtimePaths[0]],
    ['patch/runtime/sub-special-fidelity.mjs', runtimePaths[1]],
    ['local-quality/boss-hit-adapter.mjs', 'patches/local-quality/boss-hit-adapter.mjs'],
    ['upstream/src/net/netmatch.js', 'inkwave-public/src/net/netmatch.js'],
  ]) assert.equal(hash(fs.readFileSync(new URL(rel, sourceRoot))), manifest.files[key], 'current source input ' + key);
}
const { combatAdmission, installCombatProvenance } = await import(new URL(runtimePaths[0], runtimeRoot));
const { applyBlasterKnockback } = await import(new URL(runtimePaths[1], runtimeRoot));
// BUILT uses actual emitted admission/knockback modules, never source fallbacks.
// The modeled Boss guard below remains generated from the matching source input.

// Modeled transport fixture with the actual admission wrapper and actual
// generated Boss nonce/value guard. This is not a native Boss HP/browser test.
const native = fs.readFileSync(new URL('../../inkwave-public/src/net/netmatch.js', import.meta.url), 'utf8');
const composed = adaptBossHit('src/net/netmatch.js', native);
const marker = '\n  _acceptBossHit(from, d) {', endMarker = '\n  sendBossHit(';
const start = composed.indexOf(marker), end = composed.indexOf(endMarker, start);
assert(start >= 0 && end > start && composed.indexOf(marker, start + 1) < 0, 'unique real Boss admission method');
const method = composed.slice(start, end);
const production = adaptBuildSource('src/net/netmatch.js', native);
const receiptMarker = '\nfunction iwRemoteBossHitReceiptAllowed(d,from) {';
const receiptStart = production.indexOf(receiptMarker), receiptEnd = production.indexOf('\n}', receiptStart);
assert(receiptStart >= 0 && receiptEnd > receiptStart, 'actual production read-only Boss policy');
const receipt = production.slice(receiptStart, receiptEnd + 2);

function fixture(kind = 'shooter') {
  const G = {};
  const NativeGuard = new Function('G', 'return class {' + method + '}')(G);
  class Match extends NativeGuard {
    constructor() {
      super();
      this.myId = 'local'; this.cfg = { id: 'boss-positive' }; this.isHost = true;
      const actor = { nid: 1, owner: 'peer', remote: true, alive: true, team: 0, netLife: 0,
        pos: { x: 0, y: 0, z: 0 }, net: { cur: { f: kind === 'roller' ? 256 : 1 } },
        weapon: { id: kind, kind, damage: kind === 'roller' ? 140 : 36, range: 35, special: 'storm', sub: 'bomb' },
        weaponRunner: { rolling: kind === 'roller' }, specialActive: null };
      const victim = { nid: 2, owner: 'local', remote: false, alive: true, team: 1, netLife: 0,
        pos: { x: 0, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, invuln: 0 };
      this.byNid = new Map([[1, actor], [2, victim]]);
      this.peers = new Map([['peer', {}]]); this.s = { _members: new Map([['peer', true]]) };
      this.calls = [];
      this.match = { state: 'playing', boss: { sim: true, dead: false, pos: { x: 0, y: 0, z: 2 },
        crabs: new Map([[7, { x: 0, y: 0, z: 2, dead: false }]]),
        model: { hitShapes: [{ active: true, weak: true, pos: { x: 0, y: 1, z: 2 }, r: .9 }] },
        remoteHit: d => this.calls.push(d) } };
      G.netm = this;
    }
    _peer(from) { return this.peers.get(from); }
    _tick(from, d) {
      const p = this._peer(from);
      if (!(d.ts > (p.lastTs ?? -Infinity))) return;
      p.lastTs = d.ts;
      // This modeled fixture supplies a native-installed row, not merely a
      // retained presentation flag. Full row admission is tested separately
      // by contact-/special-provenance production-composition suites.
      for (const row of d.a || []) {
        const actor = this.byNid.get(row[0]);
        if (!actor || actor.owner !== from || d.l?.[row[0]] !== actor.netLife) continue;
        actor.net.buf = [{ t: d.ts, x: row[1], y: row[2], z: row[3],
          f: actor.net.cur.f, life: actor.netLife }];
      }
    }
    _hit() { throw Error('PvP transport is outside this Boss fixture'); }
    onMessage() {}
    onLeave() {}
    dispose() {}
    bind() {}
  }
  installCombatProvenance(Match, { bossReceiptAllowed: new Function('G', 'return (' + receipt + ')')(G) });
  return new Match();
}
const boss = (damage = 36, q = 1, w = 'shooter', c = -1) =>
  ({ k: 'bhit', m: 'boss-positive', a: 1, d: damage, q, w, c, weak: 0, l: 0 });
const pending = nm => nm._combatProvenance?.pending.get('peer')?.length || 0;
const contacts = nm => nm._combatProvenance?.contacts.size || 0;
function fire(nm) {
  nm._tick('peer', { k: 't', ts: 100.05, a: [[1, 0, 0, 0]],
    e: [[100, 'p', 1, 'shot', 'shooter', 0, 1, 0, 0, 0, 45]] });
  const proof = nm._combatProvenance.proofs.get('peer')?.[0];
  assert(proof, 'real ordered event must create a proof');
  proof.maxUses = 1; // Amplify proof loss without replacing admission.
  return proof;
}

for (const [label, value] of [['negative', -1], ['zero', 0], ['negative zero', -0], ['NaN', NaN], ['positive infinity', Infinity], ['negative infinity', -Infinity]]) {
  test('Boss ' + label + ' preserves proof and nonce, then the same nonce accepts positive damage', () => {
    const nm = fixture(), proof = fire(nm), claim = boss(value);
    nm.onMessage('peer', claim);
    assert.equal(nm.calls.length, 0);
    assert.equal(proof.uses, 0);
    assert.equal(nm._peer('peer').lastBossHit, undefined);
    assert.equal(pending(nm), 0); assert.equal(contacts(nm), 0);
    nm.onMessage('peer', boss());
    assert.equal(nm.calls.length, 1); assert.equal(proof.uses, 1);
    assert.equal(nm._peer('peer').lastBossHit, 1);
  });
}
test('Boss nonpositive claim cannot reserve a pending nonce before its shot arrives', () => {
  const nm = fixture();
  for (const d of [-1, -0, 0]) nm.onMessage('peer', boss(d));
  assert.equal(pending(nm), 0);
  nm.onMessage('peer', boss());
  assert.equal(pending(nm), 1);
  fire(nm);
  assert.equal(nm.calls.length, 1); assert.equal(pending(nm), 0);
});
test('Boss nonpositive claim cannot consume Roller contact cooldown', () => {
  const nm = fixture('roller');
  nm.byNid.get(1).net.cur.f = 1 | 256;
  nm._tick('peer', { k: 't', ts: 100, a: [[1, 0, 0, 0]], l: { 1: 0 } });
  for (const d of [-1, 0]) nm.onMessage('peer', boss(d, 1, 'roller'));
  assert.equal(contacts(nm), 0); assert.equal(pending(nm), 0);
  nm.onMessage('peer', boss(140, 1, 'roller'));
  assert.equal(nm.calls.length, 1); assert.equal(contacts(nm), 1);
});
test('Boss nonpositive claim cannot consume active Special contact cooldown', () => {
  const nm = fixture(); nm.byNid.get(1).specialActive = { id: 'storm' };
  nm.byNid.get(1).net.cur.f = 1 | 8192;
  nm._tick('peer', { k: 't', ts: 100, a: [[1, 0, 0, 0]], l: { 1: 0 } });
  for (const d of [-1, 0]) nm.onMessage('peer', boss(d, 1, 'storm'));
  assert.equal(contacts(nm), 0); assert.equal(pending(nm), 0);
  nm.onMessage('peer', boss(30, 1, 'storm'));
  assert.equal(nm.calls.length, 1); assert.equal(contacts(nm), 1);
});
test('Boss crablet zero preserves its proof for a positive claim', () => {
  const nm = fixture(), proof = fire(nm);
  nm.onMessage('peer', boss(0, 1, 'crab', 7));
  assert.equal(proof.uses, 0); assert.equal(pending(nm), 0);
  nm.onMessage('peer', boss(36, 1, 'crab', 7));
  assert.equal(nm.calls.length, 1); assert.equal(proof.uses, 1);
});
test('Boss ceiling rejection still preserves proof for a permitted value', () => {
  const nm = fixture(), proof = fire(nm);
  nm.onMessage('peer', boss(801));
  assert.equal(proof.uses, 0); assert.equal(pending(nm), 0);
  nm.onMessage('peer', boss());
  assert.equal(nm.calls.length, 1); assert.equal(proof.uses, 1);
});
test('PvP zero damage remains eligible and retains actual blaster knockback', () => {
  const nm = fixture(), proof = fire(nm), victim = nm.byNid.get(2);
  const d = { k: 'hit', m: nm.cfg.id, a: 1, v: 2, l: 0, h: 1, d: 0, w: 'shooter', kb: [1, 0, 0] };
  assert.equal(combatAdmission(nm, 'peer', d, 'pvp'), true);
  assert.equal(proof.uses, 1);
  assert.equal(applyBlasterKnockback(victim, d.kb), true);
  assert(victim.vel.x > 0); assert.equal(victim.vel.y, 0); assert.equal(victim.vel.z, 0);
});
test('Rejected Boss zero does not create admission state on a fresh match', () => {
  const nm = fixture();
  assert.equal(combatAdmission(nm, 'peer', boss(0), 'boss'), false);
  assert.equal(nm._combatProvenance, undefined);
});
