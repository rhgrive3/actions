// INKWAVE issue-412 build-only adapter: Super Jump chain-target destination inheritance.
// Upstream inkwave-public/ is never edited here. Parent wires adaptIssue412ChainJump
// into the build chain; this module is intentionally standalone and NOT yet referenced
// by patches/reliability/adapter.mjs or scripts/build-inkwave.mjs (see wiring note).
// Splatoon 3 reference (Ver. 11.3.0, Inkipedia Super Jump): jumping to a teammate
// already Super Jumping inherits that teammate's committed destination; never the
// transient midair pos. Remote constraint (real shape in src/net/netmatch.js):
// owners emit 'superjump' { phase:'flight', to:[x,y,z] } via packEvent vectors;
// remotes set a.net.sjTo = e.to.clone() on flight (L550) and clear it on
// 'superjump:land' (L552). Charge-phase remotes carry NO sjTo (flag-only
// sjCharge/sjFlight in snapshots), so they stay unselectable. Live object
// identity is never replicated.
// Native allocation fact (src/game/actor.js superJump/_updateSuperJump):
// superJump() allocates st.to as NEW ZERO Vector3 during CHARGE and fills it
// only at the charge->flight transition. A phase-blind `st.to` pick therefore
// jumps to world origin when the target is still charging. This resolver is
// phase-aware: charge never reads st.to.
export function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE issue-412 conflict (${label}): expected exactly one connection.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// Finite-vector guard shared by every branch: rejects null/NaN/Infinity and
// packed-array leftovers so only real {x,y,z} triples resolve.
function finiteTriple(to) {
  return !!(to && typeof to.x === 'number' && typeof to.y === 'number' && typeof to.z === 'number'
    && Number.isFinite(to.x + to.y + to.z));
}

// A zero Vector3 is the native CHARGE placeholder (allocated in superJump(),
// filled only on FLIGHT). It must never resolve as a destination.
function isZeroTriple(to) {
  return to.x === 0 && to.y === 0 && to.z === 0;
}

function cloneTriple(to) {
  return { x: to.x, y: to.y, z: to.z };
}

// Phase-aware, testable core: resolve the immutable committed destination for A -> B.
// - dead/invalid B stays unselectable (returns null)
// - live B with no jump state: ordinary target, caller keeps the normal native
//   path a.superJump(o) (null here; #362 owns that path, never this resolver)
// - live B in FLIGHT: committed st.to (finite, non-zero) is cloned; remote
//   flight without local st uses replicated net.sjTo (flight event only)
// - live B in CHARGE: st.to is the native zero placeholder -> NEVER used.
//   charge+Vector target: clone that existing target vector (already a real
//   ground destination per superJump(vector) contract).
//   charge+Actor target: if that actor is itself jumping, recurse one hop
//   (A->B->C chain to B's committed destination). If that actor is ORDINARY
//   (not jumping), return null: its ground destination needs the native
//   charge-transition resolution (pos offset + physics raycast + pointInside),
//   which cannot run without #362's snapshot model. Faking it with pos,
//   default.to, or airborne pos would pretend to resolve #412.
// - never returns a live reference: always a fresh {x,y,z} triple or null
// - cycle-safe with a depth cap: A->B->A returns null (invalid, not live-tracked)
export function resolveChainJumpDestination(target, seen = []) {
  if (!target || target.alive === false) return null;
  if (seen.includes(target)) return null;
  seen.push(target);
  if (seen.length > 8) return null;
  const st = target.superJumpState ?? null;
  if (!st) return null; // ordinary target: caller keeps native a.superJump(o) path
  const phase = st.phase ?? null;
  if (phase === 'flight') {
    const to = st.to ?? target.net?.sjTo ?? null;
    if (finiteTriple(to) && !isZeroTriple(to)) return cloneTriple(to);
    return null;
  }
  if (phase === 'charge') {
    // CHARGE: st.to is NEW ZERO Vector3 by native construction. Ignore it.
    const tgt = st.target ?? null;
    const isVec = !!(tgt && typeof tgt.x === 'number' && !tgt.pos);
    if (isVec && finiteTriple(tgt)) return cloneTriple(tgt); // existing target vector
    const isLiveActor = !!(tgt && tgt.pos && typeof tgt.pos.clone === 'function');
    if (isLiveActor) {
      // Chain hop only when the next actor is itself jumping (A->B->C).
      // Charge->ordinary-actor is SCOPE-LIMITED (see SCOPE note below).
      if (tgt.superJumpState) return resolveChainJumpDestination(tgt, seen);
      return null;
    }
    return null;
  }
  // Unknown phase (defensive): only honor an explicit finite non-zero `to`.
  if (st.to && finiteTriple(st.to) && !isZeroTriple(st.to)) return cloneTriple(st.to);
  const remote = target.net?.sjTo ?? null;
  if (finiteTriple(remote) && !isZeroTriple(remote)) return cloneTriple(remote);
  return null;
}

