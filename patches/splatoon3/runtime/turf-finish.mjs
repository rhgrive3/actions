import { cancelStormPendingInput } from './storm-effects.mjs';
// Host Turf coverage belongs to the deadline, after its final legal simulation
// interval but before state listeners or finish presentation can advance paint.
export function validFinishCoverage(value) {
  return Array.isArray(value) && value.length === 2
    && value.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
}
export function validFinishMapDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/png;base64,') && value.length <= 1500000;
}
export function captureFinishMapSnapshot(match, minimap) {
  if (!minimap || typeof minimap.update !== 'function') return null;
  try {
    let passes = 0;
    while (minimap._band > 0 && passes < 8) { minimap.update(0, true); passes++; }
    if (minimap._band > 0) return null;
    minimap.update(0, true);
    const data = minimap.canvas?.toDataURL?.('image/png');
    if (!validFinishMapDataUrl(data)) return null;
    match.s3FinishMapDataUrl = data;
    return data;
  } catch { return null; }
}
export function captureTurfFinish(match, nextState, paint, netm = null, minimap = null) {
  if (nextState === 'intro' || nextState === 'playing') {
    match.s3FinishCoverage = null;
    match.s3FinishMapDataUrl = null;
  }
  if (nextState !== 'finish' || match.state !== 'playing' || match.bossMode) return;
  if (!match.follower) {
    netm?.commitDeadlinePaint?.();
    const coverage = paint.coverage();
    match.s3FinishCoverage = Object.freeze([coverage[0], coverage[1]]);
    captureFinishMapSnapshot(match, minimap);
  }
  // Retire held/pending offensive state before neutral levels can become releases.
  match.local?.weaponRunner?.cancelPendingInput?.();
  neutralizeTurfInput(match);
}

export function neutralizeTurfInput(match) {
  const actor = match.local;
  if (!actor) return;
  actor.intent?.move?.set(0, 0, 0);
  // Clear both sides of edge detection: clearing a held sub alone would invent
  // a release and throw a bomb in the first finish Actor update.
  for (const state of [actor.intent, actor._prevIntent]) if (state)
    for (const key of ['fire', 'squid', 'sub', 'jump', 'special']) state[key] = false;
  actor.fireBuffer = 0; actor.jumpBuffer = 0;
}

// Existing physical command channels must return neutral before a positive host
// correction can turn them into new actions. Menu/camera-only input is independent.
const runnerTokens = new WeakMap();
const keys = ['Space','ShiftLeft','ShiftRight','KeyE','KeyF','KeyQ','Tab','KeyM','Digit1','Digit2','Digit3','Digit4'];
const buttons = [0,3,5,8,11,12,13,14,15];
const touchActions = ['fire','sub','special','jump','squid','map'];
function pendingTouchEdge(touch, key) {
  for (const edge of touch?._pendingEdges || []) if (edge.id === key) return true;
  return false;
}
function pendingGameplayInput(input) {
  if (!input) return false;
  const touch = input.mobile;
  return !!(input.mouse?.left || input.mouse?.right || input.mouse?.leftPressed || input.mouse?.rightPressed ||
    keys.some(key => input.down?.(key) || input.pressed?.has(key)) ||
    buttons.some(i => input.padButton?.(i) || input.padPressed?.has(i)) ||
    input.padValue?.(6) > .3 || input.padValue?.(7) > .3 || input.padPressed?.has(6) || input.padPressed?.has(7) ||
    touchActions.some(key => touch?.down?.(key) || touch?.pressed?.has(key) || pendingTouchEdge(touch, key)));
}
// #838: the host's clock message is a remaining-time sample that was true when the
// host sent it. Its delivery delay is approximated by the relay round trip (ms,
// smoothed; host leg assumed symmetric with this client's leg, unmeasured). Storing
// remaining - delay gives a host-authoritative end that a guest whose local clock
// lags can reach before its own zero. Only the input gate reads it; time is untouched.
const MAX_HOST_DEADLINE_LATENCY = 0.5;
export function recordHostDeadline(match, hostRemaining, rttMs) {
  if (!match || !Number.isFinite(hostRemaining)) return;
  const rtt = Number.isFinite(rttMs) ? rttMs / 1000 : 0;
  const latency = Math.min(MAX_HOST_DEADLINE_LATENCY, Math.max(0, rtt));
  match.s3HostDeadline = { left: hostRemaining - latency };
}
// A follower's local zero blocks new local commands while the host retains
// finish/result authority. Existing remote replay and projectiles keep running.
// `dt` is supplied only by the per-tick controller call, so the host deadline ages once per tick.
export function blockExpiredGuestInput(match, dt = 0) {
  const scoped = match.follower === true && match.mode === 'turf' && !match.attract && match.state === 'playing';
  if (!scoped) match.s3HostDeadline = null;
  const deadline = match.s3HostDeadline;
  if (deadline && scoped && dt > 0 && !match.paused) deadline.left -= dt;
  const hostExpired = scoped && !!deadline && deadline.left <= 0;
  const expired = scoped && ((Number.isFinite(match.time) && match.time <= 0) || hostExpired);
  const waitingNeutral = !expired && scoped && !!match.s3GuestDeadlineInput && pendingGameplayInput(match.controller?.input);
  if (!expired && !waitingNeutral) { match.s3GuestDeadlineInput = null; return false; }
  neutralizeTurfInput(match);
  if (match.local) cancelStormPendingInput(match.local);
  const runner = match.local?.weaponRunner;
  if (runner && !runnerTokens.has(runner)) runnerTokens.set(runner, Symbol('guest-input'));
  const token = runner && runnerTokens.get(runner);
  if (token && match.s3GuestDeadlineInput !== token) {
    match.s3GuestDeadlineInput = token;
    runner.cancelPendingInput?.();
  }
  const controller = match.controller;
  if (controller) {
    controller.enabled = false; controller.navigationEnabled = false;
    controller.clearRespawnNavigation?.();
    controller.input?.mobile?.gyro?.discard?.();
  }
  return true;
}

// #980: Match owns the clock, but Projectiles advances outside Match.update.
// Only the fixed-step orchestrator may defer this transition; direct Match users
// retain the historical synchronous boundary (catalog/native integrations).
export function requestTurfFinish(match) {
  if (match.s3DeadlineStep && !match.bossMode) match.s3FinishPending = true;
  else match.setState('finish');
}
export function simulateMatchInterval(match, dt, G) {
  const advance = (span, controller = true) => {
    if (!(span > 0)) return;
    if (controller) { match.updateController(span); match.controller?.computeAim?.(); }
    match.update(span);
    if (!match.paused) G.projectiles.update(span);
  };
  const turf = !match.bossMode && !match.attract && (match.mode == null || match.mode === 'turf');
  const boundary = turf && !match.paused && match.state === 'playing'
    && Number.isFinite(match.time) && match.time <= dt + 1e-10;
  if (!boundary) { advance(dt); return; }
  const legal = Math.max(0, Math.min(dt, match.time));
  const endTime = G.time;
  // Preserve endpoint timestamps for both fractions of this fixed-clock step.
  G.time = endTime - dt + legal;
  match.s3DeadlineStep = true;
  try { advance(legal); }
  finally { match.s3DeadlineStep = false; }
  // Floating-point subtraction can leave a sub-epsilon remainder at 180 s.
  match.time = 0;
  if (!match.follower && match.state === 'playing') match.setState('finish');
  else if (match.follower) blockExpiredGuestInput(match);
  match.s3FinishPending = false;
  G.time = endTime;
  // Visual effects may use the remainder; score and combat authority have ended.
  advance(Math.max(0, dt - legal), false);
}
