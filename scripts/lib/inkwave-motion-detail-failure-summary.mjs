// Bounded stdout diagnostics only. Never changes capture, validation or runtime.
// Mesh visibility counts in old receipts are local-node flags, not ancestor-aware.
export function summarizeDetailRigFailure(result) {
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const bool = value => typeof value === 'boolean' ? value : null;
  const label = value => typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) ? value : null;
  const position = value => Array.isArray(value) && value.length === 3 && value.every(v=>finite(v)!==null)
    ? [...value] : null;
  const data=Array.isArray(result?.data)?result.data:[];
  const rows=[];
  let casesScanned=0,metricsScanned=0,scanTruncated=data.length>32;
  outer: for(const entry of data.slice(0,32)){
    casesScanned++;
    const metrics=Array.isArray(entry?.renderMetrics)?entry.renderMetrics:[];
    scanTruncated ||= metrics.length>64;
    for(const m of metrics.slice(0,64)){
      metricsScanned++;
      const changed=finite(m?.rig?.changedPixels);
      if(changed!==null && changed>=16)continue;
      const d=m?.rigDiagnostic??{},frame=finite(m?.frame);
      const sample=Number.isInteger(frame)&&frame>=0&&frame<10000&&Array.isArray(entry?.samples)?entry.samples[frame]:null;
      const row={
        scenario:label(entry?.name),frame,form:['kid','squid','swim'].includes(sample?.form)?sample.form:null,
        changedPixels:changed,maxChannelDifference:finite(m?.rig?.maxChannelDifference),
        renderClocksStable:bool(m?.renderClocksStable),
        rigDiagnostic:{
          rootVisible:bool(d.rootVisible),characterVisible:bool(d.characterVisible),actorAlive:bool(d.actorAlive),
          kidRootVisible:bool(d.kidRootVisible),totalMeshes:finite(d.totalMeshes),visibleMeshes:finite(d.visibleMeshes),
          colorWriteMeshes:finite(d.colorWriteMeshes),withRigCalls:finite(d.withRigCalls),
          withoutRigCalls:finite(d.withoutRigCalls),projectileCount:finite(d.projectileCount),
          inkBlobCount:finite(d.inkBlobCount),actorPosition:position(d.actorPosition)
        }
      };
      rows.push(row);
      if(rows.length===3){scanTruncated=true;break outer;}
    }
  }
  return {schema:1,scope:'failure diagnostics only; no gate or capture changes',
    meshCountMeaning:'local node visibility flags; ancestor visibility is NOT established',
    nullMeaning:'missing, invalid or non-finite field',casesScanned,metricsScanned,scanTruncated,rows};
}
