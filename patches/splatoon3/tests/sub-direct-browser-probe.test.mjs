import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
test('exact direct-sub browser probe covers native contact and authoritative JSON ACK',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {kitBombContact} from './patches/splatoon3/runtime/kit-subs.mjs';"});f.G.scene=new f.THREE.Scene();
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');const helpers=source.slice(source.indexOf('      class DisplayCharacter {'),source.indexOf('      const {CANONICAL_KITS}'));const probe=source.slice(source.indexOf('      const directSubChecks=[];'),source.indexOf('      let totalProjectiles = 0;'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('Actor','THREE','Player','G','NetMatch','api','emptyLoadout','gearCurve','kitBombContact','check',helpers+probe+'return directSubChecks;');const old=f.G.match;
 const rows=await run(f.Actor,f.THREE,f.PLAYER,f.G,f.NetMatch,{Physics:f.installedRuntime.Physics,SUB:f.SUB},emptyLoadout,gearCurve,f.kitBombContact,(v,m)=>assert.ok(v,m));assert.equal(rows.length,10);assert.equal(f.G.match,old);
});
