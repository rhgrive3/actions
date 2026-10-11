import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
test('exact conditional-clock browser probe uses actual Actor and admitted JSON',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
 const helpers=source.slice(source.indexOf('      class DisplayCharacter {'),source.indexOf('      const {CANONICAL_KITS}'));
 const probe=source.slice(source.indexOf('      const gearClockChecks=[];'),source.indexOf('      const transientGearChecks=[];')).replace("const {NetMatch}=await import('/src/net/netmatch.js');",'');
 assert.ok(helpers.includes('update()')&&probe.includes('receiver.onLeave')&&probe.includes('a.update(1/60)'));
 const run=new Function('Actor','THREE','Player','G','NetMatch','emptyLoadout','check',helpers+probe+'return gearClockChecks;');
 const previousTime=f.G.time;
 const rows=run(f.Actor,f.THREE,f.PLAYER,f.G,f.NetMatch,emptyLoadout,(ok,label)=>assert.ok(ok,label));
 assert.equal(f.G.time,previousTime,'probe restores shared simulation clock for subsequent native packet checks');
 assert.deepEqual(rows.map(r=>r.head),['comeback','openingGambit']);
});
