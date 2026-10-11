import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
test('exact catalog gear-adoption browser probe uses real Actor, display contract and JSON admission',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
 const helpers=source.slice(source.indexOf('      class DisplayCharacter {'),source.indexOf('      const {CANONICAL_KITS}'));
 const probe=source.slice(source.indexOf('      const gearAdoptionChecks=[];'),source.indexOf('      const kitChecks=[];')).replace("const {NetMatch}=await import('/src/net/netmatch.js');",'');
 assert.ok(helpers.includes('update()')&&probe.includes('receiver.onLeave')&&probe.includes('remote._horizontal'));
 const run=new Function('Actor','THREE','Player','G','NetMatch','emptyLoadout','check',helpers+probe+'return gearAdoptionChecks;');
 const rows=run(f.Actor,f.THREE,f.PLAYER,f.G,f.NetMatch,emptyLoadout,(ok,label)=>assert.ok(ok,label));
 assert.deepEqual(rows.map(r=>r.points),[0,3,10,57]);
});
