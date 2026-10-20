import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
test('exact catalogue-sub browser probe covers native Burst and five authoritative JSON causes',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.G.scene=new f.THREE.Scene();
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');const helpers=source.slice(source.indexOf('      class DisplayCharacter {'),source.indexOf('      const {CANONICAL_KITS}'));const probe=source.slice(source.indexOf('      const catalogueSubChecks=[];'),source.indexOf('      const directSubChecks=[];'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('Actor','THREE','Player','G','NetMatch','api','emptyLoadout','gearCurve','check',helpers+probe+'return catalogueSubChecks;');const old=f.G.match;
 const rows=await run(f.Actor,f.THREE,f.PLAYER,f.G,f.NetMatch,{Physics:f.installedRuntime.Physics},emptyLoadout,gearCurve,(v,m)=>assert.ok(v,m));assert.equal(rows.length,8);assert.equal(f.G.match,old);
});
