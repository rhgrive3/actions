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

export function assertCatalogGeometryPresent(geometry,label){
  if(geometry?.indexedVertices===0)throw Error('Catalog empty indexed geometry '+label+'; collector accepted zero vertices (not a posed-vertex NaN diagnosis)');
}
export function summarizeCatalogEmptyGeometry(result){
 const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const bool=v=>typeof v==='boolean'?v:null;
 const label=v=>typeof v==='string'&&/^[a-z0-9-]{1,64}$/.test(v)?v:null;
 const data=Array.isArray(result?.data)?result.data:[],rows=[];
 let casesScanned=0,metricsScanned=0,scanTruncated=data.length>32;
 outer:for(const row of data.slice(0,32)){
  casesScanned++;const renders=Array.isArray(row?.renders)?row.renders:[];scanTruncated ||= renders.length>64;
  for(const r of renders.slice(0,64)){
   metricsScanned++;if(r?.geometry?.indexedVertices!==0)continue;
   const d=r.geometry.collectorDiagnostic??{};
   const counts=Object.fromEntries(['totalMeshes','localVisibleMeshes','nativeAncestorVisibleMeshes','indexedMeshes','nonIndexedMeshes','instancedMeshes','visitedMeshes','eligibleIndexedMeshes','materialEligibleGroups','drawRangeEligibleGroups','drawRangeEntries'].map(k=>[k,finite(d[k])]));
   rows.push({scenario:label(row?.name),frame:finite(r.frame),tick:finite(r.tick),visible:bool(r.visible),
    reason:'empty-indexed-collector; cause unproven; still a failure',
    rgb:{changedPixels:finite(r.rig?.changedPixels),maxChannelDifference:finite(r.rig?.maxChannelDifference)},
    geometry:{indexedVertices:0,triangles:finite(r.geometry.triangles),skinnedVertices:finite(r.geometry.skinnedVertices),meshes:finite(r.geometry.meshes)},
    collector:{rootVisible:bool(d.rootVisible),...counts}});
   if(rows.length===3){scanTruncated=true;break outer;}
  }
 }
 return {schema:1,scope:'empty collector diagnostics only; RGB remains independently gated',
  visibilityMeaning:'local flags and native ancestor chain counted separately; collector retains its pre-existing root-only hidden-rig override',
  casesScanned,metricsScanned,scanTruncated,rows};
}
