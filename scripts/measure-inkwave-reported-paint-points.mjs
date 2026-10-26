// Diagnostic only. Uses production composition, real projectiles/CPU paint,
// a controlled (not retail-measured) muzzle and preserved firing ordinals.
// This does not set an area-to-point calibration or change gameplay.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fixture,emitMainShot} from '../patches/splatoon3/tests/source-fixture.mjs';
import {makePaintWorld} from '../patches/splatoon3/tests/paint-authority-fixture.mjs';

const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
const records=[];
let observedActor=null,fires=0;
f.on('weapon:fire',event=>{if(event.actor===observedActor)fires++;});
for(const id of ['shooter','charger','s3-charger-long','s3-shooter-first','s3-shooter-precision']){
 for(const full of (id.includes('charger')?[false,true]:[false])){
  for(let seed=1;seed<=3;seed++){
   let rng=seed,a;
   f.setRandom(()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296));
   // Retain the actor and runner across fifteen shots: resetting each one
   // would sample only the first SplitNum/nearest-splash phase.
   for(let ordinal=0;ordinal<15;ordinal++){
    f.G.projectiles?.clear();
    const time=f.G.time;
    const {paint,face}=makePaintWorld(f);f.G.settings={};f.G.time=time;
    a??=f.make(id);f.G.actors=[a];a.form='kid';a.pos.set(0,0,0);
    a.character.root.position.copy(a.pos);
    a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);a.ink=100;
    const prior=a.stats.turf;
    observedActor=a;fires=0;
    if(!id.includes('charger'))emitMainShot(f,a);
    else {
     const frames=full?(a.weapon.catalogRecord?.parameters.WeaponParam.ChargeFrameFullCharge??60)+2:(id==='charger'?9:1);
     a.intent.fire=true;f.tick(a,frames);
    }
    a.intent.fire=false;f.tick(a,45);
    // Native Charger is a flight job, not an entry in projectiles.list.
    assert.equal(fires,1,id+' must accept exactly one shot');
    for(let i=0;i<240;i++){
     f.G.time+=1/60;f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);
    }
    const area=paint.counts[0]*face.cu*face.cv,turfGain=a.stats.turf-prior;
    assert.ok(area>0,id+' must reach the flat floor');
    assert.ok(Math.abs(turfGain-area)<1e-7,id+' must credit owned area exactly once');
    records.push({id,full,seed,ordinal,acceptedShots:fires,area,turfGain});
   }
  }
 }
}
const groups=[];
for(const id of [...new Set(records.map(r=>r.id))])for(const full of [false,true]){
 const rows=records.filter(r=>r.id===id&&r.full===full);if(!rows.length)continue;
 const meanArea=rows.reduce((sum,r)=>sum+r.area,0)/rows.length;
 groups.push({id,full,samples:rows.length,meanArea,minArea:Math.min(...rows.map(r=>r.area)),maxArea:Math.max(...rows.map(r=>r.area))});
}
const result={sourceHead:process.env.INKWAVE_MEASURE_SOURCE_SHA??null,
 conditions:{productionComposition:true,realProjectiles:true,cpuPaint:true,actualRenderedCharacter:false,
  controlledMuzzle:[0,1.05,.3],horizontalAim:true,flatUnpaintedFloor:true,cell:.25,seeds:[1,2,3],
  shotsPerActor:15,preserveShotOrdinals:true,acceptedShotsPerSample:1,simulationHz:60,
  projectileAndPaintDrainFrames:240,retailMatchedConditions:false},groups,records};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceHead:result.sourceHead,conditions:result.conditions,groups},null,2));
