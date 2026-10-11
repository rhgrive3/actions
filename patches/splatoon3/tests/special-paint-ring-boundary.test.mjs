import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';import {makePaintWorld} from './paint-authority-fixture.mjs';
for(const seed of[.13,.37,.79])test(`disk ring/grid expansion preserves prior ownership at sample boundaries, seed ${seed}`,async()=>{
 const rows=[];
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.G.settings={};f.setRandom(()=>seed);f.G.actors=[];
 const boundaries=[...new Set([...[6,9,10,11,12,21,22].map(n=>3.74+n*2.82/(2*Math.PI)),...Array.from({length:5},(_,row)=>{const z=row*2.82*Math.sqrt(3)/2,shift=row&1?1.41:0;return Array.from({length:4},(_,col)=>3.74+Math.hypot(col*2.82+shift,z));}).flat().filter(r=>r>3.74&&r<=13.5)])].sort((a,b)=>a-b);
 for(const boundary of boundaries)for(const side of[-1,1]){
  f.G.projectiles.clear();const {paint,face}=makePaintWorld(f);const radius=boundary+side*1e-6;
  const a=f.make();a.pos.set(0,0,30);a._resolve=()=>{};a.weapon={...a.weapon,special:'reefslider',specialCost:100};a.special=100;a._startSpecial();a._s3AllSpecialState.paintRadius=radius;a._s3AllSpecialState.phase='dash';a.intent.fire=true;a._updateSpecial(1/60);
  for(let i=0;i<240;i++)paint.advanceSimulation(1/60);rows.push({boundary,side,grid:Array.from(paint.grid),area:paint.counts[0]*face.cu*face.cv});
 }
 for(let i=0;i<rows.length;i+=2){const before=rows[i],after=rows[i+1];assert.ok(after.area>=before.area,'no area decrease at R='+before.boundary);let lost=0;for(let k=0;k<before.grid.length;k++)if(before.grid[k]&&!after.grid[k])lost++;assert.equal(lost,0,'existing ring/grid centres are preserved at R='+before.boundary);}
});
