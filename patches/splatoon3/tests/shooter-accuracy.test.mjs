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
