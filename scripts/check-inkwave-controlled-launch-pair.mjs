// Separate diagnostic. Caller provides two fresh, hash-verified Game pages using
// the frozen stage-game runner's artifact interception and offline WebSocket gate.
// Never overwrites or reclassifies the original natural-stance pair evidence.
import fs from 'node:fs';
import path from 'node:path';
import {preparePair} from './check-inkwave-stage-game-pair.mjs';
import {installControlledLaunch,compareControlledIdentities} from './lib/inkwave-controlled-launch.mjs';
import {installCanvasCapture} from './lib/inkwave-canvas-capture.mjs';
import {probeProjectileVisibility} from './lib/inkwave-projectile-repeat-probe.mjs';
export async function collectControlledLaunchPair({baselinePage,candidatePage,out}){
 fs.mkdirSync(out,{recursive:true});
 const report={scope:'Separate ordinary-input controlled launch diagnostic; natural failed evidence retained separately; not collision-only attribution',status:'incomplete',cases:[],errors:[],relay:'held-not-run'};
 const save=()=>fs.writeFileSync(path.join(out,'controlled-launch-pair.json'),JSON.stringify(report,null,2));
 try{
  for(const [variant,page] of [['baseline',baselinePage],['candidate',candidatePage]]){
   const row={variant};report.cases.push(row);
   row.natural=await page.evaluate(preparePair,{mapId:'inkblot'});
   await page.evaluate(installCanvasCapture);await page.evaluate(installControlledLaunch);
   row.aim=await page.evaluate(()=>globalThis.__prepareControlledLaunch());save();
  }
  report.aimComparison=compareControlledIdentities(report.cases[0].aim.receipt,report.cases[1].aim.receipt);save();
  if(!report.aimComparison.matched)throw Error('Controlled aim/support identity mismatch; launch not attempted');
  for(const [i,page] of [baselinePage,candidatePage].entries()){
   report.cases[i].landing=await page.evaluate(expectedAim=>globalThis.__executeControlledLaunch({expectedAim}),report.cases[i].aim.receipt);save();
  }
  report.landingComparison=compareControlledIdentities(report.cases[0].landing,report.cases[1].landing);save();
  if(!report.landingComparison.matched)throw Error('Controlled landing identity mismatch; projectile comparison not attempted');
  for(const [i,page] of [baselinePage,candidatePage].entries()){
   const row=report.cases[i];row.projectiles=await probeProjectileVisibility(page,path.join(out,row.variant),{casePlan:[{scenario:'original-stance',weapon:'shooter',frames:[1,2,3,6],resetFiringRandom:true,captureRepeats:true}]});save();
  }
  const shots=report.cases.map(r=>r.projectiles?.cases[0]);
  const fields=['ageBefore','positionBefore','velocityBefore','actorPosition','aimDir','aimPoint'];
  report.shotComparison=compareControlledIdentities(...shots.map(s=>s?.trace?.[0]?Object.fromEntries(fields.map(k=>[k,s.trace[0][k]])):null));
  report.realAdmission=shots.length===2&&shots.every(s=>s?.admissions?.some(a=>a.controllerActor&&a.mouseFire&&a.intentFire&&a.runnerFire&&a.runnerDt===1/60&&a.alive));
  report.baselineImmediateCollision=!!(shots[0]?.trace?.[0]?.dead&&shots[0].trace[0].world?.some(h=>h.hit&&h.distance===0&&h.nativeObject!=null));
  report.collectionComplete=report.cases.every(r=>r.projectiles?.complete===true);
  const candidate=shots[1]?.temporal;
  report.candidateVisibilityEstablished=!!candidate?.complete&&candidate.frames.length===4&&candidate.frames.every(r=>r.nativeVisibilityEstablished===true);
  report.status=report.collectionComplete&&report.realAdmission&&report.shotComparison.matched&&report.candidateVisibilityEstablished?'collected':'incomplete';
 }catch(error){report.errors.push(String(error?.stack||error));}
 finally{save();}
 return report;
}
