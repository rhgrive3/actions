#!/usr/bin/env node
// Fixed-60Hz SOURCE-COMPOSED 65-weapon paint diagnostic. Not retail footage.
import fs from 'node:fs';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {makePaintWorld} from '../patches/splatoon3/tests/paint-authority-fixture.mjs';
import {MAIN_WEAPON_CATALOG as C} from '../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
 extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
if(C.records.length!==65)throw Error('Expected 65 main weapons');
const data=[];
for(const rec of C.records){
 f.G.actors.length=0;
 const {paint,face}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const a=f.make(rec.id);a.form='kid';a.aimDir.set(0,-.12,1).normalize();
 a.aimPoint.set(0,0,15);a.pos.set(0,0,0);a.ink=100;
 const count={total:0,byKind:{}},native=paint.splat;
 paint.splat=function(at,r,team,o={}){count.total++;
  const k=o.kind||'inferred';count.byKind[k]=(count.byKind[k]||0)+1;
  return native.call(this,at,r,team,o);};
 const entry={id:rec.id,family:rec.family,sourceActor:rec.sourceActor,legacy:!!rec.legacy,snapshots:[]};
 for(let t=1;t<=300;t++){
  a.intent.fire=t<=120;f.G.time+=1/60;
  a.update(1/60);f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);
  if(t===30||t===120||t===300)entry.snapshots.push({
   frame:t,occupiedWU2:Math.round(paint.counts[0]*face.cu*face.cv*10000)/10000,
   claimedPoints:Math.round(a.stats.turf*10000)/10000,
   special:Math.round(a.special*10000)/10000,paintEvents:count.total,byKind:{...count.byKind}});
 }
 data.push(entry);
 process.stderr.write(JSON.stringify({id:rec.id,at30:entry.snapshots[0].occupiedWU2,
  at300:entry.snapshots[2].occupiedWU2,events:count.total})+'\n');
}
const result={schema:1,version:'11.3.0',sourceCommit:'7280ff9cde8bb1c5dcef46c700c326471584d2e6',
 method:'actual native 60Hz composed INKWAVE CPU floor cells; not verified retail',cell:.25,
 conditions:'stationary aimed slightly down, fire held first 120F then 180F release; deterministic seed .37',
 weapons:data};
fs.writeFileSync(process.env.INKWAVE_PAINT_AUDIT_OUT||'inkwave-paint-action-audit.json',JSON.stringify(result,null,2)+'\n');
console.log('Measured '+data.length+' main weapon paint action curves');