// SCOPE (parent decides): charge-phase target whose st.target is an ORDINARY
// (non-jumping) actor cannot be resolved by this adapter without #362's
// committed-snapshot model. The correct native destination is computed only at
// the charge->flight transition (1.1m offset + physics raycast + pointInside),
// which needs live physics/level at pick time. resolveChainJumpDestination
// returns null there; the patched pick() then skips (o IS jumping), so the
// teammate stays unselectable. Honest scope limit, not a silent origin jump.
export const SCOPE_CHARGE_ORDINARY_ACTOR = 'charge-target-ordinary-actor:unresolvable-without-362';

export function isChainJumpTarget(target) {
  return resolveChainJumpDestination(target) !== null;
}

export const PICK_BEFORE = '      const pick = (i) => { const o = allies[i]; if (o && o.alive && !o.superJumpState) a.superJump(o); };';

// Self-contained replacement: no cross-patch import is injected, so the built
// player.js stays self-sufficient (patches/reliability/ is not copied to _site).
// The committed destination is snapshotted into a fresh Vector3, making the
// native superJump(vector) path store an immutable copy, never a live actor.
// Ordinary teammates keep a.superJump(o) (#362 path untouched).
export const PICK_AFTER = [
  '      // #412 chain jump (phase-aware): already-jumping teammate resolves to',
  '      // committed destination only. CHARGE never reads st.to (native zero',
  '      // placeholder); charge+Vector clones the target vector;',
  '      // charge+ordinary-Actor stays unselectable (needs #362).',
  '      // Remote flight uses replicated net.sjTo (flight event only).',
  '      const resolveIssue412Destination = (o) => {',
  '        const fin = (v) => !!(v && typeof v.x === \'number\' && typeof v.y === \'number\' && typeof v.z === \'number\' && Number.isFinite(v.x + v.y + v.z));',
  '        const zero = (v) => v.x === 0 && v.y === 0 && v.z === 0;',
  '        const clone = (v) => ({ x: v.x, y: v.y, z: v.z });',
  '        const seen = [];',
  '        let cur = o;',
  '        while (cur && cur.alive !== false && cur.superJumpState) {',
  '          if (seen.includes(cur) || seen.length > 8) return null;',
  '          seen.push(cur);',
  '          const st = cur.superJumpState;',
  '          if (st.phase === \'flight\') {',
  '            const to = st.to ?? cur.net?.sjTo ?? null;',
  '            return (fin(to) && !zero(to)) ? clone(to) : null;',
  '          }',
  '          if (st.phase === \'charge\') {',
  '            const tgt = st.target ?? null;',
  '            if (tgt && typeof tgt.x === \'number\' && !tgt.pos) return fin(tgt) ? clone(tgt) : null;',
  '            const live = !!(tgt && tgt.pos && typeof tgt.pos.clone === \'function\');',
  '            if (live && tgt.superJumpState) { cur = tgt; continue; }',
  '            return null;',
  '          }',
  '          const to = st.to ?? cur.net?.sjTo ?? null;',
  '          return (fin(to) && !zero(to)) ? clone(to) : null;',
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
