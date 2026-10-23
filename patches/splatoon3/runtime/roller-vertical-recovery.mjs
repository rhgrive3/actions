// A landing / ZR edge can change the recovery destination at the same attack
// time. Preserve the old target and its velocity, then remove that correction
// within the already authored return window. No runner clock is written here.
// This is an INKWAVE continuity repair, not a recovered retail animation track.
const channels = ['anchor', 'rotation', 'weight', 'coil', 'whip'];
function values(p) { return [...p.anchor, ...p.rotation, p.weight, p.coil, p.whip]; }
function correct(p, transition, time) {
  if (!transition || time >= transition.end) return p;
  const duration = transition.end - transition.start;
  const u = Math.max(0, (time - transition.start) / duration), u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u;
  let i = 0;
  for (const key of channels) {
    if (Array.isArray(p[key])) {
      for (let j = 0; j < p[key].length; j++, i++)
        p[key][j] += h00 * transition.offset[i] + h10 * duration * transition.velocity[i];
    } else {
      p[key] += h00 * transition.offset[i] + h10 * duration * transition.velocity[i]; i++;
    }
  }
  return p;
}
export function createVerticalRecoverySampler(sample, returnSeconds, endTime) {
  const owners = new WeakMap();
  const pose = (a, t, held) => sample(t, a.windup, a.swingInterval ?? a.interval, a.swingShape, held);
  function read(owner, attack) {
    const t = attack.elapsed, held = attack.holdRoll === true;
    let m = owners.get(owner);
    // New attacks, reset/reuse, and changed source timing start with a clean
    // destination. In particular no old correction leaks into another swing.
    const signature = [attack.windup, attack.swingInterval ?? attack.interval, attack.swingShape].join(':');
    if (!m || m.attack !== attack || t < m.time || signature !== m.signature) {
      m = { attack, signature, time: t, held, transition: null }; owners.set(owner, m);
    }
    if (held !== m.held && t > attack.windup && t < endTime(attack)) {
      const end = Math.min(endTime(attack), t + returnSeconds);
      // Derivatives are sampled only on destination changes, from the same
      // authored curves (and any in-flight correction), never display-frame dt.
      const h = Math.min(1e-5, (end - t) / 4, (t - attack.windup) / 4);
      const old = time => correct(pose(attack, time, m.held), m.transition, time);
      const before = values(old(t)), next = values(pose(attack, t, held));
      const left = values(old(t - h)), right = values(old(t + h));
      const nextLeft = values(pose(attack, t - h, held)), nextRight = values(pose(attack, t + h, held));
      m.transition = { start: t, end, offset: before.map((v, i) => v - next[i]),
        velocity: right.map((v, i) => ((v - left[i]) - (nextRight[i] - nextLeft[i])) / (2 * h)) };
    } else if (t <= attack.windup) m.transition = null;
    m.held = held; m.time = t;
    if (m.transition && t >= m.transition.end) m.transition = null;
    return correct(pose(attack, t, held), m.transition, t);
  }
  read.clear = owner => owners.delete(owner);
  return read;
}
