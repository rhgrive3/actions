/** Restrict the existing paint-goal policy to directed reachable source nodes.
 * The original global undirected set can pick unreachable heights every frame. */
export function nativePaintGoalIds(brain,G){
 const nav=G.nav,a=brain.a,start=nav.nearest(a.pos,1.2);
 if(start<0)return [];
 const cached=brain._nativeGoalIds;
 if(cached?.nav===nav&&cached.start===start&&cached.team===a.team)return cached.ids;
 const seen=new Uint8Array(nav.nodes.length),queue=[start],ids=[];seen[start]=1;
 for(let i=0;i<queue.length;i++){
  const n=nav.nodes[queue[i]],distance=Math.hypot(n.x-a.pos.x,n.z-a.pos.z);
  if(n.zone<0&&n.nativePaintable&&distance<=34)ids.push(n.id);
  for(const edge of n.nb){const next=nav.nodes[edge.to];if(seen[next.id]||!nav.valid[next.id]||next.zone===1-a.team)continue;seen[next.id]=1;queue.push(next.id);}
 }
 brain._nativeGoalIds={nav,start,team:a.team,ids};return ids;
}
