import { cancelStormPendingInput } from './storm-effects.mjs';
// Host Turf coverage belongs to the deadline, before state listeners and the
// remainder of the simulation tick can advance paint. Presentation may continue.
export function captureTurfFinish(match, nextState, paint) {
  if (nextState === 'intro' || nextState === 'playing') match.s3FinishCoverage = null;
  if (nextState !== 'finish' || match.state !== 'playing' || match.bossMode) return;
  if (!match.follower) {
    const coverage = paint.coverage();
    match.s3FinishCoverage = Object.freeze([coverage[0], coverage[1]]);
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
// A follower's local zero blocks new local commands while the host retains
// finish/result authority. Existing remote replay and projectiles keep running.
export function blockExpiredGuestInput(match) {
  const scoped = match.follower === true && match.mode === 'turf' && !match.attract && match.state === 'playing';
  const expired = scoped && Number.isFinite(match.time) && match.time <= 0;
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
