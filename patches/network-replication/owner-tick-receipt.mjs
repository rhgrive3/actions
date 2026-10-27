// Receiver-local synchronous capability. JSON fields cannot forge admission;
// only the native tick's commit point can mark the active invocation.
const active = new WeakMap();
export function observeOwnerTick(nm, from, packet, run) {
  const previous=active.get(nm);
  const scope={from, timestamp:packet?.ts, session:nm.s, match:nm.match,
    matchId:nm.cfg?.id, accepted:null};
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
  scope.accepted={...packet,e:admittedEvents,actors};
}
