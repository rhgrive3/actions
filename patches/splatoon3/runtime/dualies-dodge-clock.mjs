// Presentation clock for an already accepted Dualies action. The network event
// time is the action origin; owner snapshots only calibrate its millisecond
// wire precision and validate the action identity.
import { STEP } from './clock.mjs';

export const DUALIES_DODGE_STARTUP_SECONDS = 4 / 60;

function validIdentity(value) {
  return value && typeof value.owner === 'string'
    && Number.isSafeInteger(value.life) && value.life >= 0
    && Number.isSafeInteger(value.token) && value.token > 0
    && Number.isFinite(value.teleport) && value.teleport >= 0
    && Number.isFinite(value.epoch) && Number.isFinite(value.sampleTime)
    && Number.isFinite(value.duration) && value.duration > 0
    && Number.isFinite(value.offset);
}

function phaseAge(phase, time) {
  if (!Number.isFinite(time) || time < 0) return null;
  if (phase === 'startup') return time;
  if (phase === 'roll') return DUALIES_DODGE_STARTUP_SECONDS + time;
  return null;
}

function validSample(sample) {
  return sample && typeof sample.owner === 'string'
    && Number.isSafeInteger(sample.life) && sample.life >= 0
    && Number.isSafeInteger(sample.token) && sample.token > 0
    && Number.isFinite(sample.teleport) && sample.teleport >= 0
    && Number.isFinite(sample.sampleTime) && Number.isFinite(sample.time)
    && Number.isFinite(sample.dur) && sample.dur > 0
    && phaseAge(sample.phase, sample.time) !== null;
}

// Use the first accepted owner sample at or after the trigger. A life or
// teleport transition across the event time makes that trigger ineligible.
export function sampleForAcceptedDodgeEvent(buffer, eventTime) {
  if (!Array.isArray(buffer) || !Number.isFinite(eventTime)) return null;
  let before = null, after = null;
  for (const sample of buffer) {
    if (!sample || !Number.isFinite(sample.t)) continue;
    if (sample.t <= eventTime && (!before || sample.t > before.t)) before = sample;
    if (sample.t >= eventTime && (!after || sample.t < after.t)) after = sample;
  }
  if (!after || before && ((before.life ?? 0) !== (after.life ?? 0) || before.tp !== after.tp)) return null;
  return after;
}

export function acceptDodgeEpoch(previous, incoming) {
  if (!incoming || typeof incoming.owner !== 'string'
    || !Number.isSafeInteger(incoming.life) || incoming.life < 0
    || !Number.isSafeInteger(incoming.token) || incoming.token < 1
    || !Number.isFinite(incoming.teleport) || incoming.teleport < 0
    || !Number.isFinite(incoming.epoch) || !Number.isFinite(incoming.sampleTime)
    || !Number.isFinite(incoming.duration) || incoming.duration <= 0
    || !Number.isFinite(incoming.time) || incoming.time < 0) return previous || null;
  const age = phaseAge(incoming.phase, incoming.time);
  if (age === null || incoming.epoch > incoming.sampleTime + 0.001) return previous || null;
  if (validIdentity(previous) && previous.owner === incoming.owner
    && incoming.epoch < previous.epoch) return previous;
  if (validIdentity(previous)
    && previous.owner === incoming.owner
    && previous.life === incoming.life
    && previous.teleport === incoming.teleport) {
    if (incoming.token <= previous.token || incoming.epoch < previous.epoch) return previous;
  }
  return { owner: incoming.owner, life: incoming.life, token: incoming.token,
    teleport: incoming.teleport, epoch: incoming.epoch, sampleTime: incoming.sampleTime,
    phase: incoming.phase, duration: incoming.duration,
    offset: age - (incoming.sampleTime - incoming.epoch) };
}

// Recalibrate only from a newer accepted owner sample for this exact action.
// Duplicate and out-of-order samples cannot restart its clock.
export function calibrateDodgeEpoch(previous, sample) {
  if (!validIdentity(previous) || !validSample(sample)) return previous || null;
  if (sample.owner !== previous.owner || sample.life !== previous.life
    || sample.teleport !== previous.teleport || sample.token !== previous.token) return null;
  if (sample.sampleTime <= previous.sampleTime) return previous;
  const age = phaseAge(sample.phase, sample.time);
  const previousAge = previous.sampleTime - previous.epoch + previous.offset;
  if (age + 1e-10 < previousAge || Math.abs(sample.dur - previous.duration) > 0.001) return previous;
  return { ...previous, sampleTime: sample.sampleTime, phase: sample.phase,
    offset: age - (sample.sampleTime - previous.epoch) };
}

export function dodgeClockAt(epoch, playbackTime, duration = epoch?.duration) {
  if (!validIdentity(epoch) || !Number.isFinite(playbackTime)
    || !Number.isFinite(duration) || duration <= 0) return null;
  const elapsed = Math.max(0, playbackTime - epoch.epoch + epoch.offset);
  const age = Math.round(elapsed / STEP) * STEP;
  if (age < DUALIES_DODGE_STARTUP_SECONDS) return {
    t: 0, dur: duration,
    startup: DUALIES_DODGE_STARTUP_SECONDS - age,
    startupDur: DUALIES_DODGE_STARTUP_SECONDS,
  };
  return { t: Math.min(duration, age - DUALIES_DODGE_STARTUP_SECONDS), dur: duration,
    startup: 0, startupDur: 0 };
}
