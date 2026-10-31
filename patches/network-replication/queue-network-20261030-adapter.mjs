// Terminal transforms on the verified, fully composed public network source.
function once(code,before,after,rel){
  const at=code.indexOf(before);
  if(at<0||code.indexOf(before,at+before.length)>=0)throw Error(`Queue network 20261030 anchor mismatch: ${rel}: ${before.slice(0,70)}`);
  return code.slice(0,at)+after+code.slice(at+before.length);
}
export function adaptQueueNetwork20261030(rel,code){
  if(rel!=='src/net/netmatch.js')return code;
  code=once(code,`      if (!validActorSnapshotRow(s, d.ts)) continue;
      const a = this.byNid.get(s[0]);
      if (!a || !a.remote || a.owner !== from) continue;`,
  `      if (!Array.isArray(s)) continue;
      const a = this.byNid.get(s[0]);
      if (!a || !a.remote || a.owner !== from) continue;
      if (!validActorSnapshotRow(s, d.ts)) continue;`,rel);
  code=once(code,`  if (typeof d === 'object') { const o = { ...d }; if (o.amp !== undefined) o.valueOf = function () { return this.amp; }; else if (o.hand !== undefined) o.valueOf = () => 1; return o; }`,
  `  if (typeof d === 'object') { const o = { ...d }; if (o.amp !== undefined) o.valueOf = queueTriggerAmplitude; else if (o.hand !== undefined) o.valueOf = queueTriggerHand; return o; }`,rel);
  code=once(code,`      let i = 0;
      while (i < p.events.length && p.events[i][0] <= tr && (!Number.isFinite(p.events[i]._netTick) || !Number.isFinite(p.sim) || p.events[i]._netTick <= p.sim + .0306)) i++;`,
  `      const i = queueDueEventPrefix(p,tr);`,rel);
  // These are the two native append owners; recovery additionally sorts the
  // same FIFO. Any writer invalidates the prefix before the next playback.
  code=once(code,`\n        p.events.push(e);`,`\n        p.events.push(e);p._eventsRevision=((p._eventsRevision||0)+1)>>>0;`,rel);
  code=once(code,`\n      p.events.push(e);`,`\n      p.events.push(e);p._eventsRevision=((p._eventsRevision||0)+1)>>>0;`,rel);
  code=once(code,`    p.events.sort((a,b) => (a._netSeq ?? Infinity) - (b._netSeq ?? Infinity));`,
    `    p.events.sort((a,b) => (a._netSeq ?? Infinity) - (b._netSeq ?? Infinity));p._eventsRevision=((p._eventsRevision||0)+1)>>>0;`,rel);
  code=once(code,`      if (consumed) { p.events.copyWithin(0, consumed); p.events.length -= consumed; }`,
    `      if (consumed) { p.events.copyWithin(0, consumed); p.events.length -= consumed; p._eventDue=null; }`,rel);
  return code+`
function queueTriggerAmplitude(){return this.amp;}
function queueTriggerHand(){return 1;}
function queueDueEventPrefix(p,tr){
  const rows=p.events,sim=p.sim,finiteSim=Number.isFinite(sim),revision=p._eventsRevision||0;
  const cache=p._eventDue||(p._eventDue={});
  const valid=cache.rows===rows && cache.revision===revision && cache.length===rows.length
    && cache.first===rows[0] && cache.last===rows[rows.length-1] && tr>=cache.tr
    && cache.finiteSim===finiteSim && (!finiteSim || sim>=cache.sim);
  let i=valid?cache.count:0;
  while(i<rows.length && rows[i][0]<=tr && (!Number.isFinite(rows[i]._netTick)||!finiteSim||rows[i]._netTick<=sim+.0306))i++;
  cache.rows=rows;cache.revision=revision;cache.length=rows.length;cache.first=rows[0];cache.last=rows[rows.length-1];
  cache.tr=tr;cache.sim=sim;cache.finiteSim=finiteSim;cache.count=i;
  return i;
}
`;
}
