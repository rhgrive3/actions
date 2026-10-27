export function adaptQueueNetwork20261027(rel,code,replaceOnce) {
  if(rel!=='src/net/netmatch.js')return code;
  const patch=(a,b,label)=>{code=replaceOnce(code,a,b,'queue network 20261027: '+label);};
  code="import { commitOwnerTick } from '../../patches/network-replication/owner-tick-receipt.mjs';\n"+code;
  patch("case 't': if (d.wf) acceptWipeoutTimeline(this, from, d.wf); this._tick(from, d); break;", "case 't': this._tick(from, d); break;",'defer wipeout until native owner admission');
  patch('  _tick(from, d) {','  _tick(from, d) {\n    const ownerTickMatch=this.match,ownerTickSession=this.s;','capture synchronous owner epoch');
  patch('    // actors\n', '    const acceptedOwnerActors = [];\n    // actors\n','private admitted actor roster');
  patch('      buf.push(snap);','      buf.push(snap);\n      acceptedOwnerActors.push(a);','record only adopted actor snapshots');
  patch('    const kitPreparedEvents = [];','    const acceptedOwnerEvents = [];\n    const kitPreparedEvents = [];','private accepted-event batch');
  patch('        p.events.push(e);','        p.events.push(e);\n        acceptedOwnerEvents.push(e);','capture only events admitted into FIFO');
  const end='  }\n\n  // ---- timeline sampling';
  patch(end,"    commitOwnerTick(this, from, d, acceptedOwnerEvents, acceptedOwnerActors);\n    if (d.wf && this.match===ownerTickMatch && this.s===ownerTickSession && !this._disposed) acceptWipeoutTimeline(this, from, d.wf);\n"+end,'commit receiver capability and wipeout after native tick');
  return code;
}
