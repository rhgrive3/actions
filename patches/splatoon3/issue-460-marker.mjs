// Issue #460: Super Jump arrival countdown gauge (presentation-only).
//
// Splatoon 3 shows a landing marker whose arrow gauge drains as the jumper
// approaches. INKWAVE's owner flight path (inkwave-public/src/game/actor.js)
// and remote proxy renderer (inkwave-public/src/net/netmatch.js) only emit
// generic repeating pulse rings: no jumper identity, no normalized arrival
// progress, no countdown semantics, and no bounded stale-marker lifecycle.
//
// Scope (build-only, no gameplay/event-application/protocol change):
// - pure presentation helpers reading existing replicated flight state
//   (s.t / s.dur owner-side, event-carried dur + local clock remote-side);
// - monotone progress snapshots { progress, remaining, label } rendered next
//   to the existing pulse ring (same destination, colour, lifecycle anchors);
// - stale-marker lifecycle bound to landing/cancel/death/respawn/phase exit;
// - future Stealth Jump visibility hook (concealed => collapse countdown).
// No charge/flight duration, destination, damage, invulnerability, turf, or
// snapshot wire change. No inkwave-public mutation: this file is composed by
// a new narrow adapter entry (see issue-460 adapter wiring reported to the
// parent); the shared splatoon3/local-quality dispatcher is untouched here.
const clamp01 = (x) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

// #272: Stealth Jump (pinned trait SuperJumpSign_Hide, shoes main) conceals the
// super-jump landing sign from opponents who are FAR from it. Nintendo's own
// gear guide (nintendo.com/jp/ichikara/av5ja/02.html): 「遠くにいる相手からは、
// 『スーパージャンプ』の着地地点を示すマーカーが見えなくなる」 — an opponent near
// the landing point still sees it. The radius is not published for Splatoon 3
// (未確認). Community observation (Splatoon 2 era: fully visible within ~0.5
// test line, fading to fully transparent at ~1 line; Splatoon 3 guides: "about
// Sploosh-o-matic range") is modelled as a spherical fade from 2.5 to 5 units
// (one test line = 5 units). The jumper always sees their own sign and
// teammates still see it. Without a known local viewer position or landing
// point the sign is treated as hidden, the conservative choice so the
// destination does not leak to the far field.
export const STEALTH_JUMP_SIGN_FULL_DISTANCE = 2.5;
export const STEALTH_JUMP_SIGN_VISIBLE_DISTANCE = 5;
const finiteXYZ = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
export function superJumpSignOpacityFor(jumper, viewer, landing = jumper?.superJumpState?.to) {
  if (!jumper?.s3?.modifiers?.stealthJump) return 1;
  if (viewer && viewer === jumper) return 1;
  if (jumper.team === viewer?.team) return 1;
  const eye = viewer?.pos;
  if (!finiteXYZ(eye) || !finiteXYZ(landing)) return 0;
  const d = Math.hypot(eye.x - landing.x, eye.y - landing.y, eye.z - landing.z);
  const near = STEALTH_JUMP_SIGN_FULL_DISTANCE, far = STEALTH_JUMP_SIGN_VISIBLE_DISTANCE;
  if (d <= near) return 1;
  if (!(d < far)) return 0;
  return (far - d) / (far - near);
}
export function superJumpSignHiddenFrom(jumper, viewer, landing = jumper?.superJumpState?.to) {
  return !(superJumpSignOpacityFor(jumper, viewer, landing) > 0);
}

// Owner-side normalized flight progress from the live native flight state.
// Returns 0 outside an active flight so charge/cancel/land collapse cleanly.
export function ownerJumpProgress(state) {
  if (!state || state.phase !== 'flight') return 0;
  const t = Number(state.t), dur = Number(state.dur);
  if (!Number.isFinite(t) || !Number.isFinite(dur) || !(dur > 0)) return 0;
  return clamp01(t / dur);
}

// Remote-side normalized flight progress. The owner flight duration arrives
// on the existing replicated `superjump` flight event; the proxy advances a
// presentation-only clock (`elapsed`) that never writes gameplay state.
// `elapsed`/`dur` NaN, missing, or non-positive collapse to 0 (charge/land).
export function remoteJumpProgress(elapsed, dur) {
  const t = Number(elapsed), d = Number(dur);
  if (!Number.isFinite(t) || !Number.isFinite(d) || !(d > 0)) return 0;
  return clamp01(t / d);
}

export function jumpRemaining(dur, progress) {
  const d = Number(dur);
  if (!Number.isFinite(d) || !(d > 0)) return 0;
  return Math.max(0, d * (1 - clamp01(progress)));
}

// Presentation snapshot shared by owner and remote render paths. `concealed`
// is the Stealth Jump visibility hook: when true the marker keeps its bound
// lifecycle but exposes no countdown cue. `opacity` (0..1) fades a partially
// visible Stealth Jump sign; opacity 0 is the same as concealed.
export function jumpMarkerSnapshot({ progress = 0, dur = 0, jumper = '', concealed = false, opacity = 1 } = {}) {
  const p = clamp01(progress);
  const remaining = jumpRemaining(dur, p);
  const alpha = concealed === true ? 0 : clamp01(opacity);
  const visible = alpha > 0;
  return {
    progress: p,
    remaining,
    // Countdown drains toward landing (1 -> 0), matching the reference arrow gauge.
    countdown: visible ? 1 - p : 0,
    label: visible ? String(jumper ?? '') : '',
    concealed: !visible,
    opacity: alpha,
  };
}

// Lifecycle: the marker snapshot lives only during active flight and is
// cleared on landing, cancel, death, or respawn. Returns null when stale.
export function liveJumpMarker(active, snapshot) {
  if (active !== true) return null;
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot;
}
