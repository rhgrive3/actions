// Trace coverage describes recorded intervals, not sampled CPU/GPU utilization.
// Union nested records so a parent RunTask plus its child ParseHTML is not
// presented as twice the elapsed work.
export function intervalCoverage(intervals) {
  const rows=intervals.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0]);
  let total=0,left=null,right=null;
  for(const [a,b]of rows){
    if(left===null){left=a;right=b;}
    else if(a<=right)right=Math.max(right,b);
    else{total+=right-left;left=a;right=b;}
  }
  return total+(left===null?0:right-left);
}
export function summarizeStartupTrace(trace, navigationStartSeconds, navigation) {
  if(!Number.isFinite(navigationStartSeconds)||!Number.isFinite(navigation.responseEnd)||!Number.isFinite(navigation.domInteractive))
    throw new Error('Trace/navigation clock binding is missing');
  const start=navigationStartSeconds*1e6+navigation.responseEnd*1000;
  const end=navigationStartSeconds*1e6+navigation.domInteractive*1000;
  if(end<start)throw new Error('Navigation phase ran backwards');
  const names=new Map(),sources=new Map(),threads=new Map(),processes=new Map();
  for(const e of trace.traceEvents||[]){
    if(e.ph==='M'&&e.name==='thread_name')threads.set(e.pid+':'+e.tid,e.args?.name);
    if(e.ph==='M'&&e.name==='process_name')processes.set(e.pid,e.args?.name);
    if(e.ph!=='X'||!Number.isFinite(e.ts)||!Number.isFinite(e.dur)||e.dur<=0)continue;
    const a=Math.max(start,e.ts),b=Math.min(end,e.ts+e.dur);
    if(b<=a)continue;
    const key=JSON.stringify([e.pid,e.tid,e.name,e.cat]);
    let row=names.get(key);
    if(!row){row={pid:e.pid,tid:e.tid,name:e.name,category:e.cat||'',intervals:[]};names.set(key,row);}
    row.intervals.push([a,b]);
    const url=e.args?.data?.url||e.args?.data?.scriptName||e.args?.url;
    if(typeof url==='string'&&url){
      const sourceKey=JSON.stringify([e.pid,e.tid,e.name,url]);
      let source=sources.get(sourceKey);
      if(!source){source={pid:e.pid,tid:e.tid,name:e.name,url,intervals:[]};sources.set(sourceKey,source);}
      source.intervals.push([a,b]);
    }
  }
  const rows=[...names.values()].map(({intervals,...r})=>({...r,process:processes.get(r.pid)||null,thread:threads.get(r.pid+':'+r.tid)||null,
    coveredMs:intervalCoverage(intervals)/1000,events:intervals.length})).sort((a,b)=>b.coveredMs-a.coveredMs);
  return {phase:'HTML responseEnd to domInteractive',durationMs:(end-start)/1000,
    interpretation:'union of trace event intervals per named record/thread, not CPU samples or a causal attribution; different rows can overlap',
    topRecords:rows.slice(0,40),recordTypes:rows.length,
    topSources:[...sources.values()].map(({intervals,...r})=>({...r,
      coveredMs:intervalCoverage(intervals)/1000,events:intervals.length}))
      .sort((a,b)=>b.coveredMs-a.coveredMs).slice(0,40)};
}
