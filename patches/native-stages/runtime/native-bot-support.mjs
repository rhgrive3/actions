/** Source-drop routes require the actual raised support before a bot turns
 * toward its next waypoint. Ordinary stage followers keep their old policy. */
export function nativeSourceWaypointReached(G,actor,node){
 if(!G.level?.manifest?.sourceNavigation?.highDrops)return true;
 if(!G.level.native)return false;
 if(!actor.grounded||Math.abs(node.y-actor.pos.y)>.16||Math.hypot(node.x-actor.pos.x,node.z-actor.pos.z)>.18)return false;
 const down=actor.pos.clone().set(0,-1,0),origin=actor.pos.clone().setY(actor.pos.y+.1),hit=G.physics.raycast(origin,down,.3);
 return !!(hit.hit&&hit.triangle>=0&&hit.normal.y>.68&&Math.abs(hit.point.y-node.y)<.16);
}
