// Deterministic real Actor/Projectile paint requests. Set INKWAVE_BUILT_SITE
// to capture an older production build; run again from source for comparison.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {makePaintWorld} from '../patches/splatoon3/tests/paint-authority-fixture.mjs';

const output=process.argv[2];assert.ok(output,'output.json required');
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
const rows=[];
for(const [id,frames,height,angle] of [
  ['blaster',25,0,0],['s3-blaster-long',35,0,.55],
  ['s3-stringer-normal',72,0,0],['s3-stringer-explosion',80,0,.3],
  ['s3-saber-lite',1,0,0],['s3-saber-heavy',1,0,.3],['blaster',25,12,.7],
]){
  f.G.projectiles.clear();const {paint}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
  const a=f.make(id);a.form='kid';a.pos.set(0,height,0);a.ink=100;
  a.aimDir.set(Math.sin(angle),-.12,Math.cos(angle)).normalize();a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,100);
  const events=[],raw=paint.splat;
  paint.splat=function(at,R,team,opts={}){
    events.push({at:at.toArray(),R,team,seed:opts.seed,kind:opts.kind,footprint:opts.footprint,
      stretch:opts.stretch?.toArray(),stretchAmt:opts.stretchAmt,face:opts.face});
    return raw.call(this,at,R,team,opts);
  };
  for(let i=0;i<300;i++){
    a.intent.fire=i<frames;f.G.time+=1/60;a.update(1/60);f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);
  }
  assert.ok(events.length&&paint.counts[0]>0,id);
  rows.push({id:id+(height?' / high':'')+(angle?' / oblique':''),frames,height,angle,events,cells:paint.counts[0]});
}
fs.writeFileSync(output,JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows.map(({events,...r})=>({...r,stamps:events.length}))));
