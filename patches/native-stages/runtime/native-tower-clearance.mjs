/** Conservative swept volume: every deck yaw and every human center on the
 * deck fit inside it, including the live capsule and the existing tower pole.
 * Exact triangle/box SAT checks keep thin ceilings and mid-edge obstructions.
 * This is local inferred placement, never a recovered retail tower trajectory. */
export function nativeTowerClearance(level,actorBody,halfSize=1.2){
 if(!level?.triangleWorld||!Number.isFinite(actorBody?.radius)||!Number.isFinite(actorBody?.height))throw Error('Native tower clearance requires live source/capsule geometry');
 const radius=Math.SQRT2*halfSize+actorBody.radius+.02;
 const height=Math.max(actorBody.height,2.01)+.02;
 const world=level.triangleWorld,box=world._box.clone(),metrics={queries:0,triangleTests:0};
 const clear=(a,b=a)=>{
  box.min.set(Math.min(a[0],b[0])-radius,Math.min(a[1],b[1])-.25,Math.min(a[2],b[2])-radius);
  box.max.set(Math.max(a[0],b[0])+radius,Math.max(a[1],b[1])+height,Math.max(a[2],b[2])+radius);
  metrics.queries++;let fits=true;
  world.queryBox(box.min,box.max,id=>{if(!fits)return;metrics.triangleTests++;if(box.intersectsTriangle(world.triangle(id)))fits=false;});
  return fits;
 };
 return {clear,metrics,radius,height,halfSize,assurance:'Conservative source-triangle swept deck, pole and live human-capsule envelope; local inference; retail trajectory/lift unverified'};
}
