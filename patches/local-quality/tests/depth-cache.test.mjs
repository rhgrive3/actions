import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceFixture } from './resource-fixture.mjs';
function mockGL() {
  const gl = { READ_FRAMEBUFFER_BINDING: 1, DRAW_FRAMEBUFFER_BINDING: 2, RENDERBUFFER_BINDING: 3, READ_FRAMEBUFFER: 4, DRAW_FRAMEBUFFER: 5,
    FRAMEBUFFER: 6, RENDERBUFFER: 7, DEPTH_ATTACHMENT: 8, NONE: 0, FRAMEBUFFER_COMPLETE: 9, DEPTH_COMPONENT24: 24, DEPTH_COMPONENT16: 16, DEPTH_COMPONENT32F: 32,
    lost: false, complete: true, bindings: new Map([[1, {}], [2, {}], [3, {}]]), framebuffers: new Set(), renderbuffers: new Set(), allocations: [], deleted: [],
    isContextLost() { return this.lost; }, getParameter(k) { return this.bindings.get(k); },
    createFramebuffer() { const o = {}; this.framebuffers.add(o); return o; }, createRenderbuffer() { const o = {}; this.renderbuffers.add(o); return o; },
    bindFramebuffer(k, o) { if (k === 6 || k === 4) this.bindings.set(1, o); if (k === 6 || k === 5) this.bindings.set(2, o); },
    bindRenderbuffer(k, o) { this.bindings.set(3, o); }, renderbufferStorage(...a) { this.allocations.push(a); },
    framebufferRenderbuffer(...a) { this.attachment = a; }, drawBuffers(a) { this.draw = a; }, readBuffer(a) { this.read = a; },
    checkFramebufferStatus() { return this.complete ? 9 : 0; }, isFramebuffer(o) { return this.framebuffers.has(o); }, isRenderbuffer(o) { return this.renderbuffers.has(o); },
    deleteFramebuffer(o) { this.framebuffers.delete(o); this.deleted.push(o); }, deleteRenderbuffer(o) { this.renderbuffers.delete(o); this.deleted.push(o); } };
  return gl;
}
let api; test.before(async () => { api = await resourceFixture(); });
test('depth-only allocations preserve all bindings, native formats and idempotent ownership', () => {
  for (const [type, format] of [[api.THREE.UnsignedIntType, 24], [api.THREE.FloatType, 32], [api.THREE.UnsignedShortType, 16]]) {
    const gl = mockGL(), before = new Map(gl.bindings), c = api.createDepthCache(gl, 2048, 2048, type);
    assert.equal(c.colorBytes, 0); assert.deepEqual(gl.allocations, [[7, format, 2048, 2048]]);
    assert.deepEqual([...gl.draw], [0]); assert.equal(gl.read, 0); assert.deepEqual(gl.bindings, before);
    assert.ok(c.valid()); c.dispose(); c.dispose(); assert.equal(gl.deleted.length, 2); assert.equal(c.valid(), false);
  }
});
test('allocation failure/context loss restores state and fails closed without retaining partial resources', () => {
  const gl = mockGL(), before = new Map(gl.bindings); gl.complete = false;
  assert.equal(api.createDepthCache(gl, 32, 32), null); assert.deepEqual(gl.bindings, before);
  assert.equal(gl.framebuffers.size, 0); assert.equal(gl.renderbuffers.size, 0);
  gl.lost = true; assert.equal(api.createDepthCache(gl, 32, 32), null); assert.equal(gl.allocations.length, 1);
});
test('native ShadowCache replacement reuses, resizes, releases and unhooks on disposal', () => {
  const gl = mockGL(), listeners = new Map(), original = () => {}, renderer = { shadowMap: { render: original }, getContext: () => gl,
    domElement: { addEventListener: (n, cb) => listeners.set(n, cb), removeEventListener: n => listeners.delete(n) }, properties: { get: o => o } };
  const cache = new api.ShadowCache(renderer);
  cache._ensureCache(2048, 2048, api.THREE.UnsignedIntType); const first = cache.cache;
  cache._ensureCache(2048, 2048, api.THREE.UnsignedIntType); assert.equal(cache.cache, first);
  cache._ensureCache(4096, 4096, api.THREE.UnsignedIntType); assert.equal(first.valid(), false); assert.equal(gl.framebuffers.size, 1);
  listeners.get('webglcontextrestored')(); assert.equal(cache.cache, null); assert.ok(cache.dirty); assert.equal(gl.framebuffers.size, 0);
  cache._ensureCache(32, 32, api.THREE.UnsignedIntType); assert.equal(cache._fbo(cache.cache), cache.cache.framebuffer);
  cache.dispose(); cache.dispose(); assert.equal(gl.framebuffers.size, 0); assert.equal(listeners.size, 0); assert.equal(renderer.shadowMap.render, original);
});
