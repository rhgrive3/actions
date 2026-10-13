// Diagnostic orchestration only. Complete stage evidence before projectile
// hypotheses; a failure in one phase must not erase unrelated observations.
export async function collectVisibilityEvidence({renderStage,probeProjectiles,save,onFailure}){
 const failures=[];
 const attempt=async(phase,quality,time,fn)=>{
  try{await fn(quality,time);}catch(error){
   const failure={phase,quality,time,error:String(error?.stack||error)};
   failures.push(failure);await onFailure(failure);
  }finally{await save();}
 };
 for(const quality of ['low','high'])for(const time of ['day','dusk'])await attempt('stage',quality,time,renderStage);
 for(const quality of ['low','high'])await attempt('projectile',quality,'day',probeProjectiles);
 return failures;
}
// Call only after persisting the returned quality report. A diagnostic helper
// may intentionally return partial failures instead of throwing to save cases.
export function requireProjectileEvidence(report){
 const errors=[];
 if(report.failures?.length)errors.push('case failures: '+JSON.stringify(report.failures));
 if(report.visibilityEstablished!==true)errors.push('projectile visibility not established');
 if(report.cases?.length!==6)errors.push('incomplete projectile case matrix');
 for(const c of report.cases||[]){
  if(c.traceComplete!==true)errors.push('incomplete native trace: '+(c.weapon||'unknown'));
  for(const v of c.views||[]){
   if(v.glError!==0)errors.push('GPU error: '+v.glError);
   if(v.sampledProjectileFieldsUnchanged!==true)errors.push('sampled projectile field mutation or missing invariant proof');
  }
 }
 if(errors.length)throw new Error(errors.join('\n'));
}
export function visibilityVerdict(result){
 return result.error||result.errors?.length||result.failures?.length?'failed':'passed';
}
