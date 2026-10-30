// QA-only comparator. Independently verify each ZIP/PNG hash and read IHDR first.
// No branch/product mutation. Pre-reset epochs are diagnostics; actual shader clocks are strict.
export function compareBlastAB(A,B,expectedQA){
 const BASE='0cc5ce3712f93c275095d36c1f35ffdbd8565e2e',QA=expectedQA,frames=[0,1,3,5,9,13,21,29],bad=[];
 const eq=(a,b,p)=>{if(JSON.stringify(a)!==JSON.stringify(b))bad.push(p);};
 const exists=(v,p)=>{if(v===undefined||v===null)bad.push(p+' missing');};
 if(!/^[a-f0-9]{40}$/.test(QA||''))throw Error('explicit immutable expected QA SHA required');
 const results=[];
 for(const [x,variant,head,alpha]of [[A,'baseline',BASE,1],[B,'candidate',QA,.92]]){
  const c=x.capture,d=x.driver,p=x.provenance,v=x.verification,r=x.regression;
  for(const z of [c,d,p,v,r])if(!z)throw Error('missing receipt '+variant);
  eq(c.head,head,variant+'.capture.head');eq(d.head,head,variant+'.driver.head');
  for(const z of [p,v,r])eq(z.sourceHead,head,variant+'.sourceHead');
  for(const z of [c,d,p,v,r])eq(z.variant,variant,variant+'.variant');
  for(const z of [c,d,p,v])eq(z.shellAlpha,alpha,variant+'.alpha');
  eq(p.qaHead,QA,variant+'.qaHead');eq(p.sourceTrackedClean,true,variant+'.clean');
  eq(c.status,'captured-not-reviewed',variant+'.capture.status');eq(d.status,'captured-not-reviewed',variant+'.driver.status');
  eq(v.hashesVerified,true,variant+'.png hashes');eq(v.count,16,variant+'.count');
  eq(r.source,'passed',variant+'.source regressions');eq(r.emitted,'passed',variant+'.emitted regressions');eq(r.tests?.length,5,variant+'.testcount');
  if(!/^[a-f0-9]{64}$/.test(c.expectedContentHash||''))bad.push(variant+'.contentHash');
  eq(c.expectedContentHash,d.manifestHash,variant+'.manifest closure');
  for(const key of ['pageErrors','requestFailures','httpErrors'])eq(d[key],[],variant+'.'+key);
  eq(c.sourceReference,'https://x.com/rougsmth/status/1632258225746903041','reference URL');eq(c.referenceOnsetFrame,955,'reference onset');eq(c.referenceDate,'2023-03-05','reference date');
  eq(c.cases?.length,2,variant+'.cases');
  const cases=[];
  for(let i=0;i<2;i++){
   const z=c.cases?.[i];if(!z){bad.push('missing case');continue;}
   eq(z.withRoll,!!i,variant+'.case order');eq(z.preparation.nativeMatch,true,'nativeMatch');
   eq(z.preparation.verifiedHead,head,'prepared head');eq(z.preparation.contentHash,c.expectedContentHash,'prepared content');eq(z.preparation.allArtifactHashesVerified,true,'prepared hashes');
   eq(z.setup.contentHash,c.expectedContentHash,'setup content');if(!/^[a-f0-9]{64}$/.test(d.buildRevision||''))bad.push(variant+'.buildRevision');eq(z.setup.manifestRevision,d.buildRevision,'setup content-addressed revision');
   eq(z.setup.weaponId,'blaster','weapon');eq(z.setup.radius,z.setup.nativeBurstRadius,'radius');
   for(const k of ['camera','position','radius','ink','quality','firstTick'])exists(z.setup[k],'setup.'+k);
   eq(z.setup.firstTick.burstAgeAtF0,1/60,'F0 age');eq(z.setup.firstTick.fxTicksBeforeAdmission,0,'prior FX tick');
   exists(z.setup.firstTick.lighting,'lighting');exists(z.setup.firstTick.surfaceClock,'firstTick.surfaceClock');eq(z.captures.length,8,'frame count');
   const captures=z.captures.map((f,j)=>{
    eq(f.frame,frames[j],'frame');eq(f.seconds,(frames[j]+1)/60,'seconds');eq(f.burstAgeSeconds,(frames[j]+1)/60,'age');eq(f.sourceReferenceFrame,956+frames[j],'reference frame');eq(f.glError,0,'glError');
    const file=(i?'blast-roll':'blast-only')+'-F'+String(frames[j]).padStart(2,'0')+'.png';eq(f.file,file,'filename');eq(x.pngDimensions?.[file],[1280,720],'actual PNG IHDR');
    eq(f.rng?.seed,0x42535431,'seed');
    // Actual shader clocks are absent from the current 4f4 receipt: fail closed.
    let epoch=0;for(let tick=0;tick<=f.frame;tick++)epoch+=1/60;
    for(const k of ['time','shell','ring','beam','mote'])eq(f.fxClock?.[k],epoch,variant+'.fxClock.'+k);
    eq(f.fxClock?.dt,1/60,'FX dt');
    exists(f.surfaceClock,'surfaceClock');
    if(!Number.isFinite(f.surfaceClock?.levelMat?.uTime))bad.push('surfaceClock.levelMat.uTime missing/nonfinite');
    for(const k of ['uWake','uWakeB','uSwimH','uSwimF'])if(!Array.isArray(f.surfaceClock?.levelMat?.[k]))bad.push('surfaceClock.levelMat.'+k+' missing');eq(f.environmentClock?.time,0,'environment time');eq(f.environmentClock?.shader,0,'environment shader');
    for(const k of ['rng','camera','gameTime','actorPosition','actorProjection','pools','drawCalls','triangles'])exists(f[k],'capture.'+k);
    const {sha256,...conditions}=f;return conditions;
   });
   const {contentHash,manifestRevision,originalFxClock,firstTick,...rest}=z.setup;
   const {originalEnvironmentClock,...tick}=firstTick;
   const setup={...rest,originalFxDt:originalFxClock?.dt,firstTick:tick};
   cases.push({withRoll:z.withRoll,warm:z.preparation.warm,setup,captures});
  }
  results.push({sourceReference:c.sourceReference,referenceOnsetFrame:c.referenceOnsetFrame,referenceDate:c.referenceDate,scope:c.scope,browser:d.browser,launch:d.launch,lock:p.lockSHA256,scripts:p.scripts,runId:p.runId,runAttempt:p.runAttempt,tests:r.tests,cases});
 }
 eq(results[0],results[1],'cross-variant conditions');
 if(bad.length)throw Error([...new Set(bad)].join('; '));
 return {conditionsMatch:true,visualReview:'pending',performance:'not evaluated'};
}
