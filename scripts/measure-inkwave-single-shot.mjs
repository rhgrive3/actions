#!/usr/bin/env node
// One attack on an empty authoritative floor, actual composed source and 60Hz physics.
import fs from 'node:fs';
import {fixture} from './weapons-fixture.mjs';
import {CASES,reset,launch,finish,paintMetrics} from './measure-weapons-fidelity.mjs';
const f=await fixture({fidelity:true,cell:.25});
const rows=[];
for(const c of CASES){
 const actor=reset(f,c);launch(f,actor,c);
 finish(f,actor,240);
 const p=paintMetrics(f);
 const row={id:c.key,weapon:c.id,charge:c.charge??null,areaWU2:p.area,
  occupiedCells:p.cells,stamps:f.paints.filter(x=>!x.cosmetic).length,
  minRadius:p.splatRadius.min,maxRadius:p.splatRadius.max,
  bounds:p.bounds,centerDensity:p.centerDensity,sideDensity:p.sideDensity,
  emptyCenterRows:p.emptyCentreRows};
 rows.push(row);console.error(JSON.stringify(row));
}
const output={schema:1,source:'11.3.0',calibration:'INKWAVE CPU world-unit squares, NOT Nintendo turf points',
 input:'one shot per family, deterministic seed, fixed 60Hz, blank floor',rows};
const path=process.env.INKWAVE_SINGLE_SHOT_OUT||'single-shot-paint-audit.json';
fs.writeFileSync(path,JSON.stringify(output,null,2)+'\n');
console.log('Captured '+rows.length+' direct + detached-splash single-shot outcomes');
