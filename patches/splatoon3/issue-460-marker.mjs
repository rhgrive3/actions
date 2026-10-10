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
// super-jump landing sign from the opposing team. The jumper always sees their
// own sign and teammates still see it. Without a known local viewer the sign is
// treated as hidden, the conservative choice so the destination does not leak.
// Network peers are not covered: remote Actors carry no replicated loadout, so
// their stealthJump flag is unknown here (未対応, recorded in the report).
export function superJumpSignHiddenFrom(jumper, viewer) {
  if (!jumper?.s3?.modifiers?.stealthJump) return false;
  if (viewer && viewer === jumper) return false;
  return jumper.team !== viewer?.team;
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
// lifecycle but exposes no countdown cue.
export function jumpMarkerSnapshot({ progress = 0, dur = 0, jumper = '', concealed = false } = {}) {
  const p = clamp01(progress);
  const remaining = jumpRemaining(dur, p);
  const visible = concealed !== true;
  return {
    progress: p,
    remaining,
    // Countdown drains toward landing (1 -> 0), matching the reference arrow gauge.
    countdown: visible ? 1 - p : 0,
    label: visible ? String(jumper ?? '') : '',
    concealed: concealed === true,
  };
}

// Lifecycle: the marker snapshot lives only during active flight and is
// cleared on landing, cancel, death, or respawn. Returns null when stale.
export function liveJumpMarker(active, snapshot) {
  if (active !== true) return null;
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot;
}
