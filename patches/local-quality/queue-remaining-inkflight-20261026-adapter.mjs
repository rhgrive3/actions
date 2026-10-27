// Presentation and per-segment reuse only. The pinned source stays immutable.
const MARKER = '// Remaining InkFlight queue 20261026\n';
function once(code, before, after, label) {
  const count = code.split(before).length - 1;
  if (count !== 1) throw new Error(`Remaining InkFlight ${label}: expected 1 anchor, got ${count}`);
  return code.replace(before, after);
}

export function adaptRemainingInkFlight20261026(rel, code) {
  if (rel !== 'src/game/inkFlightRuntime.js' || code.includes(MARKER)) return code;
  code = once(code,
    '    const plan = p.inkPlan, end = p.inkTravel + length * stop;\n    while',
    '    const plan = p.inkPlan, end = p.inkTravel + length * stop;\n    let headingReady = false, headingX, headingZ;\n    while',
    'call-local lazy planar heading');
  code = once(code,
    '      this.spawnDrop(p, this.point, p.inkSpawned, p.inkBirth + previousAge + fraction * INK_DT);',
    `      // Tracers and overridden birth methods may synchronously edit the
      // head or reenter this segment. They keep the original per-birth math.
      if (this.trace == null && this.spawnDrop === sourceHeadingSpawnDrop) {
        if (!headingReady) {
          const h = Math.hypot(p.vel.x, p.vel.z);
          headingX = h > EPS ? p.vel.x / h : 0;
          headingZ = h > EPS ? p.vel.z / h : 1;
          headingReady = true;
        }
        this.spawnDrop(p, this.point, p.inkSpawned, p.inkBirth + previousAge + fraction * INK_DT, headingX, headingZ);
      } else {
        headingReady = false;
        this.spawnDrop(p, this.point, p.inkSpawned, p.inkBirth + previousAge + fraction * INK_DT);
      }`,
    'trace-safe shared heading');
  code = once(code,
    '  spawnDrop(head, at, index, birth) {',
    '  spawnDrop(head, at, index, birth, headingX, headingZ) {',
    'optional scalar heading');
  code = once(code,
    '    const seed = seededUnit(head.seed, 37 + index), h = Math.hypot(head.vel.x, head.vel.z);\n    const fx = h > EPS ? head.vel.x / h : 0, fz = h > EPS ? head.vel.z / h : 1;',
    `    const seed = seededUnit(head.seed, 37 + index);
    let fx = headingX, fz = headingZ;
    if (fx === undefined) {
      const h = Math.hypot(head.vel.x, head.vel.z);
      fx = h > EPS ? head.vel.x / h : 0; fz = h > EPS ? head.vel.z / h : 1;
    }`,
    'direct birth keeps original heading fallback');
  code = once(code,
    'p.birth = birth; p.age = 0; p.frame = 0; p.startY = at.y;',
    'p.birth = birth; p.age = 0; p.frame = 0; p.startY = at.y; p._inkDrawValid = false;',
    'invalidate every pooled birth');
  code = once(code,
    '    this.pool.push(...this.drops); this.drops.length = 0; this.time = 0;',
    '    for (const p of this.drops) p._inkDrawValid = false;\n    this.pool.push(...this.drops); this.drops.length = 0; this.time = 0;',
    'clear invalidates active visual leases');
  code = once(code,
    '      const speed = p.vel.length(); this.normal.copy(p.vel).multiplyScalar(1 / Math.max(EPS, speed));\n      if (speed < EPS) this.normal.copy(Z);\n      this.rotation.setFromUnitVectors(Z, this.normal);',
    `      const same = p._inkDrawValid && p._inkDrawFrame === p.frame &&
        Object.is(p._inkDrawX, p.vel.x) && Object.is(p._inkDrawY, p.vel.y) && Object.is(p._inkDrawZ, p.vel.z);
      const speed = same ? p._inkDrawSpeed : p.vel.length();
      // Keep the public runtime scratch normal current even on cache hits.
      this.normal.copy(p.vel).multiplyScalar(1 / Math.max(EPS, speed));
      if (speed < EPS) this.normal.copy(Z);
      if (same) this.rotation.set(p._inkDrawQx, p._inkDrawQy, p._inkDrawQz, p._inkDrawQw);
      else {
        this.rotation.setFromUnitVectors(Z, this.normal);
        p._inkDrawFrame = p.frame; p._inkDrawX = p.vel.x; p._inkDrawY = p.vel.y; p._inkDrawZ = p.vel.z;
        p._inkDrawSpeed = speed;
        p._inkDrawQx = this.rotation.x; p._inkDrawQy = this.rotation.y;
        p._inkDrawQz = this.rotation.z; p._inkDrawQw = this.rotation.w; p._inkDrawValid = true;
      }`,
    'reuse orientation within unchanged fixed tick');
  return MARKER + code + '\nconst sourceHeadingSpawnDrop = InkFlightRuntime.prototype.spawnDrop;\n';
}
