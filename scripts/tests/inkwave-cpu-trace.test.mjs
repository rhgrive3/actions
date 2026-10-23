import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeGcTrace} from '../lib/inkwave-cpu-trace.mjs';
import {installCpuStateHash} from '../lib/inkwave-cpu-state-hash.mjs';
test('gameplay hash rejects absent/nonfinite fields and preserves signed zero',()=>{
 for(const value of [undefined,NaN,Infinity,-Infinity])assert.throws(()=>installCpuStateHash({}).number(value),/Nonfinite or missing/);
 const a=installCpuStateHash({}),b=installCpuStateHash({});a.number(0);b.number(-0);assert.notEqual(a.value,b.value);
 const x=installCpuStateHash({}),y=installCpuStateHash({});for(const n of [1,true,.125,-2]){x.number(n);y.number(n);}assert.equal(x.value,y.value);
});
test('GC pause union clips measured renderer window and rejects background/nested double counts',()=>{
 const e=(name,ts,dur,tid=1)=>({name,ts,dur,tid,pid:2,ph:'X'});
 const events=[e('inkwave-cpu-start',100),e('inkwave-cpu-end',1100),e('MinorGC',90,210),e('V8.GCScavenger',110,50),e('MajorGC',900,400),e('MinorGC',500,300,3),e('V8.GC_BACKGROUND_MARKING',400,300)];
 assert.deepEqual(summarizeGcTrace(events),{status:'observed',events:3,pauses:2,pauseMs:.4,maxPauseMs:.2,windowMs:1});
 assert.throws(()=>summarizeGcTrace([]),/Missing measured/);
 assert.equal(summarizeGcTrace(events.slice(0,2)).pauseMs,0);
});
