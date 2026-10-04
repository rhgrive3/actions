import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateResourceResult, restoreContextAfterEvent } from '../check-inkwave-resource-render.mjs';
const good = () => ({
  rows: ['initial','dynamic-motion','static-demotion','stage-roots','light-change','shadow-resize','offscreen-actor','after-allocation-probe','context-restored']
    .map(name => ({ name, rebuilds: 1, pixels: { pixels: 480*360, changedBytes: 0, changedPixels: 0, totalDifference: 0 } })),
  sensitivity: { changedPixels: 100 }, contextRestored: true, disposed: true, gpu: { webgl: 'WebGL 2.0 (test)', renderer: 'test' },
  allocations: [2048,4096].map(size => ({ size, textures: 0, complete: true, colorAttachment: 'NONE', depthAttachment: 'RENDERBUFFER', removedColorBytes: size*size*4 })),
  reflection: [['high',false,6,.4],['ultra',false,6,.5],['high',true,3,.2],['ultra',true,3,.2],['low',true,0,0]]
    .map(([quality,touch,calls,scale]) => ({ quality,touch,calls,frames:6,width:calls?Math.max(64,Math.round(480*scale)):0,height:calls?Math.max(64,Math.round(360*scale)):0 }))
});
test('resource GPU gate requires complete pixel, allocation and cadence evidence', () => {
  assert.equal(validateResourceResult(good()).shadowPixelEqualScenarios, 9);
  for (const mutate of [r=>r.rows.pop(),r=>r.rows[0].pixels.changedBytes=1,r=>r.rows[0].pixels.pixels=1,r=>r.allocations[1].textures=1,
    r=>r.allocations[0].complete=false,r=>r.allocations[0].removedColorBytes=0,r=>r.reflection[2].calls=6,r=>r.reflection[4].width=64,
    r=>r.contextRestored=false,r=>r.disposed=false,r=>r.sensitivity.changedPixels=0,r=>r.gpu.renderer='']) {
    const r = good(); mutate(r); assert.throws(() => validateResourceResult(r));
  }
});
test('resource actual GPU probe is a required exact-source CI gate and receipt', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
  assert.match(workflow, /check-inkwave-resource-render\.mjs.*--exact-source/);
  assert.ok(workflow.includes("'resources/resource-render-result.json'"));
  const probe = fs.readFileSync(new URL('../check-inkwave-resource-render.mjs', import.meta.url), 'utf8');
  for (const call of ['readRenderTargetPixels', 'getFramebufferAttachmentParameter', 'loseContext()', 'restoreContext()', "'HEAD:' + file", 'manifest.artifacts[key]']) assert.ok(probe.includes(call), call);
});


test('context restoration is a new task after the loss event, not an event microtask', async () => {
  let dispatching = true, called = false;
  const pending = restoreContextAfterEvent({ restoreContext() {
    assert.equal(dispatching, false, 'WEBGL_lose_context requires loss dispatch to have completed'); called = true;
  } });
  await Promise.resolve(); assert.equal(called, false, 'must not restore at the loss-event microtask checkpoint');
  dispatching = false; await pending; assert.equal(called, true);
});
