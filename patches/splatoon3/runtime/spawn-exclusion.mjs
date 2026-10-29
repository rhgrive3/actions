// INKWAVE local rule requested 2026-10-23. Not a retail S3 force-field claim.
// Reuse each level's existing pad/radius and below-pad exception. One opposing
// volume per actor; no actor/world scan, meshes, timer or packet changes.
const SKIN = 0.02, EPS = 1e-9;
const INSTALLED = Symbol.for('inkwave.spawn-exclusion.v1');
const origins = new WeakMap();

export function constrainSpawnPosition(actor, level, player, from = null, physics = null) {
  if (!actor.alive || (actor.team !== 0 && actor.team !== 1)) return false;
  const pad = level?.spawnPads?.[1 - actor.team], radius = level?.spawnBarrier;
  if (!pad || !(radius > 0) || !Number.isFinite(radius)) return false;
  const p = actor.pos, bottom = pad.y - 1, r = radius + player.radius + SKIN;
  if (!Number.isFinite(p.x + p.y + p.z + pad.x + pad.y + pad.z + r)) return false;
  const endX = p.x, endY = p.y, endZ = p.z;
  let nx, nz, x, z;
  // Intersect the movement segment with the horizontal circle only during
  // the part above its lower height. This catches an entire high-speed crossing
  // even if both endpoints lie outside. Vertical launch velocity is untouched.
  if (from && Number.isFinite(from.x + from.y + from.z)) {
    const dx = p.x - from.x, dz = p.z - from.z, dy = p.y - from.y;
    let lo = 0, hi = 1;
    if (dy > 0) { const t0 = (bottom - from.y) / dy; if (t0 > 0) lo = t0; }
    else if (dy < 0) { const t1 = (bottom - from.y) / dy; if (t1 < 1) hi = t1; }
    else if (p.y <= bottom) return false;
    const ox = from.x-pad.x, oz = from.z-pad.z, a = dx*dx+dz*dz;
    if (a > EPS && hi >= lo && hi >= 0 && lo <= 1) {
      const b = ox*dx+oz*dz, c = ox*ox+oz*oz-r*r, disc = b*b-a*c;
      if (disc > 0) {
        const enter = (-b-Math.sqrt(disc))/a, exit = (-b+Math.sqrt(disc))/a;
        const t = lo > enter ? lo : enter;
        if ((enter >= lo-EPS || lo > EPS) && t >= -EPS && t < (hi < exit ? hi : exit)-EPS) {
          // If the actor rises into the column midway through a fast lateral
          // crossing, retain the approach side instead of ejecting it through
          // the far side. A route entirely below the pad remains unrestricted.
          const hitT=enter>=0 ? enter : t;
          const hx = ox+dx*hitT, hz = oz+dz*hitT, d = Math.hypot(hx,hz);
          if (d > EPS) { nx = hx/d; nz = hz/d; }
          else { const length=Math.sqrt(a); nx=-dx/length; nz=-dz/length; }
          // Slide along the contact tangent, never reflect velocity. A tangent
          // half-plane cannot re-enter the circle, even with a large dt.
          const rawIn = (p.x-pad.x)*nx+(p.z-pad.z)*nz-r, inward = rawIn < 0 ? rawIn : 0;
          x = p.x-inward*nx; z = p.z-inward*nz;
        }
      }
    }
  }
  if (x === undefined) {
    if (p.y <= bottom) return false;
    const dx = p.x-pad.x, dz = p.z-pad.z;
    if (dx*dx+dz*dz >= r*r) return false;
    const d = Math.hypot(dx,dz);
    if (d >= r-EPS) return false;
    // Recovery/adoption may start exactly at the centre. Prefer the direction
    // toward the arena/own pad; never divide by zero or leave a centred enemy.
    const own = level.spawnPads[actor.team];
    const fx = d > EPS ? dx : (own?.x-pad.x || 0), fz = d > EPS ? dz : (own?.z-pad.z || (actor.team ? 1 : -1));
    const n = Math.hypot(fx,fz); nx = fx/n; nz = fz/n;
    x = pad.x+nx*r; z = pad.z+nz*r;
  }
  // Use precisely the terrain capsule already used by composed Actor._resolve
  // (#525); PLAYER.radius remains the unchanged spawn-exclusion distance.
  const terrainRadius=(actor.form==='squid' ? player.s3SwimTerrainRadiusRaw : player.s3HumanoidTerrainRadiusRaw) * (player.s3TerrainDistanceScale ?? 1);
  const fits = () => !physics?.bodyFits || physics.bodyFits(p, Number.isFinite(terrainRadius) ? terrainRadius : player.radius,
    actor.form === 'squid' ? player.squidBodyLift : player.stepUp,
    actor.form === 'squid' ? player.squidHeight : player.height, actor.form === 'squid');
  p.x=x; p.z=z;
  if (!fits()) {
    // A previous X/Z with the newly resolved Y is not necessarily clear (e.g.
    // falling beside a raised box). Validate that complete candidate first.
    let found=false;
    if (from && from.y > bottom && Math.hypot(from.x-pad.x,from.z-pad.z) >= r-EPS) {
      const recoverVertical = () => {
        p.y=from.y;
        if (fits()) {
          // Retain the greatest tested vertical progress from the clear full
          // origin. Eight canonical capsule tests bound this rare fallback;
          // do not freeze at an earlier airborne Y or invent a floor height.
          let clear=from.y,blocked=endY;
          for (let i=0;i<8;i++) {
            p.y=(clear+blocked)*.5;
            if (fits()) clear=p.y; else blocked=p.y;
          }
          p.y=clear;
          // Only the vertical component rejected by this world contact stops.
          // Ordinary falling and launching never enter this fallback.
          if (actor.vel.y*(endY-p.y)>0) actor.vel.y=0;
          return true;
        }
        return false;
      };
      // Prefer legal tangent progress. Restoring X/Z before checking the new
      // point at a safe height would pin an actor trying to leave along a ledge.
      found=recoverVertical();
      if (!found) {
        p.x=from.x;p.y=endY;p.z=from.z;
        found=fits() || recoverVertical();
      }
    }
    if (!found) {
      p.y=endY;
      for (let i=1;i<=8;i++) {
        const angle=i*Math.PI/4, cx=nx*Math.cos(angle)-nz*Math.sin(angle), cz=nx*Math.sin(angle)+nz*Math.cos(angle);
        p.x=pad.x+cx*r; p.z=pad.z+cz*r;
        if (fits()) { nx=cx; nz=cz; found=true; break; }
      }
      // No tested outside point fits: keep the native collision owner's full
      // endpoint, never replace it with an unvalidated mixed-height position.
      if (!found) { p.x=endX; p.y=endY; p.z=endZ; return false; }
    }
  }
  const vn=actor.vel.x*nx+actor.vel.z*nz;
  if (vn < 0) { actor.vel.x-=nx*vn; actor.vel.z-=nz*vn; }
  return true;
}

