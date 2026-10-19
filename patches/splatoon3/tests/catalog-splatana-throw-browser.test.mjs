import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

test('catalog browser post-wave probe exercises actual Actor inputs and preserves the existing synchronous helper boundary',async t=>{
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
 const marker='// BEGIN_SPLATANA_POST_WAVE_THROW_PROBE';
 const block=source.split(marker)[1].split('// END_SPLATANA_POST_WAVE_THROW_PROBE')[0];
 assert(source.indexOf(marker)>source.indexOf("const {CANONICAL_KITS}"));
 const factory=source.slice(source.indexOf('      class DisplayCharacter'),source.indexOf('      const {CANONICAL_KITS}'));
 assert(!factory.includes('await '),'legacy fixture extraction remains synchronous');
 assert(!/state\.(?:stop|pending)\s*=(?!=)/.test(block),'probe does not author its own recovery or wave');
 assert(!/\.form\s*=(?!=)/.test(block),'probe does not bypass actual Actor input admission');
 assert(source.includes('splatanaThrowChecks, chargeKeepChecks'),'browser receipt exposes all six checks');
 assert(!block.includes('while('),'browser waits are finite even when a weapon clock stops');
 assert.equal((block.match(/i<120/g)||[]).length,2,'both pending-wave and recovery waits have explicit tick caps');
 assert(block.includes('pending wave boundary reached within 120 ticks'));
 assert(block.includes('existing recovery expires within 120 ticks'));
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const makeActor=new Function('THREE','Actor','Player',factory+';return makeActor;')(f.THREE,f.Actor,f.PLAYER);
 const run=new Function('api','Level','G','makeActor','check',block+';return splatanaThrowChecks;');
 const saved=Object.fromEntries(['level','physics','paint','actors','time'].map(k=>[k,f.G[k]]));
 const rows=run(f,f.Level,f.G,makeActor,(value,message)=>assert.ok(value,message));
 for(const [key,value] of Object.entries(saved))assert.equal(f.G[key],value,'restores '+key);
 assert.equal(f.G.projectiles.list.length,0);assert.equal(f.G.projectiles.bombs.length,0);
 assert.equal(rows.length,6);assert.equal(rows.filter(r=>r.phase==='pre-wave'&&r.cancelled&&r.waves===0).length,3);
 assert.equal(rows.filter(r=>r.phase==='post-wave'&&r.blockedTicks>0&&r.waves===1).length,3);
 const workflow=fs.readFileSync(new URL('../../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 for(const name of ['catalog-splatana-throw-admission','catalog-splatana-throw-browser']) {
  const lines=workflow.split('\n').filter(l=>l.includes(name+'.test.mjs'));
  assert.equal(lines.length,2,name+' explicit source and emitted commands');
  assert(lines.some(l=>l.includes('INKWAVE_BUILT_SITE=.ci-scratch/seven-site')),name+' exact emitted namespace');
 }
 t.diagnostic(JSON.stringify(rows));
});
