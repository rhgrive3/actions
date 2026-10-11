import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
test('exact transient browser probe uses real stand pickup and Super Jump landing before admitted takeover',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.scene=new f.THREE.Scene();f.G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
 const helpers=source.slice(source.indexOf('      class DisplayCharacter {'),source.indexOf('      const {CANONICAL_KITS}'));
 const probe=source.slice(source.indexOf('      const transientGearChecks=[];'),source.indexOf('      const kitChecks=[];')).replace("const {NetMatch}=await import('/src/net/netmatch.js');",'');
 const run=new Function('Actor','THREE','Player','G','NetMatch','api','emptyLoadout','check',helpers+probe+'return transientGearChecks;');
 const previousTime=f.G.time,previousLevel=f.G.level;
 const rows=run(f.Actor,f.THREE,f.PLAYER,f.G,f.NetMatch,{Physics:f.installedRuntime.Physics},emptyLoadout,(ok,label)=>assert.ok(ok,label));
 assert.equal(f.G.time,previousTime);assert.equal(f.G.level,previousLevel);assert.deepEqual(rows.map(r=>r.kind),['drink','drop']);
});
