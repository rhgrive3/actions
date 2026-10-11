import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';import {emptyLoadout} from '../runtime/gear.mjs';
test('exact browser probe exercises Fast squid, ordinary kid and shared sub-ready acceleration',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 const s=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
 const helpers=s.slice(s.indexOf('      class DisplayCharacter {'),s.indexOf('      const {CANONICAL_KITS}'));
 const probe=s.slice(s.indexOf('      const accelerationChecks=[];'),s.indexOf('      const conditionalChecks=[];'));
 const run=new Function('Actor','THREE','Player','emptyLoadout','check',helpers+probe+'return accelerationChecks;');
 assert.equal(run(f.Actor,f.THREE,f.PLAYER,emptyLoadout,(v,m)=>assert.ok(v,m)).length,8);
});
