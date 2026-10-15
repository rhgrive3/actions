// Independent tie oracle: the frozen ray visits the original BVH first. Replay
// just its visited triangles in descending source ID order through one leaf.
// This preserves its exact broad-phase boundary exclusions while making its
// existing last-equal-hit rule select the smallest original triangle ID.
export function canonicalRayOracleData(data, visited = data.order) {
 const order=Uint32Array.from([...new Set(visited)].sort((a,b)=>b-a));
 const nodes=new Float32Array(8);nodes.set(data.nodes.subarray(0,6));nodes[6]=-1;nodes[7]=order.length;
 return {...data,triangles:data.triangles,normals:data.normals,flags:data.flags,objectIds:data.objectIds,nodes,order};
}
export function traceSourceRay(world) {
 const visited=[];world.order=new Proxy(world.order,{get(target,key){const value=Reflect.get(target,key,target);if(typeof key==='string'&&/^\d+$/.test(key))visited.push(value);return value;}});
 return visited;
}
export function canonicalSourceRay(world, OldWorld, origin, dir, far, options) {
 const order=world.order,visited=traceSourceRay(world);
 try {
  const hit=world.ray(origin,dir,far,options);
  return hit&&typeof hit==='object'&&Number.isFinite(hit.distance)
   ?new OldWorld(canonicalRayOracleData(world,visited)).ray(origin,dir,far,options):hit;
 } finally {world.order=order;}
}
// Keep the frozen solver and all original geometry. Only the explicit source-ID
// ordering policy is supplied to the independent before implementation.
export function canonicalizeContactReference(pair, OldWorld) {
 const world=pair.world,query=world.queryBox,ray=world.ray;
 world.queryBox=function(min,max,fn){const ids=[];query.call(this,min,max,id=>ids.push(id));ids.sort((a,b)=>a-b).forEach(fn);};
 world.ray=function(origin,dir,far,options){
  const delegate=Object.create(this);delegate.ray=ray;
  return canonicalSourceRay(delegate,OldWorld,origin,dir,far,options);
 };
 return pair;
}
