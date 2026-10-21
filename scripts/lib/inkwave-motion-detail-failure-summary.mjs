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
          inkBlobCount:finite(d.inkBlobCount),actorPosition:position(d.actorPosition),
          sourceMotion:{status:label(d.sourceMotion?.status),active:bool(d.sourceMotion?.active),sameOwner:bool(d.sourceMotion?.sameOwner),variant:['Player00','Player01'].includes(d.sourceMotion?.variant)?d.sourceMotion.variant:null,
            squid:typeof d.sourceMotion?.squid?.name==='string'&&/^[A-Za-z0-9_]{1,96}$/.test(d.sourceMotion.squid.name)?{name:d.sourceMotion.squid.name,frame:finite(d.sourceMotion.squid.frame)}:null},
          ownerVisibility:sanitizeOwnerVisibility(d.ownerVisibility??{}),
          cpuBounds:{scope:'CPU skin only; GPU deformation and depth visibility unmeasured',indexedVertices:finite(d.cpuBounds?.indexedVertices),eligibleMeshes:finite(d.cpuBounds?.eligibleMeshes),nonFiniteVertices:finite(d.cpuBounds?.nonFiniteVertices),unsupportedMeshes:finite(d.cpuBounds?.unsupportedMeshes),unsupportedReasons:Object.fromEntries(['instanced','missingIndex','missingVertexApi'].map(k=>[k,finite(d.cpuBounds?.unsupportedReasons?.[k])])),truncated:bool(d.cpuBounds?.truncated),worldMin:position(d.cpuBounds?.worldMin),worldMax:position(d.cpuBounds?.worldMax),ndcMin:position(d.cpuBounds?.ndcMin),ndcMax:position(d.cpuBounds?.ndcMax)}
        }
      };
      rows.push(row);
      if(JSON.stringify(rows).length>7000){rows.pop();scanTruncated=true;break outer;}
      if(rows.length===3){scanTruncated=true;break outer;}
    }
  }
  return {schema:1,scope:'failure diagnostics only; no gate or capture changes',
    meshCountMeaning:'legacy totalMeshes/visibleMeshes are local flags; ancestor visibility is NOT established by those counts; ownerVisibility separately records native ancestor visibility',
    nullMeaning:'missing, invalid or non-finite field',casesScanned,metricsScanned,scanTruncated,rows};
}

export function assertCatalogGeometryPresent(geometry,label){
  if(geometry?.indexedVertices===0)throw Error('Catalog empty indexed geometry '+label+'; collector accepted zero vertices (not a posed-vertex NaN diagnosis)');
}
export function summarizeCatalogEmptyGeometry(result){
 const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const bool=v=>typeof v==='boolean'?v:null;
 const label=v=>typeof v==='string'&&/^[a-z0-9-]{1,64}$/.test(v)?v:null;
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>finite(x)!==null)?[...v]:null;
 const clip=v=>typeof v==='string'&&/^[A-Za-z0-9_]{1,96}$/.test(v)?v:null;
 const role=v=>['character-root','character-model','kid-root','squid-root','squid-pivot','source-squid-rig','scene','mesh','other-group'].includes(v)?v:null;
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
    collector:{rootVisible:bool(d.rootVisible),...counts,
      owners:{modelVisible:bool(d.owners?.modelVisible),kidVisible:bool(d.owners?.kidVisible),squidVisible:bool(d.owners?.squidVisible),modelScale:vec(d.owners?.modelScale),kidScale:vec(d.owners?.kidScale),squidScale:vec(d.owners?.squidScale),kidWeight:finite(d.owners?.kidWeight),squidWeight:finite(d.owners?.squidWeight),formWeight:finite(d.owners?.formWeight),sourceActive:bool(d.owners?.sourceActive),sourceStatus:label(d.owners?.sourceStatus),form:['kid','squid','swim','climb'].includes(d.owners?.form)?d.owners.form:null,sourceSquidClip:clip(d.owners?.sourceSquidClip),sourceSquidFrame:finite(d.owners?.sourceSquidFrame),humanClips:(Array.isArray(d.owners?.humanClips)?d.owners.humanClips:[]).slice(0,4).map(c=>({name:clip(c?.name),frame:finite(c?.frame),weight:finite(c?.weight)}))},
      hiddenAncestorChains:(Array.isArray(d.hiddenAncestorChains)?d.hiddenAncestorChains:[]).slice(0,2).map(c=>({firstHidden:role(c?.firstHidden),truncated:bool(c?.truncated),roles:(Array.isArray(c?.roles)?c.roles:[]).slice(0,8).map(n=>({role:role(n?.role),visible:bool(n?.visible)}))}))}});
   // Every copied string is ASCII-filtered. Reserve >1KiB for the fixed envelope.
   if(JSON.stringify(rows).length>7000){rows.pop();scanTruncated=true;break outer;}
   if(rows.length===3){scanTruncated=true;break outer;}
  }
 }
 return {schema:1,scope:'empty collector diagnostics only; RGB remains independently gated',
  visibilityMeaning:'local flags and native ancestor chain counted separately; collector retains its pre-existing root-only hidden-rig override',
  casesScanned,metricsScanned,scanTruncated,rows};
}

function sanitizeOwnerVisibility(d){
 const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const bool=v=>typeof v==='boolean'?v:null;
 const label=v=>typeof v==='string'&&/^[a-z0-9-]{1,64}$/.test(v)?v:null;
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>finite(x)!==null)?[...v]:null;
 const clip=v=>typeof v==='string'&&/^[A-Za-z0-9_]{1,96}$/.test(v)?v:null;
 const role=v=>['character-root','character-model','kid-root','squid-root','squid-pivot','source-squid-rig','scene','mesh','other-group'].includes(v)?v:null;
 return {totalMeshes:finite(d.totalMeshes),localVisibleMeshes:finite(d.localVisibleMeshes),nativeAncestorVisibleMeshes:finite(d.nativeAncestorVisibleMeshes),indexedMeshes:finite(d.indexedMeshes),nonIndexedMeshes:finite(d.nonIndexedMeshes),instancedMeshes:finite(d.instancedMeshes),owners:{modelVisible:bool(d.owners?.modelVisible),kidVisible:bool(d.owners?.kidVisible),squidVisible:bool(d.owners?.squidVisible),modelScale:vec(d.owners?.modelScale),kidScale:vec(d.owners?.kidScale),squidScale:vec(d.owners?.squidScale),kidWeight:finite(d.owners?.kidWeight),squidWeight:finite(d.owners?.squidWeight),formWeight:finite(d.owners?.formWeight),sourceActive:bool(d.owners?.sourceActive),sourceStatus:label(d.owners?.sourceStatus),form:['kid','squid','swim','climb'].includes(d.owners?.form)?d.owners.form:null,sourceSquidClip:clip(d.owners?.sourceSquidClip),sourceSquidFrame:finite(d.owners?.sourceSquidFrame),humanClips:(Array.isArray(d.owners?.humanClips)?d.owners.humanClips:[]).slice(0,4).map(c=>({name:clip(c?.name),frame:finite(c?.frame),weight:finite(c?.weight)}))},
      hiddenAncestorChains:(Array.isArray(d.hiddenAncestorChains)?d.hiddenAncestorChains:[]).slice(0,2).map(c=>({firstHidden:role(c?.firstHidden),truncated:bool(c?.truncated),roles:(Array.isArray(c?.roles)?c.roles:[]).slice(0,8).map(n=>({role:role(n?.role),visible:bool(n?.visible)}))}))};
}
