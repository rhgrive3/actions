// Host-only ranked objective pose admission. Cosmetic interpolation is unchanged.
// This is a plausibility gate, not a fully authoritative server movement simulator.
const ALIVE = 1, GROUNDED = 16, SJ_CHARGE = 16384, SJ_FLIGHT = 32768;
const finite = Number.isFinite;
const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

export function objectiveSpecialFor(actor, command) {
  return actor?.specialActive?.id ?? command?.special ?? null;
}
export function admitRankedPose(state, row, actor, ts, world) {
  if (!state || !Array.isArray(row) || row.length < 21 || !finite(ts) ||
      !row.slice(1,4).every(finite) || !Number.isSafeInteger(row[10]) ||
      !Number.isSafeInteger(row[16]) || row[16] < 0) return false;
  const next = [row[1],row[2],row[3]], flags = row[10], prev = state.last;
  if (flags & GROUNDED) {
    const floor = world?.floorAt?.(next[0], next[2], next[1] + 1.8);
    if (finite(floor) && Math.abs(next[1] - floor) > 2.5) return false;
  }
  if (!prev) {
    const spawn = actor?.pos;
    if (!spawn || ![spawn.x,spawn.y,spawn.z].every(finite) ||
        dist(next, [spawn.x,spawn.y,spawn.z]) > 15) return false;
  } else {
    const elapsed = ts - prev.t;
    if (!finite(elapsed) || elapsed <= 0) return false;
    if (row[16] !== prev.tp) {
      const respawn = !(prev.flags & ALIVE) && !!(flags & ALIVE);
      const jump = state.jumpSince !== undefined && ts - state.jumpSince >= .25 &&
        !!((prev.flags | flags) & (SJ_CHARGE | SJ_FLIGHT));
      if (row[16] !== prev.tp + 1 || !(respawn || jump)) return false;
    } else {
      const dt = Math.min(.35, elapsed);
      const dx = next[0]-prev.pos[0], dz = next[2]-prev.pos[2];
      if (Math.hypot(dx,dz) > 1 + 18 * dt || Math.abs(next[1]-prev.pos[1]) > 2.5 + 19 * dt) return false;
      if (Math.hypot(dx,dz) > 1.5 && world?.blocked?.(
        [prev.pos[0],prev.pos[1]+.8,prev.pos[2]], [next[0],next[1]+.8,next[2]])) return false;
    }
  }
  if ((flags & (SJ_CHARGE | SJ_FLIGHT)) && state.jumpSince === undefined) state.jumpSince = ts;
  if (!(flags & (SJ_CHARGE | SJ_FLIGHT))) state.jumpSince = undefined;
  state.last = {pos:next,t:ts,tp:row[16],flags};
  return true;
}

// One input edge belongs to the native actor/life/session that admitted it.
// Keep object capabilities out of snapshots and debug JSON.
const inputOwners = new WeakMap();
export function bindRankedInput(input, actor, match, nm) {
  const life=actor?.net?.lastLife;
  if (!input || typeof input!=='object' || !actor || typeof actor.owner!=='string' || !actor.owner || !match || !nm?.s || nm.match!==match ||
      !Number.isSafeInteger(life) || life<0) return null;
  inputOwners.set(input,{actor,match,session:nm.s,owner:actor.owner,life,matchId:nm.cfg?.id});
  return input;
}
export function rankedInputFor(input, actor, match, nm) {
  const own=input&&inputOwners.get(input);
  if (own && nm?.s && nm.match===match && own.actor===actor && own.match===match &&
      own.session===nm.s && own.owner===actor?.owner && own.life===actor?.net?.lastLife &&
      own.matchId===nm.cfg?.id) return input;
  if (own) inputOwners.delete(input); // Observed epoch retirement cannot revive.
  return null;
}
