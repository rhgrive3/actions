import test from 'node:test';
import assert from 'node:assert/strict';
import { ShooterAccuracy } from '../runtime/shooter-accuracy.mjs';
const frame = 1/60;
test('S3 Splattershot angular bias .01->.25 over successful rounds', () => {
  const a = new ShooterAccuracy();
  const sampled = Array.from({length: 30}, () => a.shot(true, null));
  assert.equal(sampled[0], .01);
  assert.ok(Math.abs(sampled[23] - .24) < 1e-10);
  assert.equal(sampled[24], .25);
  assert.equal(sampled[29], .25);
});
test('recovery waits six elapsed frames after the last shot then decays at 1.5pp per frame', () => {
  const a = new ShooterAccuracy();
  for(let i=0;i<24;i++) a.shot(true,null);
  for(let i=0;i<6;i++) a.advance(frame);
  assert.ok(Math.abs(a.chance(true,null)-.25)<1e-10);
  a.advance(frame);
  assert.ok(Math.abs(a.chance(true,null)-.235)<1e-10);
  for(let i=0;i<30;i++)a.advance(frame);
  assert.equal(a.chance(true,null),.01);
});
test('40% jump bias and 25F->70F recovery independent of standing state',()=>{
  const a=new ShooterAccuracy();
  assert.equal(a.chance(false,0),.4);
  assert.equal(a.chance(true,25/60),.4);
  assert.ok(a.chance(true,45/60)<.4);
  assert.equal(a.chance(true,70/60),.01);
});
test('#198 second successful round uses 2%, and the six-frame gate holds at 3%', () => {
  const a = new ShooterAccuracy();
  assert.ok(Math.abs(a.shot(true,null)-.01)<1e-12);
  assert.ok(Math.abs(a.shot(true,null)-.02)<1e-12);
  for(let i=0;i<6;i++) a.advance(frame);
  assert.ok(Math.abs(a.chance(true,null)-.03)<1e-12);
});
test('#198 idle recovery is the same for 30, 60, 120 and 144 Hz frame steps', () => {
  const expected = .25 - (20 - 6) * .015;
  for(const step of [1/30, 1/60, 1/120, 1/144]) {
    const a = new ShooterAccuracy();
    for(let i=0;i<24;i++) a.shot(true,null);
    const n = Math.round(20 / 60 / step);
    for(let i=0;i<n;i++) a.advance(step);
    assert.ok(Math.abs(a.chance(true,null)-expected)<1e-9, `step ${step}`);
  }
});
