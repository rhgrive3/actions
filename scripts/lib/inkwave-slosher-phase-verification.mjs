import assert from 'node:assert/strict';
import {PHASE_COMMIT,PHASE_PATH,PHASE_INSERT,sha256} from './inkwave-slosher-phase-control.mjs';

export function verifyPhaseTrace(trace,{oldFallback=false}={}){
  assert.equal(trace?.schema,2,'native phase accounting schema 2 required; legacy receipts lack cell-range provenance and require fresh captures');
  assert.equal(trace.accountingProtocol,'native-cell-credit-ranges-v2','raw credit/cell coverage protocol required');
  assert.equal(trace.sourceActor,'WeaponSlosherWashtub');
  assert.deepEqual(trace.failures,[],'native owned-cell / turf / special accounting');
  const integer=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
  const finite=v=>typeof v==='number'&&Number.isFinite(v),vector=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
  const context=trace.paintContext;assert.ok(context&&typeof context.native==='boolean'&&[0,1].includes(context.team)&&integer(context.gridLength),'raw production paint context');
  assert.equal(context.scoringPredicate,'face.turf && !paint.dead[index]');assert.equal(context.nativeBodySkipPredicate,'level.native && paint.dead[index]');
  assert.ok(Array.isArray(context.faces)&&context.faces.length&&Array.isArray(context.deadCells)&&Array.isArray(context.initialOwnedCells),'complete raw face/dead/initial ownership observations');
  const dead=new Set(context.deadCells);assert.equal(dead.size,context.deadCells.length,'unique dead cells');
  for(const k of dead)assert.ok(integer(k,context.gridLength-1),'bounded dead cell');
  const faceAt=new Map(),coverageOrder=new Map(),expectedFaces=[];let coverageArea=0,order=0;
  for(const f of context.faces){
    assert.ok(integer(f.grid)&&integer(f.nu)&&f.nu>0&&integer(f.nv)&&f.nv>0&&finite(f.cu)&&f.cu>0&&finite(f.cv)&&f.cv>0&&typeof f.turf==='boolean'&&vector(f.normal)&&vector(f.origin)&&vector(f.u)&&vector(f.v),'raw production face layout');
    assert.ok(f.grid+f.nu*f.nv<=context.gridLength,'face grid bounds');let eligibleCells=0;
    for(let k=f.grid;k<f.grid+f.nu*f.nv;k++){
      assert.ok(!faceAt.has(k),'non-overlapping production faces');faceAt.set(k,f);
      if(f.turf&&!dead.has(k)){coverageOrder.set(k,order++);eligibleCells++;coverageArea+=f.cu*f.cv*Math.max(0,f.normal[1]);}
    }
    if(f.turf)expectedFaces.push({grid:f.grid,nu:f.nu,nv:f.nv,cu:f.cu,cv:f.cv,normalY:f.normal[1],eligibleCells});
  }
  assert.equal(faceAt.size,context.gridLength,'every raw grid cell has one production face');
  assert.deepEqual(trace.coverageFaces,expectedFaces,'coverage faces independently derived from raw eligibility');
  assert.equal(trace.coverageArea,coverageArea,'exact projected floor area denominator');assert.ok(coverageArea>0);
  const classify=c=>{
    assert.ok(integer(c.index,context.gridLength-1),'bounded ownership index');const f=faceAt.get(c.index),local=c.index-f.grid,j=Math.floor(local/f.nu),i=local-j*f.nu;
    assert.equal(c.faceGrid,f.grid);assert.equal(c.i,i);assert.equal(c.j,j);assert.equal(c.native,context.native);
    assert.equal(c.dead,dead.has(c.index),'raw dead flag');assert.equal(c.turf,f.turf,'raw turf flag');
    return {f,eligible:f.turf&&!dead.has(c.index)};
  };
  const owned=new Map(context.initialOwnedCells);assert.equal(owned.size,context.initialOwnedCells.length,'unique initial ownership');
  for(const [index,value] of owned){assert.ok(integer(index,context.gridLength-1)&&[1,2].includes(value));assert.ok(!coverageOrder.has(index),'fresh native scoring floor');}
  const seenCells=new Set();
  for(const c of trace.cells){const {f,eligible}=classify(c);assert.equal(c.eligible,eligible,'production scoring predicate');
    assert.equal(c.area,eligible?f.cu*f.cv:0,'raw eligible cell area');assert.equal(c.coverageOrder,eligible?coverageOrder.get(c.index):0,'native face/cell order');
    assert.equal(c.from,owned.get(c.index)||0,'continuous raw ownership');assert.ok([1,2].includes(c.to)&&c.to!==c.from,'actual ownership mutation');owned.set(c.index,c.to);
    if(eligible){assert.equal(c.from,0);assert.equal(c.to,context.team+1);assert.ok(!seenCells.has(c.index),'eligible ownership cell cannot be duplicated');seenCells.add(c.index);}
  }
  for(const c of trace.nonScoringChanges){const {f,eligible}=classify(c);assert.equal(c.pointEligible,eligible);assert.equal(eligible,false,'non-scoring mutations cannot hide eligible turf');
    assert.ok(c.dead||!c.turf);assert.ok(vector(c.point),'raw buried-point coordinates');
    const u=(c.i+.5)*f.cu,v=(c.j+.5)*f.cv,point=f.origin.map((x,k)=>x+f.u[k]*u+f.v[k]*v+f.normal[k]*.06);
    assert.deepEqual(c.point,point,'production _initGrid buried-point position');if(c.dead)assert.equal(c.pointInside,true,'production buried-point predicate witness');
  }
  const b=trace.birth;
  assert.ok(b&&Number.isFinite(b.seed)&&b.seed>=0&&b.seed<=1,'actual admitted projectile seed');
  for(const [k,v] of Object.entries({unit:0,index:0,spacing:3.1,count:7,width:1.344,depth:2,drawRadius:.1}))assert.equal(b[k],v,'source '+k);
  let threshold=oldFallback?1:(.5+(.55-.5)*b.seed)*3.1;
  assert.equal(b.initialDistance,threshold,'source first rate times spacing (old fallback must fail control)');
  assert.ok(trace.releases.length>0&&trace.releases.length<=7,'nonempty bounded source slots');
  let releaseIndex=0,nextDistance=b.initialDistance,beforeTravel=0;
  for(const [step,s] of trace.steps.entries()){
    assert.ok(s.dt===1/60&&s.seed===b.seed,'actual fixed step and admitted seed');
    assert.ok(integer(s.frame)&&finite(s.beforeTravel)&&finite(s.travel)&&s.travel>=s.beforeTravel&&vector(s.prev)&&vector(s.pos),'raw admitted head segment');
    assert.equal(s.beforeTravel,beforeTravel,'continuous admitted travel');beforeTravel=s.travel;
    assert.ok(integer(s.dropCount,7)&&s.dropCount>=releaseIndex,'monotonic native drop counter');
    const emitted=trace.releases.filter(r=>r.step===step);assert.equal(emitted.length,s.dropCount-releaseIndex,'every production drop-count increment has one release');
    for(const r of emitted){assert.equal(r.frame,s.frame,'actual release step frame');nextDistance+=3.1;}
    assert.equal(s.nextSplash,nextDistance,'complete source spacing schedule');
    releaseIndex=s.dropCount;
  }
  assert.equal(releaseIndex,trace.releases.length,'complete observed release ledger');
  for(const r of trace.releases){
    assert.ok(integer(r.step,trace.steps.length-1),'bounded release step');
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
  let turf=trace.initial.turf,special=trace.initial.special,creditEnd=0,creditFrame=0;const creditedCells=new Set();
  for(const c of trace.credits){
    assert.ok(integer(c.frame)&&c.frame>=creditFrame,'chronological native credits');creditFrame=c.frame;
    assert.ok(finite(c.area)&&c.area>=0&&finite(c.cost)&&c.cost>0,'native credit values');
    assert.ok(Array.isArray(c.cellRange)&&c.cellRange.length===2&&c.cellRange.every(v=>integer(v,trace.cells.length)),'raw credit cell range');
    const [start,end]=c.cellRange;assert.ok(start>=creditEnd&&end>=start,'non-overlapping chronological credit cell ranges');creditEnd=end;
    assert.ok(['body','ancillary'].includes(c.kind)&&Array.isArray(c.cellGroups),'native credit context');
    let groupEnd=start,cellArea=0;
    for(const g of c.cellGroups){
      assert.equal(g.start,groupEnd,'groups partition the credit cell range');assert.ok(integer(g.end,end)&&g.end>=g.start);groupEnd=g.end;
      let area=0;for(let n=g.start;n<g.end;n++){
        const cell=trace.cells[n];assert.ok(integer(cell.frame)&&cell.frame<=c.frame,'credit follows its raw ownership mutation');if(c.kind==='body')assert.equal(cell.faceGrid,g.faceGrid,'native body-face summation group');
        if(cell.eligible){assert.ok(!creditedCells.has(n),'eligible cell credited only once');creditedCells.add(n);area+=faceAt.get(cell.index).cu*faceAt.get(cell.index).cv;}
      }
      cellArea+=area;
    }
    assert.equal(groupEnd,end,'complete credit range coverage');
    assert.equal(c.cellArea,cellArea,'cellArea independently summed from raw eligible cells');assert.equal(c.area,cellArea,'native credit equals independently owned area');
    assert.deepEqual(c.guards,{specialActive:false,stormGaugeLock:c.guards?.stormGaugeLock,s3TidalSlamGaugeFinish:false},'production SP eligibility guards');
    assert.ok(finite(c.guards.stormGaugeLock)&&!(c.guards.stormGaugeLock>0),'production unlocked SP guard');
    assert.deepEqual(c.before,{turf,special},'continuous credit ledger');
    if(c.area>0){turf+=cellArea;special=Math.min(c.cost,special+cellArea);}
    assert.deepEqual(c.after,{turf,special},'exact native turf/SP arithmetic');
  }
  assert.equal(creditedCells.size,trace.cells.filter(c=>c.eligible).length,'every eligible owned cell has exactly one native credit');
  assert.ok(trace.cells.some(c=>c.eligible),'real fresh turf ownership');
  assert.deepEqual(trace.initial.counts,[0,0],'fresh native floor');
  let priorCells=0,priorCredits=0;const labels=new Set();
  for(const s of trace.snapshots){
    assert.ok(typeof s.label==='string'&&!labels.has(s.label),'unique native snapshot labels');labels.add(s.label);assert.ok(integer(s.frame),'raw snapshot frame');
    assert.ok(integer(s.cellCount,trace.cells.length)&&s.cellCount>=priorCells&&integer(s.creditCount,trace.credits.length)&&s.creditCount>=priorCredits,'bounded chronological snapshots');priorCells=s.cellCount;priorCredits=s.creditCount;
    const credit=trace.credits.slice(0,s.creditCount).at(-1)?.after||trace.initial;
    for(const c of trace.credits.slice(0,s.creditCount))assert.ok(c.cellRange[1]<=s.cellCount&&c.frame<=s.frame,'snapshot includes its credited cells');
    assert.equal(s.turf,credit.turf);assert.equal(s.special,credit.special);
    const areas=[0,0],counts=[0,0],cells=trace.cells.slice(0,s.cellCount).filter(c=>c.eligible).sort((a,b)=>a.coverageOrder-b.coverageOrder);
    for(const c of cells){const f=trace.coverageFaces.find(f=>c.index>=f.grid&&c.index<f.grid+f.nu*f.nv);assert.ok(f,'cell belongs to captured floor');
      assert.equal(c.area,f.cu*f.cv);areas[c.to-1]+=c.area*Math.max(0,f.normalY);counts[c.to-1]++;}
    assert.deepEqual(s.counts,counts,'counts independently reconciled to raw eligible cells');assert.equal(s.turfTotal,coverageOrder.size,'production eligible turf cell total');
    assert.deepEqual(s.ownedAreas,areas,'actual ownership cells in original face/cell order');
    assert.deepEqual(s.coverage,areas.map(v=>v/coverageArea),'coverage from actual projected owned area');
  }
  const initial=trace.snapshots[0],end=trace.snapshots.at(-1);
  assert.ok(initial?.label==='initial'&&initial.cellCount===0&&initial.creditCount===0,'unmodified initial accounting snapshot');
  assert.ok(end?.label==='end'&&end.cellCount===trace.cells.length&&end.creditCount===trace.credits.length,'final snapshot covers the complete raw ledger');
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
  assert.equal(r.schema,2,'phase source receipt schema 2 required; legacy helper/cell coverage is insufficient');
  assert.equal(r.accountingProtocol,'native-cell-credit-ranges-v2');
  assert.equal(r.kind,'source-backed-slosher-phase-control');assert.equal(r.correctionCommit,PHASE_COMMIT);
  assert.equal(r.patchSha256,sha256(PHASE_INSERT));assert.deepEqual(r.changedPaths,[PHASE_PATH]);
  assert.ok(r.builds&&r.builds.original!==r.builds.control,'independent control build binding');
}
