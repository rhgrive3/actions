// Independent tie oracle: the frozen ray visits the original BVH first. Replay
// just its visited triangles in descending source ID order through one leaf.
// This preserves its exact broad-phase boundary exclusions while making its
// existing last-equal-hit rule select the smallest original triangle ID.
export function canonicalRayOracleData(data, visited = data.order) {
 const order=Uint32Array.from([...new Set(visited)].sort((a,b)=>b-a));
 const nodes=new Float32Array(8);nodes.set(data.nodes.subarray(0,6));nodes[6]=-1;nodes[7]=order.length;
 return {...data,nodes,order};
}
export function traceSourceRay(world) {
 const visited=[];world.order=new Proxy(world.order,{get(target,key){const value=Reflect.get(target,key,target);if(typeof key==='string'&&/^\d+$/.test(key))visited.push(value);return value;}});
 return visited;
}
