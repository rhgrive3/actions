// Mine paint may follow only the canonical ranked Tower deck. The peer submits
// a local attachment, never an authoritative world pose or a wider radius.
// These dimensions deliberately mirror RankedWorld's INKWAVE blockout, not
// retail stage geometry. Unknown/evicted host revisions fail closed.
const histories = new WeakMap();
const proofListeners = new WeakMap();
const MAX_POSES = 256;
const safe = n => Number.isSafeInteger(n) && n >= 0;
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const xyz = p => p && [p.x, p.y, p.z].every(Number.isFinite) ? [p.x, p.y, p.z] : null;
function state(nm) {
  const match = nm?.match, engine = match?.ranked, epoch = nm?.cfg?.id, host = nm?.s?.hostId;
  if (!match || nm._disposed || match._disposed || engine?.mode !== 'tower'
      || typeof epoch !== 'string' || typeof host !== 'string') return null;
  let s = histories.get(nm);
  if (!s || s.match !== match || s.engine !== engine || s.epoch !== epoch || s.host !== host) {
    s = { match, engine, epoch, host, poses: new Map(), latest: -1 };
    histories.set(nm, s);
  }
  return s;
}
export function clearTowerPaintSupport(nm) { histories.delete(nm); }
export function watchTowerPaintProof(nm, listener) { proofListeners.set(nm, listener); }
export function towerPaintScopeCurrent(nm, scope) { return !!scope && state(nm) === scope; }
export function towerPaintProofPending(nm, revision, scope) {
  const s = state(nm);
  return !!s && s === scope && safe(revision) && revision > s.latest;
}
export function mineTowerPaintBirthWaitScope(nm, payload) {
  const s = state(nm), half = Math.max(.8, Math.min(1.4, Number(s?.engine.stage.tower.halfSize) || 1.4));
  return s && payload.support === 1 && towerPaintProofPending(nm, payload.supportRevision, s)
    && deckPoint({half}, [payload.supportX, payload.supportY, payload.supportZ]) ? s : null;
}

function canonicalPose(stage, snapshot) {
  const path = stage?.tower?.path, p = snapshot?.rule?.progress;
  if (snapshot?.mode !== 'tower' || snapshot.stage !== stage?.id || !safe(snapshot.revision)
      || !Number.isFinite(p) || p < 0 || p > 1 || !Array.isArray(path)
      || path.length < 2 || !path.every(vector)) return null;
  const lengths = path.slice(1).map((b, i) => Math.hypot(...b.map((n, axis) => n - path[i][axis])));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let at = total * p;
  for (let i = 0; i < lengths.length; i++) {
    if (at <= lengths[i] || i === lengths.length - 1) {
      const a = path[i], b = path[i + 1], t = lengths[i] > 1e-6 ? Math.max(0, Math.min(1, at / lengths[i])) : 0;
      const top = a.map((n, axis) => n + (b[axis] - n) * t);
      // RankedWorld consumes rule.position too. A contradictory snapshot must
      // not gain a paint permit from progress while rendering another pose.
      if (!vector(snapshot.rule.position) || top.some((n, axis) => Math.abs(n - snapshot.rule.position[axis]) > 1e-5)) return null;
      const dx = b[0] - a[0], dz = b[2] - a[2], d = Math.hypot(dx, dz);
      const forward = d > 1e-6 ? [dx / d, dz / d] : [0, 1];
      return { center: [top[0], top[1] - .12, top[2]],
        side: [forward[1], 0, -forward[0]], forward: [forward[0], 0, forward[1]],
        half: Math.max(.8, Math.min(1.4, Number(stage.tower.halfSize) || 1.4)) };
    }
    at -= lengths[i];
  }
  return null;
}

