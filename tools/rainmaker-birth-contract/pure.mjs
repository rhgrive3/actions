// Experimental only: not imported by the production build.
// A world matrix is a sampled pose, NOT a client-authorized shot origin.
const vec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const copy = v => v.slice();
export const LOCAL_SOCKET = Object.freeze([0, -.056, .899]);

export function socketFromMatrix(elements, local = LOCAL_SOCKET) {
  if (!Array.isArray(elements) || elements.length !== 16 || !elements.every(Number.isFinite) ||
      !vec(local) || elements[3] !== 0 || elements[7] !== 0 || elements[11] !== 0 || elements[15] !== 1)
    throw new Error('finite affine column-major matrix required');
  const [x,y,z] = local;
  const out = [0,1,2].map(i => elements[i]*x + elements[i+4]*y + elements[i+8]*z + elements[i+12]);
  if (!vec(out)) throw new Error('nonfinite socket');
  return out;
}

// The authority supplies the frozen event anchor and a same-tick pose socket.
// sweep must report the earliest solid/defense hit on the COMPLETE bridge.
// Null means explicitly clear; absent/malformed evidence fails closed.
// Hit point remains on the body-facing surface; no invented clearance constant.
export function resolveBirth({ anchor, socket, eventTick, poseTick, sweep }) {
  if (!vec(anchor) || !vec(socket) || !Number.isSafeInteger(eventTick) || eventTick < 0 ||
      poseTick !== eventTick || typeof sweep !== 'function') throw new Error('invalid or stale birth evidence');
  const start = copy(anchor), end = copy(socket);
  const result = sweep(copy(start), copy(end));
  let birth = end, blocked = false;
  if (result !== null) {
    if (!result || !Number.isFinite(result.fraction) || result.fraction < 0 || result.fraction > 1)
      throw new Error('explicit clear or earliest-hit fraction required');
    birth = start.map((v,i) => v + (end[i]-v)*result.fraction);
    blocked = true;
  }
  if (!vec(birth)) throw new Error('nonfinite birth');
  // NEVER reset the range reference to the forward-shifted visual socket.
  return { birth, rangeAnchor: start, blocked };
}
export function horizontalRangeUsed(position, rangeAnchor) {
  if (!vec(position) || !vec(rangeAnchor)) throw new Error('invalid range');
  return Math.hypot(position[0]-rangeAnchor[0], position[2]-rangeAnchor[2]);
}
