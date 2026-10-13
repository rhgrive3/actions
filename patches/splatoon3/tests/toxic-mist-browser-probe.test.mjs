import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
test('exact browser probe admits Mist and tests victim AP0/10/57 in both grounded forms',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.scene=new f.THREE.Scene();f.G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.Physics(f.G.level);
 const s=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');const helpers=s.slice(s.indexOf('      class DisplayCharacter {'),s.indexOf('      const {CANONICAL_KITS}'));const block=s.slice(s.indexOf('      const mistChecks=[];'),s.indexOf('      const conditionalChecks=[];'));
 const run=new Function('Actor','THREE','Player','Projectiles','G','emptyLoadout','gearCurve','check',helpers+block+'return mistChecks;');assert.equal(run(f.Actor,f.THREE,f.PLAYER,f.Projectiles,f.G,emptyLoadout,gearCurve,(v,m)=>assert.ok(v,m)).length,6);
});
