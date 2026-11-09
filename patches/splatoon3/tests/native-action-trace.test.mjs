import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gzipSync} from 'node:zlib';
import {nativeTraceFixture} from './native-action-trace-fixture.mjs';
import {requireFrozenTrace} from './native-action-trace-binding.mjs';
const f=await nativeTraceFixture();
test.after(()=>f.close());
test('all 65 production main actors emit native action traces with full tick inputs and accepted packet snapshots',async()=>{
 assert.equal(f.records.length,65);assert.equal(new Set(f.records.map(r=>r.id)).size,65);
 const missed=[],trace=[],hitFamilies=new Set();
 for(const r of f.records){const t=f.run(r.id);const births=t.frames.flatMap(frame=>frame.births),fires=t.frames.flatMap(frame=>frame.fires),hits=t.frames.flatMap(frame=>frame.hits);
  if(!births.length&&r.id!=='charger')missed.push(r.id);if(hits.length)hitFamilies.add(r.family);
  if(r.id==='shooter')assert.ok(t.frames.some(x=>x.after.resources.recoverStopRemaining>0),'actual resource stop is recorded');
  if(r.id==='charger'){const flightBirths=t.frames.flatMap(x=>x.flightBirths);assert.equal(births.length,0,'legacy charger uses the separate flight queue');assert.ok(flightBirths.length&&fires.length&&hits.length,'native finite flight, fire and contact');assert.ok(flightBirths.every(j=>j.owner===1&&j.weapon==='charger'&&!j.ghost&&j.speed>0&&j.range>0));}
  assert.ok(t.initial.alive&&t.initial.grounded&&t.initial.ink===100,r.id+' initial');
  assert.equal(t.frames.length,165);assert.equal(t.packets.length,55);assert.equal(t.accepted.length,55);
  assert.ok(t.accepted.every(x=>x.accepted&&x.snapshot),r.id+' received native snapshot');
  assert.ok(t.frames.every(x=>x.input.fire===(x.tick<=120)&&Number.isFinite(x.after.ink)),r.id+' complete input/resources');
  assert.ok(births.every(p=>p.owner===1&&(p.netId===null||Number.isSafeInteger(p.netId)&&p.netId>0)&&p.ghost===false&&p.pos?.every(Number.isFinite)&&p.velocity?.every(Number.isFinite)),r.id+' native birth');
  assert.ok(fires.every(e=>e.weapon===r.id),r.id+' native fire identity');
  assert.ok(t.frames.flatMap(x=>x.wireBirths).every(p=>Number.isSafeInteger(p.netId)&&p.netId>0),r.id+' native published birth identity');
  trace.push(t);console.log('NATIVE_ACTION_TRACE',r.id,r.family,'births',births.length,'fires',fires.length,'contacts',hits.length,'packets',t.packets.length);
 }
 assert.deepEqual(missed,[],'all non-hitscan records produce a native projectile in the ordinary input trace');
 assert.ok(hitFamilies.size>0,'native projectile contact causes a real hit');
 const serialized=JSON.stringify({schema:1,source:'035233299348e5c3527f6106b98e721ed2dfd011',records:f.records,traces:trace});
 // #1975 adds one native 'weapon:melee' source receipt per Splatana swing. Only
 // those rows are removed (and the ordered wire sequence closed up again)
 // before the immutable corpus comparison; every other byte must still match.
 const melee=e=>Array.isArray(e)&&e[1]==='ev'&&e[2]==='weapon:melee';
 const frozenView=JSON.parse(serialized);
 frozenView.traces.forEach((t,i)=>{
  const id=frozenView.records[i].id,rows=t.packets.flatMap(p=>p.e||[]),meleeRows=rows.filter(melee);
  assert.equal(meleeRows.length>0,/^s3-saber-/.test(id),id+' native melee receipt only for Splatanas');
  if(!meleeRows.length)return;
  let seq=rows[0].at(-1)-1;
  for(const p of t.packets){if(!p.e)continue;p.e=p.e.filter(e=>!melee(e));if(!p.e.length){delete p.e;delete p.r;continue;}
   for(const e of p.e)e[e.length-1]=++seq;}
 });
 // The 2026-11-09 Dualies aim stance (dualies-stance-spread-adapter.mjs) moves
 // only Dualies muzzles. Those records are compared from a composition without
 // that one pass; the default composition must still differ for them, and
 // every other record above is the default production composition. With a
 // built site the prior composition comes from source (a site holds only the
 // default composition).
 const spreadIds=frozenView.records.filter(r=>r.family==='dualies').map(r=>r.id);
 assert.equal(spreadIds.length,6);
 const prior=await nativeTraceFixture({compositionOptions:{dualiesStanceSpread:false}});
 try{for(const id of spreadIds){const i=frozenView.records.findIndex(r=>r.id===id),t=JSON.parse(JSON.stringify(prior.run(id)));
  assert.notDeepEqual(frozenView.traces[i],t,id+' default composition applies the Dualies stance');frozenView.traces[i]=t;}}
 finally{prior.close();}
 requireFrozenTrace(JSON.stringify(frozenView),new URL('./fixtures/native-action-trace-035.json.gz',import.meta.url));
 if(process.env.INKWAVE_NATIVE_TRACE_OUTPUT)fs.writeFileSync(process.env.INKWAVE_NATIVE_TRACE_OUTPUT,gzipSync(serialized,{level:9}));
});
test('two legal Charger inputs yield an identical received packet before distinct native births',()=>{
 const a=f.run('s3-charger-quick',{hold:0,tail:18,inputAt:t=>t===1});
 const b=f.run('s3-charger-quick',{hold:0,tail:18,inputAt:t=>t===2});
 assert.deepEqual(a.initial,b.initial);assert.deepEqual(a.packets[0],b.packets[0]);
 assert.equal(a.accepted[0].accepted,true);assert.equal(b.accepted[0].accepted,true);
 assert.deepEqual(a.accepted[0].sourceRow,b.accepted[0].sourceRow);
 assert.deepEqual(a.frames.filter(x=>x.births.length).map(x=>x.tick),[9]);
 assert.deepEqual(b.frames.filter(x=>x.births.length).map(x=>x.tick),[10]);
 assert.notDeepEqual(a.frames[8].births[0].velocity,b.frames[9].births[0].velocity);
});