export function installSpawnExclusion(Actor, G, player) {
  const A=Actor.prototype;
  if (Object.hasOwn(A,INSTALLED)) return;
  Object.defineProperty(A,INSTALLED,{value:true});
  const update=A.update, integrate=A._integrate, resolve=A._resolve, finish=A._finishFrame, spawn=A.spawnAt;
  const constrain = a => {
    const from=origins.get(a);
    constrainSpawnPosition(a,G.level,player,a.remote ? null : from,G.physics);
    if (from) { const p=a.pos; from.x=p.x; from.y=p.y; from.z=p.z; }
  };
  const remember = a => {
    let from=origins.get(a);
    if (!from) origins.set(a,from={x:0,y:0,z:0});
    const p=a.pos; from.x=p.x; from.y=p.y; from.z=p.z;
  };
  A.update=function(...args) { remember(this); return update.apply(this,args); };
  A._integrate=function(...args) { remember(this); const result=integrate.apply(this,args); constrain(this); return result; };
  A._resolve=function(...args) { const result=resolve.apply(this,args); constrain(this); return result; };
  // Flight paths and body separation also finish here. Apply before character
  // pose, muzzle/display and grounded Super Jump destination are sampled.
  A._finishFrame=function(...args) { constrain(this); return finish.apply(this,args); };
  A.spawnAt=function(...args) {
    origins.delete(this);
    const result=spawn.apply(this,args); constrain(this); this.character.root.position.copy(this.pos); return result;
  };
}
