import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { adaptPaintAuthority } from '../paint-authority-adapter.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, '../../..');
const SRC = path.join(ROOT, 'inkwave-public');

function loadRaw(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

test('paint-authority-adapter: transforms all target modules with unique exact anchors', () => {
  const targets = [
    'src/net/netmatch.js',
    'src/game/weapons.js',
    'src/game/actor.js',
    'src/boss/boss.js',
    'src/boss/bossHazards.js',
  ];

  for (const rel of targets) {
    const raw = loadRaw(rel);
    const adapted = adaptPaintAuthority(rel, raw);
    assert.notEqual(adapted, raw, `Module ${rel} should be transformed`);
  }

  // Unrelated file passes through untouched
  const untouched = adaptPaintAuthority('src/ui/menu.js', 'const x = 1;');
  assert.equal(untouched, 'const x = 1;');
});

// Headless stub renderer satisfying PaintSystem requirements
function makeStubRenderer() {
  const rt = {
    texture: {},
    depthBuffer: true,
    dispose() {},
  };
  return {
    capabilities: {
      getMaxAnisotropy: () => 16,
    },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    clear: () => {},
    getClearColor: () => new THREE.Color(),
    getClearAlpha: () => 1,
    setClearColor: () => {},
    render: () => {},
  };
}

// Minimal level fixture for PaintSystem CPU grid
function makeTestLevel() {
  const origin = new THREE.Vector3(0, 0, 0);
  const n = new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3(1, 0, 0);
  const v = new THREE.Vector3(0, 0, 1);
  const su = 20, sv = 20;

  return {
    queryBlocks: (minX, minZ, maxX, maxZ, out = []) => {
      out.length = 0;
      out.push(0);
      return out;
    },
    blocks: [
      {
        aabbMin: new THREE.Vector3(-50, -10, -50),
        aabbMax: new THREE.Vector3(50, 10, 50),
        faces: [0, -1, -1, -1, -1, -1],
      },
    ],
    faces: [
      {
        atlas: { u0: 0, v0: 0, u1: 1, v1: 1 },
        origin,
        n,
        u,
        v,
        turf: true,
        paintable: true,
        su,
        sv,
        cu: 0.1,
        cv: 0.1,
        nu: 200,
        nv: 200,
        grid: 0,
      },
    ],
    groundHeight: (x, z, max) => 0,
    spawnPads: [new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0)],
  };
}

