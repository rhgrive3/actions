/** Restrict the existing paint-goal policy to directed reachable source nodes.
 * The original global undirected set can pick unreachable heights every frame. */
export function nativePaintGoalIds(brain,G){
 const nav=G.nav,a=brain.a,start=nav.nearest(a.pos,1.2);
 if(start<0)return [];
 const cached=brain._nativeGoalIds;
 if(cached?.nav===nav&&cached.start===start&&cached.team===a.team)return cached.ids;
 const nodes=nav.nodes,valid=nav.valid,enemyZone=1-a.team,px=a.pos.x,pz=a.pos.z;
 let work=nav._nativePaintGoalWork;
 if(!work||work.seen.length!==nodes.length)work=nav._nativePaintGoalWork={seen:new Uint32Array(nodes.length),queue:[],stamp:0};
 const {seen,queue}=work,ids=[];queue.length=0;queue.push(start);
 let stamp=work.stamp=(work.stamp+1)>>>0;if(!stamp){seen.fill(0);stamp=work.stamp=1;}seen[start]=stamp;
 for(let i=0;i<queue.length;i++){
  const n=nodes[queue[i]];
  if(n.zone<0&&n.nativePaintable){
   const dx=n.x-px,dz=n.z-pz;
   // Keep the original circular test at its boundary. Most reachable nodes
   // on a large source stage lie outside even this enclosing square.
   if(!(dx< -34||dx>34||dz< -34||dz>34)&&Math.hypot(dx,dz)<=34)ids.push(n.id);
  }
  const nb=n.nb;
  for(let j=0;j<nb.length;j++){const nextId=nb[j].to;if(seen[nextId]===stamp||!valid[nextId])continue;const next=nodes[nextId];if(next.zone===enemyZone)continue;seen[nextId]=stamp;queue.push(nextId);}
 }
 queue.length=0;
 brain._nativeGoalIds={nav,start,team:a.team,ids};return ids;
}
