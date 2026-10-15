import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { boundedDiagnostic, createFocusHistory, createOperationTrace } from '../lib/inkwave-rematch-diagnostics.mjs';

test('operation trace preserves returned values and the exact original input error without retry', async () => {
  let now = 0, calls = 0;
  const trace = createOperationTrace(2, () => now);
  const value = {};
  assert.equal(await trace.run('success', () => { now = 7; return value; }), value);
  assert.equal(trace.entries[0].elapsedMs, 7);
  const error = new Error('original touch dispatch timeout');
  await assert.rejects(trace.run('tap', () => { calls++; now = 37; throw error; }), e => e === error);
  assert.equal(calls, 1);
  assert.equal(trace.entries[1].status, 'failed');
  assert.equal(trace.entries[1].elapsedMs, 30);
  assert.equal(trace.entries[1].error, error.message);
  await trace.run('last', () => null);
  assert.deepEqual(trace.entries.map(e => e.name), ['tap', 'last']);
});

test('read-only failure probes report success, rejection and a hung browser within their own budget', async () => {
  assert.deepEqual(await boundedDiagnostic(() => ({ menu: 'main' })), { status: 'captured', value: { menu: 'main' } });
  assert.deepEqual(await boundedDiagnostic(() => { throw new Error('closed'); }), { status: 'unavailable', error: 'closed' });
  let reject;
  const pending = new Promise((resolve, fail) => { reject = fail; });
  assert.deepEqual(await boundedDiagnostic(() => pending, 5), { status: 'timed-out', timeoutMs: 5 });
  reject(new Error('late browser failure'));
  await new Promise(resolve => setImmediate(resolve));
});

