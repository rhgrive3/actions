// QA-only observation of the native post-pose presentation contract introduced
// in dc9dfea9. No visibility, pose, material, clock or input mutations.
export function captureSubmergedPresentation(ch) {
  const owner=ch?.sourceMotion, a=ch?.actor, sq=ch?.squid;
  const attached=node=>{for(let p=node,n=0;p&&n<64;p=p.parent,n++)if(p===ch.root)return true;return false;};
  let rootAncestorsVisible=true,ancestor=ch?.root?.parent,depth=0;
  for(;ancestor&&depth<64;ancestor=ancestor.parent,depth++)if(ancestor.visible===false)rootAncestorsVisible=false;
  if(ancestor)rootAncestorsVisible=false; // Truncated/cyclic chain is not proven visible.
  const parts=Object.fromEntries(['body','eyes','dark','ghost'].map(role=>{
    const node=sq?.[role]; let meshes=0;node?.traverse(n=>{if(n.isMesh)meshes++;});
    return [role,{present:!!node,attached:attached(node),visible:node?.visible??null,meshes}];
  }));
  return {schema:1,authority:'native-post-update',form:ch?.form,grounded:ch?.grounded,
    rootAncestorsVisible,squidRootVisible:ch?.squidRoot?.visible,rootVisible:ch?.root?.visible,kidVisible:ch?.kid?.visible,kidScale:ch?.kidScale,squidScale:ch?.sqScale,
    source:{status:owner?.status??null,error:!!owner?.error,disposed:!!owner?.disposed,
      bound:owner?.character===ch&&owner?.squidRig?.character===ch,banks:!!owner?.bank&&!!owner?.squidBank,
      active:owner?.active??null,formWeight:owner?.formWeight??null},
    actor:a?{bound:a.character===ch,form:a.form,grounded:a.grounded,submerged:a.submerged,climbing:a.climbing}:null,parts};
}

export function classifySubmergedPresentation(r) {
  const fail=why=>{throw Error('Submerged presentation: '+why);};
  if(r?.schema!==1||r.authority!=='native-post-update'||!['kid','squid','swim','climb'].includes(r.form))fail('identity');
  for(const k of ['grounded','rootVisible','rootAncestorsVisible','squidRootVisible','kidVisible'])if(typeof r[k]!=='boolean')fail(k);
  for(const k of ['kidScale','squidScale'])if(!Number.isFinite(r[k])||r[k]<0)fail(k);
  for(const role of ['body','eyes','dark','ghost']){
    const p=r.parts?.[role];if(p?.present!==true||p.attached!==true||typeof p.visible!=='boolean'||!Number.isInteger(p.meshes)||p.meshes<0)fail('missing/bad '+role);
  }
  if(r.parts.body.meshes<1)fail('body has no mesh');
  const inInk=r.form==='climb'||r.form==='swim'&&r.grounded;
  if(r.parts.body.visible===inInk)fail('wrong body visibility');
  if(r.parts.ghost.visible||inInk&&(r.parts.eyes.visible||r.parts.dark.visible))fail('wrong submerged parts');
  if(inInk){
    const o=r.source,a=r.actor;
    if(o?.status!=='ready'||o.error!==false||o.disposed!==false||o.bound!==true||o.banks!==true||typeof o.active!=='boolean'||!Number.isFinite(o.formWeight)||o.formWeight<0||o.formWeight>1)fail('unproven owner');
    if(a?.bound!==true||a.form!=='squid'||a.grounded!==r.grounded||typeof a.submerged!=='boolean'||typeof a.climbing!=='boolean'||(r.form==='climb'?!a.climbing:!a.submerged||a.climbing))fail('actor/form mismatch');
  }
  // A submerged squid does NOT excuse a still-visible transitioning human.
  // Independent glint/Flow draws may remain; they are validated separately.
  // The native fallback scale may retain a nonzero transition value after the
  // active source rig has hidden the kid. Actual visibility and the source
  // blend, not that stale scalar alone, decide whether a human is drawn.
  const hiddenKid=r.kidVisible===false&&(r.source.active?r.source.formWeight===0:r.kidScale===0);
  const emptyRigAdmissible=inInk&&r.rootVisible&&r.rootAncestorsVisible&&r.squidRootVisible&&r.squidScale>0.001&&hiddenKid;
  return {expectedHiddenBody:inInk,emptyRigAdmissible,kind:inInk?'submerged-body':r.form==='kid'?'human':r.grounded?'dry-squid':'airborne-squid'};
}

export function assertPresentationGeometry(g, classification) {
  const fail=why=>{throw Error('Presentation geometry: '+why);};
  for(const k of ['indexedVertices','triangles','skinnedVertices','meshes'])if(!Number.isInteger(g?.[k])||g[k]<0)fail(k);
  if(g.indexedVertices===0){
    if(!classification.emptyRigAdmissible||g.triangles!==0||g.skinnedVertices!==0||g.meshes!==0||g.min!==null||g.max!==null)fail('unproven empty geometry');
    return 'expected-hidden-no-indexed-draw';
  }
  for(const key of ['min','max'])if(!Array.isArray(g[key])||g[key].length!==3||!g[key].every(Number.isFinite))fail('non-finite bounds');
  if(g.min.some((x,i)=>x>g.max[i]))fail('inverted bounds');
  if(!classification.emptyRigAdmissible&&(g.indexedVertices<100||g.triangles<30||g.meshes<1))fail('visible indexed denominator');
  if(classification.emptyRigAdmissible&&(g.triangles<1||g.meshes<1))fail('independent draw denominator');
  return classification.emptyRigAdmissible?'submerged-independent-draw':'visible-indexed-draw';
}

export function assertPresentationCoverage(rows, required) {
  for(const kind of required)if(!rows.some(r=>r.kind===kind&&r.visiblePixelPass===true&&r.indexedGeometryPass===true))throw Error('Missing presentation positive control: '+kind);
}
