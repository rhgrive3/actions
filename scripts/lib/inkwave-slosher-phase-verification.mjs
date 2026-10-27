import assert from 'node:assert/strict';
import {PHASE_COMMIT,PHASE_PATH,PHASE_INSERT,sha256} from './inkwave-slosher-phase-control.mjs';

export function verifyPhaseTrace(trace,{oldFallback=false}={}){
  assert.equal(trace?.schema,1,'native phase observer required');
  assert.equal(trace.sourceActor,'WeaponSlosherWashtub');
  assert.deepEqual(trace.failures,[],'native owned-cell / turf / special accounting');
  const b=trace.birth;
  assert.ok(b&&Number.isFinite(b.seed)&&b.seed>=0&&b.seed<=1,'actual admitted projectile seed');
  for(const [k,v] of Object.entries({unit:0,index:0,spacing:3.1,count:7,width:1.344,depth:2,drawRadius:.1}))assert.equal(b[k],v,'source '+k);
  let threshold=oldFallback?1:(.5+(.55-.5)*b.seed)*3.1;
  assert.equal(b.initialDistance,threshold,'source first rate times spacing (old fallback must fail control)');
  assert.ok(trace.releases.length>0&&trace.releases.length<=7,'nonempty bounded source slots');
  for(const r of trace.releases){
    const s=trace.steps[r.step];assert.ok(s&&s.dt===1/60,'actual fixed physics step');
    assert.equal(r.radius,1.344);assert.equal(r.drawRadius,.1);assert.equal(r.depth,2);
    assert.ok(s.beforeTravel<threshold&&threshold<=s.travel+1e-9,'source threshold crosses actual admitted travel');
    // Nonterminal steps expose their full production segment. Terminal contact
    // uses the same source threshold/boundary regressions and native hit proof.
    if(!s.retired){
      const [x,y,z]=s.pos.map((x,i)=>x-s.prev[i]),length=Math.sqrt(x*x+y*y+z*z),t=Math.max(0,Math.min(1,(threshold-s.beforeTravel)/length));
      assert.deepEqual(r.position,s.prev.map((x,i)=>x+(s.pos[i]-x)*t),'interpolated native source release');
    }
    threshold+=3.1;
  }
  let turf=trace.initial.turf,special=trace.initial.special;
  for(const c of trace.credits){
    assert.deepEqual(c.before,{turf,special},'continuous credit ledger');
    if(c.area>0){assert.equal(c.area,c.cellArea,'actual owned-cell area');turf+=c.area;special=Math.min(c.cost,special+c.area);}
    assert.deepEqual(c.after,{turf,special},'exact native turf/SP arithmetic');
  }
  assert.ok(trace.cells.some(c=>c.eligible),'real fresh turf ownership');
  let coverageArea=0;for(const f of trace.coverageFaces)for(let i=0;i<f.eligibleCells;i++)coverageArea+=f.cu*f.cv*Math.max(0,f.normalY);
  assert.equal(trace.coverageArea,coverageArea,'exact projected floor area denominator');
  assert.deepEqual(trace.initial.counts,[0,0],'fresh native floor');
  for(const s of trace.snapshots){
    const credit=trace.credits.slice(0,s.creditCount).at(-1)?.after||trace.initial;
    assert.equal(s.turf,credit.turf);assert.equal(s.special,credit.special);
    const areas=[0,0],cells=trace.cells.slice(0,s.cellCount).filter(c=>c.eligible).sort((a,b)=>a.coverageOrder-b.coverageOrder);
    for(const c of cells){const f=trace.coverageFaces.find(f=>c.index>=f.grid&&c.index<f.grid+f.nu*f.nv);assert.ok(f,'cell belongs to captured floor');
      assert.equal(c.area,f.cu*f.cv);areas[c.to-1]+=c.area*Math.max(0,f.normalY);}
    assert.deepEqual(s.ownedAreas,areas,'actual ownership cells in original face/cell order');
    assert.deepEqual(s.coverage,areas.map(v=>v/coverageArea),'coverage from actual projected owned area');
  }
  assert.ok(trace.snapshots.some(s=>s.label==='F15')&&trace.snapshots.some(s=>s.label==='impact'),'midflight and native impact accounting required');
  return {first:b.initialDistance,seed:b.seed,releases:trace.releases.length,creditedCalls:trace.credits.length,observedCellChanges:trace.cells.length};
}
export function verifyCausalDifference(original,control,comparison){
  const a=verifyPhaseTrace(original.slosherPhase,{oldFallback:true}),b=verifyPhaseTrace(control.slosherPhase);
  assert.equal(a.seed,b.seed,'same actual source seed');
  const heads=trace=>trace.steps.map(({nextSplash,dropCount,...physical})=>physical);
  assert.deepEqual(heads(original.slosherPhase),heads(control.slosherPhase),'every main-head physics step unchanged');
  assert.equal(comparison.physicalVerification.status,'fail','original failure is preserved');
  assert.equal(comparison.pairedCaptureVerification.pairCount,52);
  assert.equal(comparison.pairedCaptureVerification.matchedPairCount,50,'all 50 unaffected captures remain strict');
  for(const key of ['visualProtocol','postNativeFireRng','canonicalPhysicalSetup'])assert.ok(['pass','matched'].includes(comparison.physicalVerification.checks[key]),'strict '+key);
  for(const pair of comparison.pairedCaptureVerification.pairs){
    if(pair.status==='matched')continue;
    const key=pair.key||pair;assert.equal(key.scenario,'floor-washtub','only Explosher may differ');
    assert.ok(key.phase==='F15'||String(key.phase).startsWith('floor-contact-'),'only measured paint phases');
    const find=(doc)=>doc.screenshots.find(r=>r.scenario===key.scenario&&r.phase===key.phase&&r.perspective===key.perspective);
    for(const [doc,receipt] of [[original,find(original)],[control,find(control)]]){
      assert.ok(receipt);const locals=receipt.runtime.roster.actors.filter(a=>a.isLocal);assert.equal(locals.length,1);
      const snapshot=doc.slosherPhase.snapshots.find(s=>s.label===key.phase);assert.ok(snapshot);
      assert.equal(locals[0].state.special,snapshot.special,'capture SP equals audited ownership credit');
    }
    const left=find(original),local=left.runtime.roster.actors.findIndex(a=>a.isLocal);
    assert.ok(pair.mismatches.length>0);
    for(const d of pair.mismatches)assert.equal(d.path,`capture.runtimePhysicalState.roster.actors[${local}].state.special`,'no other capture field may differ');
  }
  for(const entry of comparison.nativeScenarioStateVerification.scenarios){
    if(entry.status==='matched')continue;
    assert.equal(entry.scenario,'floor-washtub');
    for(const d of entry.mismatches)assert.equal(d.path,'scenarioState.impactState.paintCoverage[0]','only audited own coverage may differ');
  }
  for(const doc of [original,control]){
    const s=doc.visualScenarios.find(s=>s.name==='floor-washtub'),snapshot=doc.slosherPhase.snapshots.find(s=>s.label==='impact');
    assert.equal(s.impactFrame,25,'native main impact frame retained');assert.deepEqual(s.impactState.paintCoverage,snapshot.coverage,'impact coverage equals audited cells');
  }
  return {original:a,control:b,unaffectedPairs:50,changedPairs:2,patch:PHASE_COMMIT};
}
export function verifyControlReceipt(r){
  assert.equal(r.kind,'source-backed-slosher-phase-control');assert.equal(r.correctionCommit,PHASE_COMMIT);
  assert.equal(r.patchSha256,sha256(PHASE_INSERT));assert.deepEqual(r.changedPaths,[PHASE_PATH]);
  assert.ok(r.builds&&r.builds.original!==r.builds.control,'independent control build binding');
}
