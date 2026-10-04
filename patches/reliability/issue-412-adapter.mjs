// INKWAVE issue-412 build-only adapter: Super Jump chain-target destination inheritance.
// Upstream inkwave-public/ is never edited here. Parent wires adaptIssue412ChainJump
// into the build chain; this module is intentionally standalone and NOT yet referenced
// by patches/reliability/adapter.mjs or scripts/build-inkwave.mjs (see wiring note).
// Splatoon 3 reference (Ver. 11.3.0, Inkipedia Super Jump): jumping to a teammate
// already Super Jumping inherits that teammate's committed destination; never the
// transient midair pos. Remote constraint: snapshots carry only phase + committed
// destination vector; live object identity is never replicated.
export function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE issue-412 conflict (${label}): expected exactly one connection.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// Pure, testable core: resolve the immutable committed destination for A -> B.
// - dead/invalid B stays unselectable (returns null)
// - live B with no jump state: ordinary target, caller keeps the normal path (null here)
// - live B already jumping: follow B.superJumpState chain to committed `to`
// - remote snapshot targets (plain {alive,to?,phase} + net.sjTo, no live pos): use sjTo
// - never returns a live reference: always a fresh {x,y,z} triple or null
// - cycle-safe with a depth cap: A->B->A returns null (invalid, not live-tracked)
export function resolveChainJumpDestination(target, seen = []) {
  if (!target || target.alive === false) return null;
  if (seen.includes(target)) return null;
  seen.push(target);
  if (seen.length > 8) return null;
  const st = target.superJumpState ?? null;
  if (!st) return null;
  const to = st.to ?? target.net?.sjTo ?? null;
  if (to && Number.isFinite(to.x + to.y + to.z)) {
    return { x: to.x, y: to.y, z: to.z };
  }
  // Chained actor target not yet committed: follow one hop (charge phase may
  // still hold a live target reference locally). Remote snapshots have no such
  // hop, so they stay null here (remote snapshot constraint).
  const next = st.target ?? null;
  const isLiveActor = !!(next && next.pos && typeof next.pos.clone === 'function');
  if (isLiveActor) return resolveChainJumpDestination(next, seen);
  return null;
}

export function isChainJumpTarget(target) {
  return !!(target && target.alive !== false && target.superJumpState);
}

export const PICK_BEFORE = '      const pick = (i) => { const o = allies[i]; if (o && o.alive && !o.superJumpState) a.superJump(o); };';

// Self-contained replacement: no cross-patch import is injected, so the built
// player.js stays self-sufficient (patches/reliability/ is not copied to _site).
// The committed destination is snapshotted into a fresh Vector3, making the
// native superJump(vector) path store an immutable copy, never a live actor.
export const PICK_AFTER = [
  '      // #412 chain jump: resolve an already-jumping teammate to their committed',
  '      // destination (immutable snapshot). Remote snapshots expose only phase + sjTo.',
  '      const resolveIssue412Destination = (o) => {',
  '        const seen = [];',
  '        let cur = o;',
  '        while (cur && cur.alive !== false && cur.superJumpState) {',
  '          if (seen.includes(cur) || seen.length > 8) return null;',
  '          seen.push(cur);',
  '          const st = cur.superJumpState;',
  '          const to = (st && st.to) ?? cur.net?.sjTo ?? null;',
  '          if (to && Number.isFinite(to.x + to.y + to.z)) return { x: to.x, y: to.y, z: to.z };',
  '          const next = (st && st.target) ?? null;',
  '          cur = (next && next.pos && typeof next.pos.clone === \'function\') ? next : null;',
  '        }',
  '        return null;',
  '      };',
  '      const pick = (i) => {',
  '        const o = allies[i];',
  '        if (!o || !o.alive) return;',
  '        const dest = resolveIssue412Destination(o);',
  '        if (dest) { a.superJump(new THREE.Vector3(dest.x, dest.y, dest.z)); return; }',
  '        if (!o.superJumpState) a.superJump(o);',
  '      };',
].join('\n');

export function adaptIssue412ChainJump(rel, code) {
  if (rel !== 'src/game/player.js') return code;
  return replaceOnce(code, PICK_BEFORE, PICK_AFTER, 'chain-jump target eligibility');
}

// Build-runtime equivalent of the inlined resolver (duck-typed, no THREE needed).
export function resolveIssue412Destination(target) {
  const out = resolveChainJumpDestination(target);
  if (!out) return null;
  return { x: out.x, y: out.y, z: out.z };
}
