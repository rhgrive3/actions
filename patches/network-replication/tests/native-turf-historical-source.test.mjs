// Frozen historical source control. This test intentionally loads authored source;
// the separate current replay tests exercise generated modules without fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {nativeTurfProbe} from './native-turf-replay-fixture.mjs';

if (process.env.INKWAVE_BUILT_SITE) throw Error('Historical replay control requires source mode; omit it from emitted test selection');
const oldRow=r=>[r.tick,r.dt,r.time,r.bits,r.effective,...(r.resourceBody||[...r.position,r.vy,r.form==='squid'?1:0]),...r.aim,...r.move,r.resources?1:0,r.seq,r.tick];

test('historical actual replay rejects the first legitimate native initial-spawn frame',async()=>{
 const frozen=new URL('./fixtures/native-charger-9d8efc/',import.meta.url);
 for(const [file,digest] of [['native-charger-input.mjs','da1610b41a3231528a0787fc29a6317aa42429010bee37e3533fa2d1b24e2111'],['native-charger-replay.mjs','7f2439e75e98af87a2aec312c6d0e875fcf8fd6d02c553efa19a33e64a73b463']])
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,frozen))).digest('hex'),digest,'pinned historical source');
 const p=await nativeTurfProbe('charger',{historic:true});try{
  const {f,actor}=p;f.installNativeChargerReplay(f);
  const t=f.createNativeChargerReplay(actor,{position:actor.pos.clone(),yaw:actor.yaw,time:f.G.time});assert.ok(t);
  p.step();const r=p.rows[0],row=oldRow(r);
  assert.equal(r.matchState,'intro');assert.equal(r.phaseBefore,'aim');assert.equal(r.resources,0);assert.equal(r.effective,null);assert.equal(r.life,1);
  assert.equal(f.advanceNativeChargerReplay(t,[row]),false);
  const old=f.nativeChargerReplayState(t);assert.equal(old.next,1);assert.equal(old.error,'Native input requires another action owner');
  console.log(JSON.stringify({scope:'frozen 9d8efc native replay against actual 0352332 Match/Actor input; no renderer',row,error:old.error}));
 }finally{p.dispose();}
});
