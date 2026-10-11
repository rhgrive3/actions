import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
test('exact browser marking probe uses actual sub projectiles and victim gear',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.G.scene=new f.THREE.Scene();f.G.camera=new f.THREE.PerspectiveCamera();
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');const helpers=source.slice(source.indexOf('      class DisplayCharacter {'),source.indexOf('      const {CANONICAL_KITS}'));const probe=source.slice(source.indexOf('      const subMarkChecks=[];'),source.indexOf('      const kitChecks=[];'));
 const run=new Function('Actor','THREE','Player','G','api','emptyLoadout','gearCurve','check',helpers+probe+'return subMarkChecks;');
 const previousTime=f.G.time,previousLevel=f.G.level;const rows=run(f.Actor,f.THREE,f.PLAYER,f.G,{Physics:f.installedRuntime.Physics},emptyLoadout,gearCurve,(ok,label)=>assert.ok(ok,label));assert.equal(rows.length,9);assert.equal(f.G.time,previousTime);assert.equal(f.G.level,previousLevel);
});