// Call only after accepting the current host's validated snapshot, or when
// sending that snapshot as the current host. Duplicate revisions cannot change
// an existing capability; reordered revisions cannot repopulate evicted poses.
export function recordTowerHostSnapshot(nm, snapshot) {
  const s = state(nm);
  if (!s || snapshot?.revision <= s.latest) return false;
  const pose = canonicalPose(s.engine.stage, snapshot);
  if (!pose) return false;
  s.latest = snapshot.revision;
  s.poses.set(snapshot.revision, pose);
  while (s.poses.size > MAX_POSES) s.poses.delete(s.poses.keys().next().value);
  proofListeners.get(nm)?.();
  return true;
}
function localPoint(pose, point) {
  const d = point.map((n, i) => n - pose.center[i]);
  return [d[0] * pose.side[0] + d[2] * pose.side[2], d[1], d[0] * pose.forward[0] + d[2] * pose.forward[2]];
}
function worldPoint(pose, local) {
  return pose.center.map((n, i) => n + pose.side[i] * local[0] + (i === 1 ? local[1] : 0) + pose.forward[i] * local[2]);
}
function deckPoint(pose, local) {
  return local.every(Number.isFinite) && Math.abs(local[0]) <= pose.half + .001
    && Math.abs(local[2]) <= pose.half + .001 && Math.abs(local[1] - .12) <= .1;
}
function samePoint(a, b, tolerance = .011) { return a.every((n, i) => Math.abs(n - b[i]) <= tolerance); }
function colliderMatches(world, pose) {
  const block = world?.towerBlock;
  return world?.mode === 'tower' && !world.disposed && block?.tag === 'ranked-tower'
    && samePoint(xyz(block.center) || [Infinity, Infinity, Infinity], pose.center, 1e-5)
    && samePoint(xyz(block.axes?.[0]) || [Infinity, Infinity, Infinity], pose.side, 1e-5)
    && samePoint(xyz(block.axes?.[2]) || [Infinity, Infinity, Infinity], pose.forward, 1e-5)
    && Math.abs(block.half?.x - pose.half) < 1e-5 && Math.abs(block.half?.y - .12) < 1e-5
    && Math.abs(block.half?.z - pose.half) < 1e-5;
}

export function mineTowerPaintReference(nm, pos) {
  const s = state(nm), point = xyz(pos);
  if (!s || !point || nm._rankedAPI?.G.netm !== nm) return null;
  const snapshot = s.engine.snapshot(), revision = snapshot.revision;
  const pose = canonicalPose(s.engine.stage, snapshot);
  if (!pose || !colliderMatches(s.match.rankedWorld, pose)) return null;
  const local = localPoint(pose, point);
  if (!deckPoint(pose, local)) return null;
  if (nm.isHost && !s.poses.has(revision)) {
    // Physics runs at 60Hz, regular objective replication at 5Hz. Publish the
    // actual host revision before the Mine event instead of trusting a peer's
    // predicted/interpolated Tower pose or silently widening origin checks.
    nm._sendNow({ k: 'rkstate', rk: { match: s.epoch, host: s.host, state: snapshot,
      gains: s.match.rankedGains || [0, 0] } });
  }
  if (!s.poses.has(revision) || !colliderMatches(s.match.rankedWorld, s.poses.get(revision))) return null;
  return { support: 1, supportRevision: revision, supportX: local[0], supportY: local[1], supportZ: local[2] };
}

export function mineTowerPaintBirth(nm, payload) {
  const s = state(nm);
  if (!s || payload.support !== 1 || !safe(payload.supportRevision)) return null;
  const pose = s.poses.get(payload.supportRevision), local = [payload.supportX, payload.supportY, payload.supportZ];
  if (!pose || !deckPoint(pose, local) || !samePoint(worldPoint(pose, local), [payload.x, payload.y, payload.z])) return null;
  return { scope: s, local, revision: payload.supportRevision };
}

export function mineTowerPaintCoreMatches(nm, attachment, revision, point, paintOffsetY) {
  const s = state(nm);
  if (!s || attachment?.scope !== s || !safe(revision) || revision < attachment.revision || !vector(point)) return false;
  const pose = s.poses.get(revision);
  if (!pose) return false;
  const expected = worldPoint(pose, attachment.local);
  expected[1] += paintOffsetY;
  return samePoint(expected, point, .1);
}