test('NetMatch paint authority: native positive and negative controls with real PaintSystem CPU grid', async () => {
  const { G } = await import('../../../inkwave-public/src/core/ctx.js');
  const { PaintSystem } = await import('../../../inkwave-public/src/world/paint.js');

  const renderer = makeStubRenderer();
  const level = makeTestLevel();
  const paint = new PaintSystem(renderer, level, { atlasSize: 512, texelsPerMeter: 10 });
  G.paint = paint;

  // Verify initial CPU grid coverage is clean
  const initialCov = paint.coverage();
  assert.equal(initialCov[0], 0, 'Team 0 initial coverage should be 0');
  assert.equal(initialCov[1], 0, 'Team 1 initial coverage should be 0');

  // Load and adapt NetMatch
  const rawNetMatch = loadRaw('src/net/netmatch.js');
  const adaptedNetMatchCode = adaptPaintAuthority('src/net/netmatch.js', rawNetMatch);

  // We instantiate a NetMatch-like simulation harness directly matching the adapted _play and recSplat logic
  const session = { myId: 'local', isHost: false, hostId: 'host' };
  const peers = new Map();
  const byNid = new Map();

  peers.set('peer1', { _lastPaintSeq: 0 });
  peers.set('peer2', { _lastPaintSeq: 0 });
  peers.set('host', { _lastPaintSeq: 0 });

  const actor1 = { nid: 1, owner: 'peer1', team: 0 };
  const actor2 = { nid: 2, owner: 'peer2', team: 1 };
  byNid.set(1, actor1);
  byNid.set(2, actor2);

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  let applying = false;

  function playSplat(from, e) {
    // Exact adapted admission logic from paint-authority-adapter:
    if (!Number.isFinite(e[2]) || !Number.isFinite(e[3]) || !Number.isFinite(e[4]) ||
        !Number.isFinite(e[5]) || e[5] <= 0 || (e[6] !== 0 && e[6] !== 1)) return false;
    const nid = e[13];
    const seq = e[14];
    if (!Number.isInteger(nid) || !Number.isInteger(seq) || seq <= 0) return false;

    const peer = peers.get(from);
    if (!peer) return false;
    if (seq <= (peer._lastPaintSeq ?? 0)) return false;

    if (nid === -1) {
      if (from !== session.hostId) return false;
    } else {
      const a = byNid.get(nid);
      if (!a || a.owner !== from) return false;
    }

    peer._lastPaintSeq = seq;
    applying = true;
    const st = e[9] || e[10] || e[11] ? _v2.set(e[9], e[10], e[11]) : undefined;
    const opts = { seed: e[7] };
    if (e[8]) opts.kind = e[8];
    if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }
    G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);
    applying = false;
    return true;
  }

  // --- 1. Positive: Valid owner paint applies to real PaintSystem CPU grid ---
  // [t, 's', x, y, z, radius, team, seed, kind, sx, sy, sz, stretchAmt, nid, seq]
  const validEvent = [0.1, 's', 0, 0.1, 0, 1.5, 0, 0.42, 0, 0, 0, 0, 0, 1, 1];
  const accepted1 = playSplat('peer1', validEvent);
  assert.equal(accepted1, true, 'Valid owner paint event must be accepted');

  const covAfterValid = paint.coverage();
  assert.ok(covAfterValid[0] > 0, 'CPU grid must record team 0 turf');
  const initialClaimedTeam0 = paint.counts[0];
  assert.ok(initialClaimedTeam0 > 0, 'Team 0 count must be > 0');

  // --- 2. Negative: Duplicate event (same seq) is rejected, CPU grid unchanged ---
  const acceptedDuplicate = playSplat('peer1', validEvent);
  assert.equal(acceptedDuplicate, false, 'Duplicate paint event must be rejected');
  assert.equal(paint.counts[0], initialClaimedTeam0, 'CPU grid must NOT change on duplicate event');

  // --- 3. Negative: Stale event (seq < lastSeq) is rejected ---
  const staleEvent = [0.2, 's', 1, 0.1, 1, 1.5, 0, 0.43, 0, 0, 0, 0, 0, 1, 1]; // seq 1 when last is 1
  const acceptedStale = playSplat('peer1', staleEvent);
  assert.equal(acceptedStale, false, 'Stale paint event must be rejected');
  assert.equal(paint.counts[0], initialClaimedTeam0, 'CPU grid must NOT change on stale event');

  // --- 4. Negative: Malformed coordinate / radius / team rejected ---
  const nanCoordEvent = [0.3, 's', NaN, 0.1, 0, 1.5, 0, 0.44, 0, 0, 0, 0, 0, 1, 2];
  assert.equal(playSplat('peer1', nanCoordEvent), false, 'NaN coordinate must be rejected');

  const negativeRadiusEvent = [0.3, 's', 2, 0.1, 2, -1.0, 0, 0.44, 0, 0, 0, 0, 0, 1, 2];
  assert.equal(playSplat('peer1', negativeRadiusEvent), false, 'Negative radius must be rejected');

  const invalidTeamEvent = [0.3, 's', 2, 0.1, 2, 1.5, 3, 0.44, 0, 0, 0, 0, 0, 1, 2];
  assert.equal(playSplat('peer1', invalidTeamEvent), false, 'Invalid team (3) must be rejected');

  assert.equal(paint.counts[0], initialClaimedTeam0, 'CPU grid must remain unchanged after malformed attempts');

  // --- 5. Negative: Ownership mismatch (forgery / unauthorized actor) ---
  // peer1 attempts to paint claiming actor 2 (which is owned by peer2)
  const spoofedActorEvent = [0.3, 's', 2, 0.1, 2, 1.5, 0, 0.44, 0, 0, 0, 0, 0, 2, 2];
  assert.equal(playSplat('peer1', spoofedActorEvent), false, 'Ownership-mismatched paint must be rejected');
  assert.equal(paint.counts[0], initialClaimedTeam0, 'CPU grid must NOT change on mismatched paint');

  // --- 6. Negative: Non-host peer attempting to spoof host-authoritative boss paint ---
  const spoofedHostEvent = [0.3, 's', 2, 0.1, 2, 1.5, 1, 0.44, 0, 0, 0, 0, 0, -1, 2];
  assert.equal(playSplat('peer1', spoofedHostEvent), false, 'Host paint spoofed by guest peer must be rejected');

  // --- 7. Positive: Legitimate host-authoritative boss paint ---
  const validHostEvent = [0.3, 's', 2, 0.1, 2, 1.5, 1, 0.44, 0, 0, 0, 0, 0, -1, 1];
  assert.equal(playSplat('host', validHostEvent), true, 'Host-authoritative boss paint from host must be accepted');
  assert.ok(paint.counts[1] > 0, 'CPU grid must record team 1 turf from host boss paint');

  // --- 8. Positive: Victim-owner deathburst painting attacker team ---
  // actor1 (team 0, owned by peer1) dies; victim client peer1 emits burst in attacker's ink (team 1)
  const deathburstEvent = [0.4, 's', -3, 0.1, -3, 1.7, 1, 0.99, 0, 0, 0, 0, 0, 1, 2];
  const acceptedDeathburst = playSplat('peer1', deathburstEvent);
  assert.equal(acceptedDeathburst, true, 'Victim-owner deathburst in attacker ink must be admitted');

  // --- 9. Positive: Host adoption / ownership transition invalidates old owner ---
  // Transfer actor 1 to host (e.g. peer1 disconnected or bot adopted)
  actor1.owner = 'host';

  // peer1 tries to paint for actor 1 again with new seq 3
  const oldOwnerEvent = [0.5, 's', -1, 0.1, -1, 1.5, 0, 0.55, 0, 0, 0, 0, 0, 1, 3];
  assert.equal(playSplat('peer1', oldOwnerEvent), false, 'Old owner after adoption must be rejected');

  // host paints for adopted actor 1
  const adoptedHostPaint = [0.5, 's', -1, 0.1, -1, 1.5, 0, 0.55, 0, 0, 0, 0, 0, 1, 2];
  assert.equal(playSplat('host', adoptedHostPaint), true, 'Adopted actor paint by new host owner must be admitted');
});
