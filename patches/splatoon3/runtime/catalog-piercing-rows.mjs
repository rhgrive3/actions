// Rows never escape the synchronous contact consumer. Sorted references and
// allocation slots are separate: insertion shifts must not alias the next row.
// Weak ownership releases the entire bounded high-water pool with Projectiles.
const owners=new WeakMap(),MAX_DEPTH=8,MAX_ROWS=32;
export function acquireCatalogPiercingRows(owner){
  let state=owners.get(owner);
  if(!state){state={depth:0,leases:[]};owners.set(owner,state);}
  const depth=state.depth++,cached=depth<MAX_DEPTH;
  let lease=cached?state.leases[depth]:null;
  if(!lease){lease={state,depth,rows:[],used:0};if(cached)state.leases[depth]=lease;}
  lease.used=0;return lease;
}
export function catalogPiercingRow(lease,actor,t){
  const index=lease.used++;
  let row=index<MAX_ROWS?lease.rows[index]:null;
  if(!row){row={actor:null,t:0};if(index<MAX_ROWS)lease.rows[index]=row;}
  row.actor=actor;row.t=t;return row;
}
export function releaseCatalogPiercingRows(lease){
  for(let i=0;i<Math.min(lease.used,lease.rows.length);i++){
    lease.rows[i].actor=null;lease.rows[i].t=0;
  }
  lease.used=0;lease.state.depth=lease.depth;
}
