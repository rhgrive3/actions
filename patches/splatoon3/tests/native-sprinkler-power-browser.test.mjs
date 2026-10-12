import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
test('exact Sprinkler power browser probe exercises standard Actor throws and phase snapshots',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {sprinklerPhase} from './patches/splatoon3/runtime/kit-sprinkler.mjs';"});const s=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
 const helper=s.slice(s.indexOf('      class DisplayCharacter {'),s.indexOf('      const {CANONICAL_KITS}'));
 const probe=s.slice(s.indexOf('      const sprinklerPowerChecks=[];'),s.indexOf('      const conditionalChecks=[];')).replace("const {sprinklerPhase}=await import('/patches/splatoon3/runtime/kit-sprinkler.mjs');",'');
 const rows=new Function('Actor','THREE','Player','G','api','emptyLoadout','gearCurve','sprinklerPhase','check',helper+probe+'return sprinklerPowerChecks;')(f.Actor,f.THREE,f.PLAYER,f.G,f,emptyLoadout,gearCurve,f.sprinklerPhase,(ok,label)=>assert.ok(ok,label));assert.deepEqual(rows.map(r=>r.ap),[0,10,57]);
});
