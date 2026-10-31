// Pure calling-convention regression: no Character, Actor, geometry or renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime/walk.mjs',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../../local-quality/queue-render-20261030-adapter.mjs',import.meta.url),'utf8');
assert(adapter.includes('  _footPose(f, dt) {'));
assert(adapter.includes('f.pitch = damp(f.pitch, 0, 12, dt);'));
const wrapper=source.match(/C\._footPose=(function\(f\)\{return state\(this\)\.active\?footPose\(this,f\):oldPose\.apply\(this,arguments\);\});/);
assert(wrapper,'native fallback must forward the actual call arguments');
const code=wrapper[1],before=code.replace('oldPose.apply(this,arguments)','oldPose.call(this,f)');
function fixture(expression=code,active=false){const calls=[],returned={identity:true};let thrown=null;
 const state=()=>({active}),oldPose=function(f,dt){calls.push({receiver:this,args:[...arguments]});if(thrown)throw thrown;f.value=f.value+(0-f.value)*(1-Math.exp(-12*dt));return returned;};
 const footPose=(receiver,f)=>{calls.push({active:true,receiver,args:[f]});return returned;};
 return {fn:vm.runInNewContext('('+expression+')',{state,oldPose,footPose}),calls,returned,throwNext:error=>{thrown=error;}};
}
test('native fallback preserves arity, receiver, all arguments and returned identity',()=>{const f=fixture(),receiver={},record={value:1};assert.equal(f.fn.length,1);assert.equal(f.fn.call(receiver,record,1/60,'extra'),f.returned);assert.equal(f.calls.length,1);assert.equal(f.calls[0].receiver,receiver);assert.deepEqual(f.calls[0].args,[record,1/60,'extra']);assert.equal(record.value,Math.exp(-12/60));});
test('before counterfactual drops dt and becomes NaN; unchanged numeric fallback stays finite after forwarding',()=>{const old=fixture(before),bad={value:1};old.fn.call({},bad,1/60);assert.equal(old.calls[0].args[1],undefined);assert(Number.isNaN(bad.value));const next=fixture(),good={value:1};next.fn.call({},good,1/60);assert(Number.isFinite(good.value));});
test('zero elapsed dt stays zero and makes no numeric advance',()=>{const f=fixture(),record={value:1};f.fn.call({},record,0);assert.equal(f.calls[0].args[1],0);assert.equal(record.value,1);});
test('nondefault elapsed dt is forwarded rather than replaced by a fixed step',()=>{const f=fixture(),record={value:1};f.fn.call({},record,1/30);assert.equal(record.value,Math.exp(-12/30));assert.notEqual(record.value,Math.exp(-12/60));});
test('active dispatch is unchanged and native exception identity survives',()=>{const active=fixture(code,true),receiver={},record={value:1};assert.equal(active.fn.call(receiver,record,1/60),active.returned);assert.equal(active.calls.length,1);assert.equal(active.calls[0].active,true);assert.equal(active.calls[0].receiver,receiver);assert.deepEqual(active.calls[0].args,[record]);assert.equal(record.value,1);const f=fixture(),sentinel={nativeException:true};f.throwNext(sentinel);assert.throws(()=>f.fn.call(receiver,record,1/60),error=>error===sentinel);assert.equal(f.calls.length,1);});
