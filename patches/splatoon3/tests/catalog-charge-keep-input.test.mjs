import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const positive=[['s3-charger-quick',140],['s3-charger-long',140],['s3-charger-keeper',140],['s3-charger-keeper',12],['s3-spinner-serein',140],['s3-spinner-serein',12],['s3-stringer-short',140]];
for(const hz of [30,60,120])test(`ordinary newer Squid input reaches only supported charge keep at ${hz}Hz`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 for(const [id,chargeTicks]of positive){
  const a=f.make(id),clock=new FixedClock();let before,stored,after,partial;
  a.intent.fire=true;
  while(clock.ticks<chargeTicks+6)clock.advance(1/hz,dt=>{
   if(clock.ticks===chargeTicks){before=a.ink;partial=a.weaponRunner.charge;a.intent.squid=true;}
   f.G.time+=dt;a.update(dt);
   if(clock.ticks===chargeTicks){stored=a.weaponRunner.catalogState?.stored;after=a.ink;}
  });
  assert.equal(a.form,'squid',id);assert.ok(stored,id+' stored');assert.equal(after,before,id+' no double payment');
  assert.equal(a.weaponRunner.charging,false);assert.equal(a.weaponRunner.catalogState.chargeF,0);
  if(chargeTicks===12)assert(partial>0&&partial<1,id+' partial');
 }
 for(const [id,chargeTicks]of [['s3-charger-quick',12],['s3-charger-long',12],['s3-charger-normalscope',140],['s3-charger-longscope',140],['s3-charger-light',140],['s3-charger-pencil',140],['s3-spinner-hyper',180],['s3-stringer-normal',140]]){
  const a=f.make(id),clock=new FixedClock();a.intent.fire=true;
  while(clock.ticks<chargeTicks+6)clock.advance(1/hz,dt=>{if(clock.ticks===chargeTicks)a.intent.squid=true;f.G.time+=dt;a.update(dt);});
  assert.equal(a.form,'kid',id+' existing held-fire busy gate');assert.equal(a.weaponRunner.catalogState.stored,null,id+' no unsupported keep');
 }
});
test('catalogue keep uses sourced lifetime, release, redive and no duplicated ink reservation',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 for(const [id,life]of [['s3-charger-quick',75],['s3-charger-long',75],['s3-charger-keeper',300]]){
  const a=f.make(id);a.intent.fire=true;f.tick(a,140);const ink=a.ink;a.intent.squid=true;f.tick(a);
  assert.ok(a.weaponRunner.catalogState.stored);assert(Math.abs(a.weaponRunner.catalogState.stored.remaining-(life-1)/60)<1e-8);
  f.tick(a,life-2);assert.ok(a.weaponRunner.catalogState.stored);f.tick(a);assert.equal(a.weaponRunner.catalogState.stored,null);
  a.intent.squid=false;a.intent.fire=false;f.tick(a,3);assert.equal(a.weaponRunner.catalogState.chargeF,0);
  const b=f.make(id);b.intent.fire=true;f.tick(b,140);const paidInk=b.ink;b.intent.squid=true;f.tick(b,3);
  b.intent.squid=false;f.tick(b,8);assert.equal(b.weaponRunner.charge,1);assert(b.ink>=paidInk-1e-8);
  b.intent.squid=true;f.tick(b,2);assert.ok(b.weaponRunner.catalogState.stored);assert.equal(b.form,'squid');
  b.intent.squid=false;f.tick(b,8);const before=f.G.projectiles.list.length;b.intent.fire=false;f.tick(b,3);
  assert.equal(f.G.projectiles.list.length-before,1,id+' one release projectile');assert.equal(b.weaponRunner.catalogState.stored,null);assert(b.ink>=paidInk-1e-8);
 }
});
test('input priority, partial discard and existing pending attack ownership remain unchanged',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const a=f.make('s3-charger-quick');a.intent.fire=true;f.tick(a,8);a.intent.fire=false;a.intent.squid=true;f.tick(a,2);
 assert.equal(a.form,'squid');assert.equal(a.weaponRunner.catalogState.stored,null);assert.equal(a.weaponRunner.catalogState.chargeF,0);
 const b=f.make('s3-charger-quick');b.intent.fire=true;f.tick(b,60);b.intent.fire=false;f.tick(b,1);b.intent.squid=true;b.intent.fire=true;f.tick(b);
 assert.equal(b.form,'kid','same-tick newer/equal Fire still wins');assert.equal(b.weaponRunner.catalogState.stored,null);
 const c=f.make('s3-saber-lite');c.intent.fire=true;f.tick(c,30);c.intent.fire=false;f.tick(c);assert.ok(c.weaponRunner.catalogState.pending);c.intent.squid=true;c.intent.fire=true;f.tick(c);assert.equal(c.form,'kid','unrelated admitted attack remains busy');
});

test('browser charge-keep receipt block executes actual Actor input without direct squid-form writes',async()=>{
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
 const block=source.split('// BEGIN_CHARGE_KEEP_INPUT_PROBE')[1].split('// END_CHARGE_KEEP_INPUT_PROBE')[0];
 assert(!/\.form\s*=\s*['"]squid['"]/.test(block));
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const factory=source.slice(source.indexOf('      class DisplayCharacter'),source.indexOf("      const {Level}=await import('/src/world/level.js');"));
 const makeActor=new Function('THREE','Actor','Player',factory+';return makeActor;')(f.THREE,f.Actor,f.PLAYER);
 assert(source.includes("const {Level}=await import('/src/world/level.js');"));
 const run=new Function('api','Level','G','makeActor','check',block+';return chargeKeepChecks;');
 const rows=run(f,f.Level,f.G,makeActor,(value,message)=>assert.ok(value,message));
 assert.equal(rows.length,4);assert.equal(rows.filter(x=>x.releaseProjectiles===1).length,3);assert.equal(rows.at(-1).stored,false);
});
