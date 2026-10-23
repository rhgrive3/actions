// Count the union of observed stop-the-world intervals only. Nested V8 events
// must not be summed, background GC work must not be called a JS pause.
export function summarizeGcTrace(events){
 const start=events.find(e=>e.name==='inkwave-cpu-start');
 const end=events.find(e=>e.name==='inkwave-cpu-end'&&e.pid===start?.pid&&e.tid===start?.tid);
 if(!start||!end||!(end.ts>start.ts))throw Error('Missing measured renderer trace window');
 const intervals=events.filter(e=>e.pid===start.pid&&e.tid===start.tid&&e.ph==='X'&&
  /^(?:MinorGC|MajorGC|V8\.GCScavenger|V8\.GCCompactor|V8\.GCFinalizeMC)$/.test(e.name)&&e.dur>0)
  .map(e=>[Math.max(start.ts,e.ts),Math.min(end.ts,e.ts+e.dur)])
  .filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
 const merged=[];for(const [a,b] of intervals){const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
 return {status:'observed',events:intervals.length,pauses:merged.length,pauseMs:merged.reduce((s,[a,b])=>s+(b-a)/1000,0),maxPauseMs:Math.max(0,...merged.map(([a,b])=>(b-a)/1000)),windowMs:(end.ts-start.ts)/1000};
}
