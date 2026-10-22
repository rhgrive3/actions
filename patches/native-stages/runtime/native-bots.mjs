/** Restrict the existing paint-goal policy to directed reachable source nodes.
 * The original global undirected set can pick unreachable heights every frame. */
export function nativePaintGoalIds(brain,G){
 const nav=G.nav,a=brain.a,start=nav.nearest(a.pos,1.2);
 if(start<0)return [];
 const cached=brain._nativeGoalIds;
 if(cached?.nav===nav&&cached.start===start&&cached.team===a.team)return cached.ids;
 let work=nav._nativePaintGoalWork;
 if(!work||work.seen.length!==nav.nodes.length)work=nav._nativePaintGoalWork={seen:new Uint32Array(nav.nodes.length),queue:[],stamp:0};
 const {seen,queue}=work,ids=[];queue.length=0;queue.push(start);
 let stamp=work.stamp=(work.stamp+1)>>>0;if(!stamp){seen.fill(0);stamp=work.stamp=1;}seen[start]=stamp;
 for(let i=0;i<queue.length;i++){
  const n=nav.nodes[queue[i]];
  if(n.zone<0&&n.nativePaintable&&Math.hypot(n.x-a.pos.x,n.z-a.pos.z)<=34)ids.push(n.id);
  for(const edge of n.nb){const next=nav.nodes[edge.to];if(seen[next.id]===stamp||!nav.valid[next.id]||next.zone===1-a.team)continue;seen[next.id]=stamp;queue.push(next.id);}
 }
 queue.length=0;
 brain._nativeGoalIds={nav,start,team:a.team,ids};return ids;
}
