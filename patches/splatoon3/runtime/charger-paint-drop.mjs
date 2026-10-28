// Shared native/catalogue Charger falling-paint lease. This is the established
// Splat Charger 20-world-unit gravity model, not a recovered Nintendo law.
// The native Projectiles owner advances, draws and retires these exact records.
export function queueChargerPaintDrop(system, { from, hit, radius, depth, direction, owner, team, seed, waterY }) {
  if (!system.chargerDrops || !owner || owner.remote || !(radius > 0)) return null;
  const V = from.constructor;
  const drop = system.chargerDropPool.pop() || {
    pos:new V(), start:new V(), target:new V(), normal:new V(), direction:new V(),
  };
  drop.start.copy(from); drop.pos.copy(from);
  drop.landed = !!hit?.hit;
  if (drop.landed) {
    drop.target.copy(hit.point); drop.normal.copy(hit.normal); drop.face=hit.face;
  } else {
    drop.target.copy(from).setY(waterY-1.8); drop.normal.set(0,1,0); drop.face=-1;
  }
  drop.direction.copy(direction).addScaledVector(drop.normal,-direction.dot(drop.normal));
  if (drop.direction.lengthSq()<1e-8) drop.direction.set(1,0,0);
  else drop.direction.normalize();
  drop.stretchAmt=Math.max(0,depth/radius-1)*1.6;
  drop.shift=radius*drop.stretchAmt*.375;
  drop.age=0;
  drop.life=Math.max(.05,Math.sqrt(Math.max(0,2*(from.y-drop.target.y)/20)));
  drop.radius=radius; drop.owner=owner; drop.team=team; drop.seed=seed;
  system.chargerDrops.push(drop);
  return drop;
}
