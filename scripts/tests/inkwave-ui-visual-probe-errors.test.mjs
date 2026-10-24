import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {checkUiVisualProbes} from '../check-inkwave-hud-authority.mjs';

// Memory-only fault injection: no browser, screenshot generation or disk writes.
async function rejection(promise) {
  let rejected=false, value;
  try {await promise;} catch(error) {rejected=true;value=error;}
  assert.equal(rejected,true,'the probe must reject, including falsy throw values');
  return value;
}
for(const primary of [Error('PRIMARY_CAPTURE'),null,undefined,false,0,'']) {
  for(const mode of ['none','write','cleanup','both']) test(`preserve ${String(primary)} with ${mode} failure`,async t=>{
    const write=Error('SECONDARY_DIAGNOSTIC'),cleanup=Error('SECONDARY_CLEANUP');
    let calls=0,writes=0;
    t.mock.method(fs,'writeFileSync',()=>{writes++;if(mode==='write'||mode==='both')throw write;});
    const page={evaluate:async()=>{calls++;if(calls===1)throw primary;if(calls===3&&(mode==='cleanup'||mode==='both'))throw cleanup;return null;},screenshot:async()=>{}};
    const error=await rejection(checkUiVisualProbes({page,evidence:'/unused-memory-only',sourceSha:'head',contentHash:'hash'}));
    assert.equal(calls,3);assert.equal(writes,1);
    if(mode==='none')assert.equal(error,primary);
    else {
      assert(error instanceof AggregateError);assert.equal(error.cause,primary);
      assert.deepEqual(error.errors,[primary,...(mode==='write'||mode==='both'?[write]:[]),...(mode==='cleanup'||mode==='both'?[cleanup]:[])]);
    }
  });
}
for(const cleanFails of [false,true]) test(`reviewer diagnostic/screenshot dual failure, cleanup=${cleanFails}`,async t=>{
  const primary=Error('PRIMARY_CAPTURE'),write=Error('SECONDARY_DIAGNOSTIC'),cleanup=Error('SECONDARY_CLEANUP'),shot=Error('SECONDARY_SCREENSHOT');
  let calls=0;
  t.mock.method(fs,'writeFileSync',()=>{throw write;});
  const page={evaluate:async()=>{calls++;if(calls===1)throw primary;if(calls===3&&cleanFails)throw cleanup;return null;},screenshot:async()=>{throw shot;}};
  const error=await rejection(checkUiVisualProbes({page,evidence:'/unused-memory-only'}));
  assert(error instanceof AggregateError);assert.equal(error.cause,primary);
  assert.deepEqual(error.errors,[primary,shot,write,...(cleanFails?[cleanup]:[])]);
});
test('diagnostic read, screenshot, write and cleanup failures all retain original identities',async t=>{
  const failures=[Error('PRIMARY_CAPTURE'),Error('SECONDARY_READ'),Error('SECONDARY_SHOT'),Error('SECONDARY_WRITE'),Error('SECONDARY_CLEANUP')];
  let calls=0;
  t.mock.method(fs,'writeFileSync',()=>{throw failures[3];});
  const page={evaluate:async()=>{throw failures[[0,1,4][calls++]];},screenshot:async()=>{throw failures[2];}};
  const error=await rejection(checkUiVisualProbes({page,evidence:'/unused-memory-only'}));
  assert.equal(error.cause,failures[0]);assert.deepEqual(error.errors,failures);
});
function admittedPage(failureAt) {
  const shots=[],cleanup=Error('CLEANUP_ONLY'),primary=Error('ACTUAL_CAPTURE'),positive={viewport:[1280,800]};
  let cleanupCalls=0;
  const errors={hidden:'container/ancestor hidden',opacity:'container/ancestor hidden',offscreen:'ring1: geometry/viewport',stroke:'ring1: stroke hidden','zero-size':'ring1: geometry/viewport',progress:'ring1: inline progress'};
  const page={viewportSize:()=>({width:1280,height:800}),evaluate:async(fn,arg)=>{
    if(fn.name==='inspectFrozenHudSurface')return positive;
    if(fn.name==='inspectSplatlingStages')return {errors:arg.negative?[errors[arg.negative]]:[],negativeApplied:true};
    if(fn.name==='inspectAccuracyReticle')return {errors:arg?[arg==='spread'?'spread':'visibility']:[],negativeApplied:true,geometry:{same:true}};
    const text=fn.toString();
    if(text.includes('s.xh.remove()')){cleanupCalls++;throw cleanup;}
    if(text.includes('__winnerPodiumProbe'))assert.fail('podium must not run after failure');
    return null;
  },screenshot:async options=>{shots.push(options);if(failureAt==='capture'&&!options.path.includes('failure.png'))throw primary;}};
  return {page,shots,cleanup,primary,get cleanupCalls(){return cleanupCalls;}};
}
test('actual capture wrapper rejection survives diagnostic write plus cleanup failure',async t=>{
  const f=admittedPage('capture'),write=Error('WRITE_AFTER_CAPTURE');
  t.mock.method(fs,'writeFileSync',()=>{throw write;});
  const error=await rejection(checkUiVisualProbes({page:f.page,evidence:'/unused-memory-only'}));
  assert.equal(error.cause,f.primary);assert.deepEqual(error.errors,[f.primary,write,f.cleanup]);
  assert.equal(f.cleanupCalls,1);assert.equal(f.shots.length,2);
  assert(f.shots[0].path.endsWith('splatling-reticle-first.png'));
});
test('cleanup-only failure still rejects an otherwise passed probe and retains full coverage',async t=>{
  const f=admittedPage('cleanup'),writes=[];
  t.mock.method(fs,'writeFileSync',(name,bytes)=>writes.push([name,JSON.parse(bytes)]));
  const error=await rejection(checkUiVisualProbes({page:f.page,evidence:'/unused-memory-only'}));
  assert.equal(error,f.cleanup);assert.equal(f.cleanupCalls,1);assert.equal(f.shots.length,8);
  assert.equal(writes.length,2);assert(writes.every(([,receipt])=>receipt.status==='passed'));
  assert.equal(writes[0][1].states.length,4);assert.equal(writes[1][1].stages.length,4);
  assert.equal(writes[1][1].negatives.length,6);
});
test('successful render/probe body and screenshot options are byte-identical to the approved candidate',()=>{
  const after=fs.readFileSync(new URL('../check-inkwave-hud-authority.mjs',import.meta.url),'utf8');
  const body=s=>{const start=s.indexOf('export async function checkUiVisualProbes(');return s.slice(s.indexOf('  // #508',start),s.indexOf('  } catch(error) {',start));};
  assert.equal(crypto.createHash('sha256').update(body(after)).digest('hex'),'a087e4ec49ff0b6974ed36413e69c90902812b13fd3decd76a05662b57bb1b2a');
});