test('lifecycle diagnostics keep real tap timeout and original assertions and save failure before probing', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs', import.meta.url), 'utf8');
  const tapBody = source.slice(source.indexOf('const tap = async'), source.indexOf('const menuIs ='));
  assert.match(tapBody, /operationTrace\.run\('touch: ' \+ id/);
  assert.match(tapBody, /page\.locator\(sel\)\.tap\(\{ timeout: 120000 \}\)/);
  assert.equal((tapBody.match(/\.tap\(/g) || []).length, 1, 'dispatch one real gesture');
  assert.doesNotMatch(tapBody, /force:|\.click\(/, 'native actionability and stable positioning remain required');
  assert.match(source, /rangeRound\.simulated\.state === 'playing' && !rangeRound\.simulated\.result && rangeRound\.simulated\.menu === null/);
  assert.match(source, /after\.range === false && after\.hudRange === false && \(after\.timer === '3:00' \|\| after\.timer === '2:59'\) && Number\.isFinite\(after\.time\)/);
  const catchBlock = source.slice(source.lastIndexOf('} catch (e) {'));
  assert.ok(catchBlock.indexOf('writeResult();') < catchBlock.indexOf('boundedDiagnostic(snap)'));
  assert.match(catchBlock, /failures\.push\(\{ round: 'fatal', message: String\(e\?\.stack \|\| e\)\.slice\(0, 2000\) \}\)/);
  assert.match(source, /activeRound = rangeRound;[\s\S]+rangeRound\.start = await snap/);
  assert.doesNotMatch(catchBlock, /page\.tap|\.click\(/);
});

const source=fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs',import.meta.url),'utf8');
const snapshot=()=>({ringOn:true,ringVisible:false,ringOnFocus:true,focusConnected:true,
  uiDiagnostics:{focus:{menuId:'play'},ring:{opacity:'0',animations:[{pending:true,startTime:null,currentTime:0}]},
    document:{performanceNow:123,timelineTime:120},frameDriver:{platform:{frames:10}}}});
test('history preserves first observation and bounded tail with explicit omissions and totals',()=>{
 const h=createFocusHistory(3);
 for(let i=0;i<8;i++)h.record(snapshot(),{winner:i%2?'timeout':'frame',snapshotEndedMs:i*1000,browserFrameTime:i%2?null:i*16});
 assert.equal(h.history.sampleCount,8);assert.equal(h.history.droppedSamples,5);
 assert.equal(h.history.frameWins,4);assert.equal(h.history.timeoutWins,4);
 assert.deepEqual(h.history.samples.map(s=>s.sample),[1,7,8]);
 assert.deepEqual(h.history.samples.map(s=>s.snapshotEndedMs),[0,6000,7000]);
});
test('observations are immutable copies and never retain prior history recursively',()=>{
 const h=createFocusHistory(),s=snapshot();h.record(s,{winner:'frame'});s.focusHistory=h.history;
 s.uiDiagnostics.ring.opacity='1';s.uiDiagnostics.ring.animations[0].pending=false;
 h.record(s,{winner:'timeout'});
 assert.equal(h.history.samples[0].ring.opacity,'0');assert.equal(h.history.samples[0].ring.animations[0].pending,true);
 assert.equal(h.history.samples[1].ring.opacity,'1');assert.doesNotThrow(()=>JSON.stringify(h.history));
 assert.equal(h.history.samples[1].focusHistory,undefined);
});
test('bounds and absent optional diagnostics are handled explicitly',()=>{
 for(const limit of [-1,0,1,129,Infinity,2.5])assert.throws(()=>createFocusHistory(limit),RangeError);
 const h=createFocusHistory();h.record({ringVisible:false},{winner:'timeout'});
 assert.equal(h.history.samples[0].ring,null);assert.equal(h.history.samples[0].document,null);
});
const waitSource=source.slice(source.indexOf('const waitForFocusFrame ='),source.indexOf('const alignedFocusSnapshot ='));
test('actual frame wait reports RAF timestamp and clears the unchanged host timeout',async()=>{
 let cleared=0,requested=0;
 const wait=vm.runInNewContext(waitSource+'\nwaitForFocusFrame;',{
  page:{evaluate:f=>f()},requestAnimationFrame:f=>{requested++;f(42.5)},
  setTimeout:(_f,ms)=>{assert.equal(ms,1000);return 9},clearTimeout:id=>{assert.equal(id,9);cleared++}
 });
 const result=await wait();assert.equal(result.winner,'frame');assert.equal(result.browserFrameTime,42.5);
 assert.equal(requested,1);assert.equal(cleared,1);
});
test('late RAF cannot rewrite a timeout winner or add a second history sample',async()=>{
 let lateFrame;
 const wait=vm.runInNewContext(waitSource+'\nwaitForFocusFrame;',{
  page:{evaluate:f=>f()},requestAnimationFrame:f=>{lateFrame=f},setTimeout:f=>{f();return 9},clearTimeout:()=>{}
 });
 const result=await wait(),h=createFocusHistory();h.record(snapshot(),result);lateFrame(77);await Promise.resolve();
 assert.equal(result.winner,'timeout');assert.equal(result.browserFrameTime,null);assert.equal(h.history.sampleCount,1);assert.equal(h.history.timeoutWins,1);
});
test('browser evaluation rejection still fails and cleans up, rather than becoming a timeout pass',async()=>{
 let cleared=0;const error=new Error('page closed');
 const wait=vm.runInNewContext(waitSource+'\nwaitForFocusFrame;',{
  page:{evaluate:()=>Promise.reject(error)},setTimeout:()=>9,clearTimeout:()=>cleared++
 });
 await assert.rejects(wait(),e=>e===error);assert.equal(cleared,1);
});
test('strict wait retains its snapshot, budget, input sequence, and single observation read',()=>{
 const poll=source.slice(source.indexOf('const alignedFocusSnapshot ='),source.indexOf('const check ='));
 assert.equal((poll.match(/await snap\(\)/g)||[]).length,1);
 assert.match(poll,/if \(last.ringOn && last.ringVisible && last.ringOnFocus === true\) return last;/);
 assert.match(poll,/while \(Date.now\(\) - start < 30000\)/);
 assert.match(source,/ringStyle.visibility === 'visible' && ringStyle.display !== 'none' && \+ringStyle.opacity > 0.6/);
 assert.doesNotMatch(poll,/screenshot|keyboard|\.style|cancelAnimationFrame|\.finish\(|\.play\(/);
 const touch=source.indexOf("const menu = (round.menu = await alignedFocusSnapshot('touch-owned menu'));");
 const check=source.indexOf("'touch-owned main-menu button has its native visible focus-aligned selection ring', menu);",touch);
 const key=source.indexOf("await page.keyboard.press('ArrowDown');",check);
 assert(touch>=0&&check>touch&&key>check);
});

test('per-sample animation detail is bounded with omitted count disclosed',()=>{
 const h=createFocusHistory(),s=snapshot();s.uiDiagnostics.ring.animations=Array.from({length:40},(_,i)=>({currentTime:i}));
 h.record(s,{winner:'frame'});const ring=h.history.samples[0].ring;
 assert.equal(ring.animations.length,16);assert.equal(ring.animationCount,40);assert.equal(ring.droppedAnimations,24);
 assert.equal(s.uiDiagnostics.ring.animations.length,40,'original strict snapshot remains untouched');
});

test('existing document snapshot records focus without requiring it in fixtures or changing acceptance',()=>{
 const expression=source.match(/hasFocus: (document\.hasFocus\?\.\(\) \?\? null)/)?.[1];
 assert(expression,'focus is read within the existing document snapshot');
 for(const value of [true,false]){
  let calls=0;const hasFocus=vm.runInNewContext(expression,{document:{hasFocus(){calls++;return value}}});
  assert.equal(hasFocus,value);assert.equal(calls,1);
  const h=createFocusHistory(),s=snapshot();s.uiDiagnostics.document.hasFocus=hasFocus;
  h.record(s,{winner:'frame'});s.uiDiagnostics.document.hasFocus=!value;
  assert.equal(h.history.samples[0].document.hasFocus,value);
 }
 assert.equal(vm.runInNewContext(expression,{document:{}}),null);
 const poll=source.slice(source.indexOf('const alignedFocusSnapshot ='),source.indexOf('const check ='));
 assert.doesNotMatch(poll,/hasFocus/,'document focus is evidence, not a substitute acceptance gate');
});
