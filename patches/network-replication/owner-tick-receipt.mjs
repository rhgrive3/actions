// Receiver-local synchronous capability. JSON fields cannot forge admission;
// only the native tick's commit point can mark the active invocation.
const active = new WeakMap();
export function observeOwnerTick(nm, from, packet, run) {
  const previous=active.get(nm);
  // Independent receiver wrappers may observe the same native invocation.
  // Share that scope rather than hiding the commit from the outer observer.
  if(previous && previous.packet===packet && previous.from===from && previous.session===nm.s &&
    previous.match===nm.match && previous.matchId===nm.cfg?.id)
    return {result:run(),receipt:previous.accepted};
  const scope={from, timestamp:packet?.ts, session:nm.s, match:nm.match,
    matchId:nm.cfg?.id, packet, accepted:null};
  active.set(nm,scope);
  try { return {result:run(), receipt:scope.accepted}; }
  finally { if(previous)active.set(nm,previous);else active.delete(nm); }
}
export function commitOwnerTick(nm,from,packet,events,actors) {
  const scope=active.get(nm);
  if(!scope || scope.accepted || scope.from!==from || scope.timestamp!==packet.ts ||
    scope.session!==nm.s || scope.match!==nm.match || scope.matchId!==nm.cfg?.id || nm._disposed)return;
  const admittedEvents=events.filter(event=>{
    const nid=event[1]==='ev' ? event[3]?.actor?.n : event[2];
    return actors?.some(actor=>actor.nid===nid && actor.owner===from);
  });
  const poses=new Map();
  for(const entry of actors||[])if(entry.actor)poses.set(entry.nid,[entry.x,entry.y,entry.z]);
  scope.accepted={...packet,e:admittedEvents,actors:actors?.map(entry=>entry.actor||entry),poses,
    ownerSession:scope.session,ownerMatch:scope.match,ownerMatchId:scope.matchId};
}
