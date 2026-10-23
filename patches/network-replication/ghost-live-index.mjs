// Only composed Projectiles instances opt in. Legacy/custom projectile stores
// keep the original exact scan. Entries contain live rounds only, and clear
// drops the entire index before pooled records lose their actor ownership.
const states = new WeakMap();
function insert(state, round) {
  if (!round?.ghost) return;
  // A custom store may insert the same object twice. The historical scan counts
  // both list entries, so an ambiguous lifecycle must fall back to that scan.
  if (state.rounds.has(round)) { state.duplicate = true; return; }
  const actor=round.owner,id=round._netId;
  let row=state.actors.get(actor);
  if(!row){row={count:0,ids:new Map()};state.actors.set(actor,row);}
  let ids=row.ids.get(id);if(!ids){ids=new Set();row.ids.set(id,ids);}
  ids.add(round);row.count++;state.total++;state.rounds.set(round,{actor,id});
}
function rebuild(projectiles) {
  const state={list:projectiles.list,length:projectiles.list.length,total:0,actors:new Map(),rounds:new Map()};
  for(const round of state.list)insert(state,round);
  states.set(projectiles,state);return state;
}
function current(projectiles) {
  if(!projectiles?._queueGhostLifecycle || !Array.isArray(projectiles.list))return null;
  const state=states.get(projectiles);
  const live=state&&state.list===projectiles.list&&state.length===projectiles.list.length?state:rebuild(projectiles);
  return live.duplicate?null:live;
}
export function recordGhostPush(projectiles,round) {
  const state=states.get(projectiles);if(!state)return;
  // Detect an untracked append/removal before our tracked append. Never allow
  // the known push to conceal an unknown length change.
  if(state.list!==projectiles.list||state.length+1!==projectiles.list.length){states.delete(projectiles);return;}
  state.length++;insert(state,round);
}
export function retireGhostRound(projectiles,round) {
  const state=states.get(projectiles);if(!state)return;
  if(state.list!==projectiles.list||state.length-1!==projectiles.list.length){states.delete(projectiles);return;}
  state.length--;
  const entry=state.rounds.get(round);if(!entry)return;
  const row=state.actors.get(entry.actor),ids=row?.ids.get(entry.id);
  ids?.delete(round);if(!ids?.size)row?.ids.delete(entry.id);
  if(row&&!--row.count)state.actors.delete(entry.actor);
  state.rounds.delete(round);state.total--;
}
export function clearGhostIndex(projectiles) {states.delete(projectiles);}
export function indexedGhostBudget(projectiles,actor,totalLimit=640,peerLimit=256,actorLimit=128) {
  const state=current(projectiles);if(!state)return null;
  if(state.total>=totalLimit||(state.actors.get(actor)?.count||0)>=actorLimit)return false;
  // Peer ownership may move during host handoff; derive it from the current
  // actor owner on these few actor rows rather than retain stale peer keys.
  let peer=0;
  for(const [owner,row]of state.actors)if(owner?.owner===actor.owner&&(peer+=row.count)>=peerLimit)return false;
  return true;
}
export function* matchingGhostRounds(projectiles,nid,id) {
  const state=current(projectiles);
  if(state){
    for(const [actor,row]of state.actors)if(actor?.nid===nid){const rounds=row.ids.get(id);if(rounds)for(const round of rounds)yield round;}
  }else for(const round of projectiles?.list||[])if(round?.ghost&&round.owner?.nid===nid&&round._netId===id)yield round;
}
// Test/debug oracle: callers can explicitly compare live counters to a full
// scan without making every production birth rescan the projectile list.
export function ghostIndexStats(projectiles) {
  const state=current(projectiles);return state?{total:state.total,actors:state.actors.size,rounds:state.rounds.size}:null;
}
