import test from 'node:test';
import assert from 'node:assert/strict';
import { installResolveObservation } from '../lib/inkwave-resolve-observation.mjs';

const enumNames = ['NONE', 'TEXTURE', 'RENDERBUFFER', 'READ_FRAMEBUFFER', 'DRAW_FRAMEBUFFER', 'FRAMEBUFFER', 'READ_FRAMEBUFFER_BINDING', 'DRAW_FRAMEBUFFER_BINDING', 'RENDERBUFFER_BINDING', 'MAX_COLOR_ATTACHMENTS', 'MAX_DRAW_BUFFERS', 'READ_BUFFER', 'DEPTH_ATTACHMENT', 'STENCIL_ATTACHMENT', 'DEPTH_STENCIL_ATTACHMENT', 'FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE', 'FRAMEBUFFER_ATTACHMENT_OBJECT_NAME', 'FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL', 'FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE', 'FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER', 'TEXTURE_2D', 'TEXTURE_3D', 'TEXTURE_2D_ARRAY', 'TEXTURE_CUBE_MAP', 'TEXTURE_BINDING_2D', 'TEXTURE_BINDING_3D', 'TEXTURE_BINDING_2D_ARRAY', 'TEXTURE_BINDING_CUBE_MAP', 'RENDERBUFFER_WIDTH', 'RENDERBUFFER_HEIGHT', 'RENDERBUFFER_INTERNAL_FORMAT', 'RENDERBUFFER_SAMPLES', 'RENDERBUFFER_RED_SIZE', 'RENDERBUFFER_GREEN_SIZE', 'RENDERBUFFER_BLUE_SIZE', 'RENDERBUFFER_ALPHA_SIZE', 'RENDERBUFFER_DEPTH_SIZE', 'RENDERBUFFER_STENCIL_SIZE', 'COLOR', 'DEPTH', 'STENCIL', 'DEPTH_STENCIL'];
class FakeGL {
  constructor() {
    enumNames.forEach((name, i) => this[name] = i + 100);
    Object.assign(this, { NONE: 0, COLOR_ATTACHMENT0: 1000, DRAW_BUFFER0: 1100, TEXTURE_CUBE_MAP_POSITIVE_X: 1200, TEXTURE_CUBE_MAP_NEGATIVE_Z: 1205, COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2, STENCIL_BUFFER_BIT: 4, NEAREST: 1300 });
    this.state = { read: null, draw: null, rb: null, textures: new Map(), readBuffer: this.COLOR_ATTACHMENT0 + 1, drawBuffers: [this.NONE, this.COLOR_ATTACHMENT0 + 1] };
    this.fbs = new Map(); this.rbStorage = new Map(); this.log = []; this.calls = []; this.queryFailure = null; this.nativeThrow = null;
    this.result = { native: true }; this.errors = [777]; this.other = { program: {}, vao: {}, sampler: {}, activeTexture: 7, packBuffer: {}, unpackBuffer: {}, pack: 8, viewport: [3, 4, 5, 6] };
    const gl = this;
    this.ext = {
      FRAMEBUFFER_ATTACHMENT_TEXTURE_SAMPLES_EXT: 1400,
      framebufferTexture2DMultisampleEXT(...a) { assert.equal(this, gl.ext); gl.note('framebufferTexture2DMultisampleEXT', a); gl.attach(a[0], a[1], { type: gl.TEXTURE, object: a[3], level: a[4], samples: a[5] }); return gl.result; },
      renderbufferStorageMultisampleEXT(...a) { assert.equal(this, gl.ext); gl.note('renderbufferStorageMultisampleEXT', a); gl.storage(a); return gl.result; },
    };
  }
  note(name, args) { this.log.push('native:' + name); this.calls.push({ name, args: Array.from(args), receiver: this }); }
  fb(target) { return target === this.READ_FRAMEBUFFER ? this.state.read : this.state.draw; }
  attach(target, point, row) { const fb = this.fb(target); if (!this.fbs.has(fb)) this.fbs.set(fb, new Map()); this.fbs.get(fb).set(point, row); }
  getParameter(key) {
    this.log.push('query:getParameter:' + key);
    if (this.queryFailure === key) throw Error('Injected query failure');
    const s = this.state;
    const values = new Map([[this.READ_FRAMEBUFFER_BINDING, s.read], [this.DRAW_FRAMEBUFFER_BINDING, s.draw], [this.RENDERBUFFER_BINDING, s.rb], [this.MAX_COLOR_ATTACHMENTS, 2], [this.MAX_DRAW_BUFFERS, 2], [this.READ_BUFFER, s.readBuffer], [this.DRAW_BUFFER0, s.drawBuffers[0]], [this.DRAW_BUFFER0 + 1, s.drawBuffers[1]]]);
    for (const [name, target] of [['TEXTURE_BINDING_2D', this.TEXTURE_2D], ['TEXTURE_BINDING_3D', this.TEXTURE_3D], ['TEXTURE_BINDING_2D_ARRAY', this.TEXTURE_2D_ARRAY], ['TEXTURE_BINDING_CUBE_MAP', this.TEXTURE_CUBE_MAP]]) values.set(this[name], s.textures.get(target) ?? null);
    if (!values.has(key)) throw Error('Unsupported fake parameter ' + key);
    return values.get(key);
  }
  getFramebufferAttachmentParameter(target, point, key) {
    this.log.push('query:attachment:' + target + ':' + point + ':' + key);
    const row = this.fbs.get(this.fb(target))?.get(point);
    if (key === this.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) return row?.object ? row.type : this.NONE;
    if (!row?.object) throw Error('Query absent attachment');
    return new Map([[this.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, row.object], [this.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL, row.level ?? 0], [this.FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE, row.face ?? 0], [this.FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER, row.layer ?? 0], [this.ext.FRAMEBUFFER_ATTACHMENT_TEXTURE_SAMPLES_EXT, row.samples ?? 0]]).get(key);
  }
  getRenderbufferParameter(target, key) { this.log.push('query:renderbuffer:' + key); return this.rbStorage.get(this.state.rb)?.get(key); }
  getError() { this.note('getError', []); return this.errors.shift() ?? 0; }
  bindFramebuffer(target, value) { this.note('bindFramebuffer', arguments); if (target === this.FRAMEBUFFER || target === this.READ_FRAMEBUFFER) this.state.read = value; if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER) this.state.draw = value; return this.result; }
  bindRenderbuffer(target, value) { this.note('bindRenderbuffer', arguments); this.state.rb = value; }
  bindTexture(target, value) { this.note('bindTexture', arguments); this.state.textures.set(target, value); }
  storage(a) {
    const multi = a.length === 5, offset = multi ? 1 : 0;
    this.rbStorage.set(this.state.rb, new Map([[this.RENDERBUFFER_WIDTH, a[2 + offset]], [this.RENDERBUFFER_HEIGHT, a[3 + offset]], [this.RENDERBUFFER_INTERNAL_FORMAT, a[1 + offset]], [this.RENDERBUFFER_SAMPLES, multi ? a[1] : 0], ...['RED', 'GREEN', 'BLUE', 'ALPHA'].map(k => [this['RENDERBUFFER_' + k + '_SIZE'], 16]), [this.RENDERBUFFER_DEPTH_SIZE, 24], [this.RENDERBUFFER_STENCIL_SIZE, 8]]));
  }
  renderbufferStorage(...a) { this.note('renderbufferStorage', a); this.storage(a); return this.result; }
  renderbufferStorageMultisample(...a) { this.note('renderbufferStorageMultisample', a); this.storage(a); return this.result; }
  framebufferTexture2D(target, point, face, obj, level) { this.note('framebufferTexture2D', arguments); this.attach(target, point, { type: this.TEXTURE, object: obj, face: face === this.TEXTURE_2D ? 0 : face, level }); return this.result; }
  framebufferTextureLayer(target, point, obj, level, layer) { this.note('framebufferTextureLayer', arguments); this.attach(target, point, { type: this.TEXTURE, object: obj, level, layer }); return this.result; }
  framebufferRenderbuffer(target, point, rbTarget, obj) { this.note('framebufferRenderbuffer', arguments); this.attach(target, point, { type: this.RENDERBUFFER, object: obj }); return this.result; }
  blitFramebuffer(...a) { this.note('blitFramebuffer', a); if (this.nativeThrow) throw this.nativeThrow; this.onNativeBlit?.(); return this.result; }
  getExtension(name) { this.note('getExtension', arguments); return name === 'WEBGL_multisampled_render_to_texture' ? this.ext : null; }
}
for (const method of ['texStorage2D', 'texStorage3D', 'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'copyTexSubImage2D', 'copyTexSubImage3D', 'copyTexImage2D', 'compressedTexImage2D', 'compressedTexImage3D', 'compressedTexSubImage2D', 'compressedTexSubImage3D', 'generateMipmap', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi', 'invalidateFramebuffer', 'invalidateSubFramebuffer']) FakeGL.prototype[method] = function (...args) { this.note(method, args); return this.result; };

function fixture(options) {
  const gl = new FakeGL(), baseline = { ...Object.getOwnPropertyDescriptors(gl) };
  const observer = installResolveObservation(gl, options);
  const read = {}, draw = {}, rb = {}, texture = {};
  for (const [value, kind, owner] of [[read, 'framebuffer', 'composer/msaa'], [draw, 'framebuffer', 'composer/resolved'], [rb, 'renderbuffer', 'composer/msaa/color'], [texture, 'texture', 'composer/resolved/color']]) observer.registerOwner(value, kind, owner);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, read);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, 999, 16, 8);
  gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.RENDERBUFFER, rb);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texStorage2D(gl.TEXTURE_2D, 1, 999, 16, 8);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0);
  return { gl, observer, read, draw, rb, texture, baseline };
}
const blit = gl => gl.blitFramebuffer(1, 2, 15, 7, 3, 4, 14, 6, gl.COLOR_BUFFER_BIT, gl.NEAREST);
const event = report => report.events.find(e => e.kind === 'explicit-blit');

test('core before/native/after/invalidate boundary, exact arguments, identities, selectors and attempts', () => {
  const { gl, observer, texture } = fixture();
  const beforeCalls = gl.calls.length, expectedReturn = gl.result;
  assert.equal(blit(gl), expectedReturn);
  gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, [gl.COLOR_ATTACHMENT0 + 1]);
  const report = observer.stop(), row = event(report);
  assert.equal(gl.calls.filter(c => c.name === 'blitFramebuffer').length, 1);
  assert.deepEqual(gl.calls[beforeCalls].args, [1, 2, 15, 7, 3, 4, 14, 6, gl.COLOR_BUFFER_BIT, gl.NEAREST]);
  assert.deepEqual(row.srcRect, [1, 2, 15, 7]); assert.deepEqual(row.dstRect, [3, 4, 14, 6]);
  assert.equal(row.before.readBuffer, gl.COLOR_ATTACHMENT0 + 1); assert.deepEqual(row.before.drawBuffers, [gl.NONE, gl.COLOR_ATTACHMENT0 + 1]);
  const before = row.before.draw.attachments[0], after = row.after.draw.attachments[0];
  assert.equal(before.resource.id, after.resource.id); assert.equal(before.resource.owner, 'composer/resolved/color');
  assert.equal(before.resource.allocationGeneration, 1); assert.equal(after.resource.writeAttemptGeneration, before.resource.writeAttemptGeneration + 1);
  assert.equal(row.before.read.attachments[0].allocation.SAMPLES, 4); assert.equal(row.before.read.attachments[0].allocation.glCallSamples, 4);
  assert.equal(row.before.read.attachments[0].allocation.rendererClampedSamples, 'unobserved');
  assert.deepEqual(after.allocation, { width: 16, height: 8, depth: 1, internalFormat: 999 });
  assert.equal(row.metadataComplete, false); assert.equal(report.coreBlitMetadataComplete, false); // Sample-query capability and native invalidation selection remain unobserved.
  assert.equal(report.storageEqualityEligible, false); assert.equal(report.nativeStorageBits, 'unobserved');
  assert.equal(row.after.read.attachments[0].resource.invalidationAttemptGeneration, 0);
  const native = gl.log.indexOf('native:blitFramebuffer'), invalidation = gl.log.indexOf('native:invalidateFramebuffer');
  assert(gl.log.slice(0, native).some(s => s.startsWith('query:attachment:')));
  assert(gl.log.slice(native + 1, invalidation).some(s => s.startsWith('query:attachment:')));
  assert.equal(report.failures.length, 1); assert.equal(report.failures[0].stage, 'invalidation:invalidateFramebuffer'); assert.equal(gl.state.textures.get(gl.TEXTURE_2D), texture);
});

test('native exception identity survives observation and does not advance destination', () => {
  const { gl, observer } = fixture(), sentinel = { get message() { throw Error('hostile getter'); } };
  gl.nativeThrow = sentinel;
  assert.throws(() => blit(gl), e => e === sentinel);
  const report = observer.stop(), row = event(report);
  assert.equal(row.after, null); assert.equal(row.nativeCallReturned, false); assert.equal(report.coreBlitMetadataComplete, false);
  assert.equal(gl.calls.filter(c => c.name === 'blitFramebuffer').length, 1);
  assert.equal(report.events.at(-1).kind, 'native-throw');
});

test('query failure cannot replace return, skip native, or falsely complete a missing boundary', () => {
  const { gl, observer } = fixture(); gl.queryFailure = gl.READ_BUFFER;
  assert.equal(blit(gl), gl.result);
  const report = observer.stop();
  assert.equal(gl.calls.filter(c => c.name === 'blitFramebuffer').length, 1);
  assert.equal(report.coreBlitMetadataComplete, false); assert(report.failures.some(f => f.stage === 'before:blitFramebuffer'));
});

test('observer makes no state writes, draws, readbacks, extra resolves, or error-queue consumption', () => {
  const { gl, observer } = fixture(), other = structuredClone(gl.other);
  const before = gl.calls.length; blit(gl); observer.stop();
  assert.deepEqual(gl.calls.slice(before).map(c => c.name), ['blitFramebuffer']);
  assert.deepEqual(gl.errors, [777]); assert.deepEqual(gl.other, other);
});

test('extension availability is not enabled speculatively, original object/return/receiver preserved', () => {
  const { gl, observer } = fixture(); assert.equal(gl.calls.filter(c => c.name === 'getExtension').length, 0);
  const ext = gl.getExtension('WEBGL_multisampled_render_to_texture'); assert.equal(ext, gl.ext);
  assert.equal(gl.getExtension('WEBGL_multisampled_render_to_texture'), ext);
  assert.equal(ext.framebufferTexture2DMultisampleEXT(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, gl.state.textures.get(gl.TEXTURE_2D), 0, 4), gl.result);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, {});
  const report = observer.stop(), api = report.events.find(e => e.kind === 'implicit-rtt-api');
  assert.equal(gl.calls.filter(c => c.name === 'framebufferTexture2DMultisampleEXT').length, 1);
  assert.equal(api.after.draw.attachments[0].queriedSamples, 4);
  assert.equal(api.after.draw.attachments[0].implicitRTT.glCallSamples, 4);
  assert.equal(api.actualImplicitResolvePoint, 'unobserved');
  assert(report.events.some(e => e.kind === 'implicit-rtt-transition'));
  assert.equal(report.storageEqualityEligible, false); assert.equal(report.implicitResolvePoints, 'unobserved');
});

test('extension unavailable records actual null result, no invented implicit branch', () => {
  const { gl, observer } = fixture(); assert.equal(gl.getExtension('EXT_multisampled_render_to_texture'), null);
  const report = observer.stop(); assert.deepEqual(report.events.filter(e => e.kind === 'extension-availability').map(e => e.available), [false]);
  assert(!report.events.some(e => e.kind === 'implicit-rtt-api'));
});

test('same texture in separate FBOs has independent core versus implicit attachment mode', () => {
  const { gl, observer, texture, draw } = fixture(), ext = gl.getExtension('WEBGL_multisampled_render_to_texture'), second = {};
  observer.registerOwner(second, 'framebuffer', 'composer/other'); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, second);
  ext.framebufferTexture2DMultisampleEXT(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0, 4);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw); blit(gl);
  const report = observer.stop(); assert.equal(event(report).after.draw.attachments[0].queriedSamples, 0);
  assert.equal(event(report).after.draw.attachments[0].implicitRTT, null);
});

test('core reattachment clears only that attachment implicit mode', () => {
  const { gl, observer, texture } = fixture(), ext = gl.getExtension('WEBGL_multisampled_render_to_texture');
  ext.framebufferTexture2DMultisampleEXT(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0, 4);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0); blit(gl);
  assert.equal(event(observer.stop()).after.draw.attachments[0].implicitRTT, null);
});

test('unmapped owner and default framebuffer stay incomplete, never equal storage', () => {
  const gl = new FakeGL(), observer = installResolveObservation(gl); blit(gl);
  const report = observer.stop(); assert.equal(report.coreBlitMetadataComplete, false); assert.equal(event(report).before.read.defaultFramebuffer, true); assert.equal(report.storageEqualityEligible, false);
});

test('budget overflow is visible and rejects metadata completeness without blocking native calls', () => {
  const { gl, observer } = fixture({ maxEvents: 1 }); blit(gl); blit(gl);
  const report = observer.stop(); assert.equal(report.dropped, 1); assert.equal(report.coreBlitMetadataComplete, false); assert.equal(gl.calls.filter(c => c.name === 'blitFramebuffer').length, 2);
});

test('stop restores inherited/own property descriptors and is idempotent', () => {
  const gl = new FakeGL(), own = function (...a) { this.note('ownBlit', a); return this.result; };
  Object.defineProperty(gl, 'blitFramebuffer', { value: own, configurable: true, enumerable: true, writable: false });
  const before = Object.getOwnPropertyDescriptor(gl, 'blitFramebuffer'), observer = installResolveObservation(gl);
  assert.equal(blit(gl), gl.result); const first = observer.stop();
  assert.deepEqual(Object.getOwnPropertyDescriptor(gl, 'blitFramebuffer'), before); assert.equal(Object.hasOwn(gl, 'clear'), false); assert.deepEqual(observer.stop(), first);
});

test('uninstall does not clobber another hook owner', () => {
  const { gl, observer } = fixture(), replacement = () => 7; gl.blitFramebuffer = replacement;
  const report = observer.stop(); assert.equal(gl.blitFramebuffer, replacement); assert(report.failures.some(f => f.stage === 'restore:blitFramebuffer')); assert.equal(report.coreBlitMetadataComplete, false);
});

test('cached pre-install extension functions are explicitly outside coverage; no no-blit success', () => {
  const gl = new FakeGL(), cached = gl.getExtension('WEBGL_multisampled_render_to_texture');
  const observer = installResolveObservation(gl); cached.framebufferTexture2DMultisampleEXT(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, {}, 0, 4);
  const report = observer.stop(); assert.equal(report.coreBlitMetadataComplete, false); assert.equal(report.events.length, 0); assert(report.limits[0].includes('cached extension'));
});

test('nonconfigurable extension method stays native and emits installation coverage failure', () => {
  const { gl, observer } = fixture(); Object.freeze(gl.ext); const ext = gl.getExtension('WEBGL_multisampled_render_to_texture');
  assert.equal(ext, gl.ext); const report = observer.stop();
  assert(report.failures.some(f => f.stage === 'install:framebufferTexture2DMultisampleEXT')); assert.equal(report.coreBlitMetadataComplete, false);
});

test('invalid budgets and owner registration fail before native work', () => {
  assert.throws(() => installResolveObservation(new FakeGL(), { maxEvents: 0 }), /budget/);
  const { observer, texture } = fixture(); assert.throws(() => observer.registerOwner(texture, 'texture', 'different'), /changed/);
  assert.throws(() => observer.registerOwner({}, 'wrong', 'x'), /Invalid/); observer.stop(); assert.throws(() => observer.registerOwner({}, 'texture', 'x'), /stopped/);
});

test('object budget overflow cannot suppress the native blit and cannot complete', () => {
  const gl = new FakeGL(), observer = installResolveObservation(gl, { maxObjects: 1 });
  observer.registerOwner({}, 'texture', 'budget/one'); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, {}); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, {});
  assert.equal(blit(gl), gl.result); const report = observer.stop();
  assert(report.failures.some(f => f.error.includes('budget'))); assert.equal(report.coreBlitMetadataComplete, false);
});

test('unsupported allocation invalidates stale metadata and does not alter native return', () => {
  const { gl, observer } = fixture(); assert.equal(gl.copyTexImage2D(gl.TEXTURE_2D, 0, 999, 0, 0, 16, 8, 0), gl.result); blit(gl);
  const report = observer.stop(); assert.equal(event(report).after.draw.attachments[0].metadataComplete, false);
  assert.equal(report.coreBlitMetadataComplete, false); assert(report.failures.some(f => f.stage === 'allocation:copyTexImage2D'));
});

test('unbounded storage input is rejected diagnostically after the original returns once', () => {
  const { gl, observer } = fixture(); assert.equal(gl.texStorage2D(gl.TEXTURE_2D, Infinity, 999, 16, 8), gl.result); blit(gl);
  const report = observer.stop(); assert(report.failures.some(f => f.error.includes('unsupported numeric')));
  assert.equal(report.coreBlitMetadataComplete, false);
});

test('borrowed wrapper preserves native this without recording the wrong context', () => {
  const { gl, observer } = fixture(), foreign = new FakeGL();
  assert.equal(Reflect.apply(gl.blitFramebuffer, foreign, [1, 2]), foreign.result);
  assert.equal(foreign.calls.filter(c => c.name === 'blitFramebuffer').length, 1); assert.equal(observer.stop().events.length, 0);
});

test('extension renderbuffer allocation records actual API samples and queried metadata, not native bits', () => {
  const { gl, observer } = fixture(), ext = gl.getExtension('WEBGL_multisampled_render_to_texture');
  assert.equal(ext.renderbufferStorageMultisampleEXT(gl.RENDERBUFFER, 2, 888, 20, 10), gl.result); blit(gl);
  const report = observer.stop(), a = event(report).before.read.attachments[0];
  assert.equal(a.resource.allocationGeneration, 2); assert.equal(a.allocation.glCallSamples, 2); assert.equal(a.allocation.SAMPLES, 2); assert.equal(a.allocation.WIDTH, 20);
  assert.equal(a.nativeStorageBits, 'unobserved'); assert.equal(report.implicitApiCallReturnedWitnessed, true); assert.equal(report.implicitResolveComplete, false);
});

test('metadata stores immutable per-event attachment generations across reattachments', () => {
  const { gl, observer, texture } = fixture(); blit(gl);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0); blit(gl);
  const rows = observer.stop().events.filter(e => e.kind === 'explicit-blit');
  assert.equal(rows[1].before.draw.resource.attachmentAttemptGeneration, rows[0].before.draw.resource.attachmentAttemptGeneration + 1);
  assert.equal(rows[0].before.draw.resource.attachmentAttemptGeneration, 1);
});

test('clearBuffer color write advances only its selected draw-buffer attachment', () => {
  const { gl, observer } = fixture(); blit(gl); gl.clearBufferfv(gl.COLOR, 1, new Float32Array([0, 0, 0, 0])); blit(gl);
  const rows = observer.stop().events.filter(e => e.kind === 'explicit-blit');
  assert.equal(rows[1].before.draw.attachments[0].resource.writeAttemptGeneration, rows[0].after.draw.attachments[0].resource.writeAttemptGeneration + 1);
});

test('missing sample-query enum is explicit incomplete implicit metadata, not zero samples', () => {
  const { gl, observer, texture } = fixture(), ext = gl.getExtension('WEBGL_multisampled_render_to_texture');
  delete ext.FRAMEBUFFER_ATTACHMENT_TEXTURE_SAMPLES_EXT;
  ext.framebufferTexture2DMultisampleEXT(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0, 4); blit(gl);
  const report = observer.stop(), a = event(report).after.draw.attachments[0];
  assert.equal(a.metadataComplete, false); assert(a.queriedSamples.unobserved); assert.equal(report.coreBlitMetadataComplete, false);
});

for (const key of ['READ_FRAMEBUFFER_BINDING', 'DRAW_FRAMEBUFFER_BINDING', 'READ_FRAMEBUFFER', 'DRAW_BUFFER0', 'FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER', 'TEXTURE_BINDING_2D']) test(`missing WebGL2 enum ${key} rejects before any hook or query`, () => {
  const gl = new FakeGL(); delete gl[key]; const before = Object.getOwnPropertyDescriptors(gl);
  assert.throws(() => installResolveObservation(gl), /Complete WebGL2/);
  assert.deepEqual(Object.getOwnPropertyDescriptors(gl), before); assert.deepEqual(gl.log, []); assert.deepEqual(gl.errors, [777]);
});

test('missing WebGL2 query function rejects before every hook, not after partial installation', () => {
  const gl = new FakeGL(); Object.defineProperty(gl, 'getFramebufferAttachmentParameter', { value: undefined, configurable: true });
  const before = Object.getOwnPropertyDescriptors(gl); assert.throws(() => installResolveObservation(gl), /Complete WebGL2/);
  assert.deepEqual(Object.getOwnPropertyDescriptors(gl), before); assert.deepEqual(gl.log, []);
});

for (const method of ['bindFramebuffer', 'framebufferTexture2D', 'framebufferTextureLayer', 'framebufferRenderbuffer', 'invalidateFramebuffer', 'invalidateSubFramebuffer', 'renderbufferStorage', 'renderbufferStorageMultisample', 'texStorage2D']) test(`unsupported ${method} target adds no diagnostic query and preserves one original call`, () => {
  const { gl, observer } = fixture(); gl.log.length = 0; const before = gl.calls.length;
  const args = {
    bindFramebuffer: [-999, {}], framebufferTexture2D: [-999, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, {}, 0], framebufferTextureLayer: [-999, gl.COLOR_ATTACHMENT0, {}, 0, 0],
    framebufferRenderbuffer: [-999, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, {}], invalidateFramebuffer: [-999, [gl.COLOR_ATTACHMENT0]], invalidateSubFramebuffer: [-999, [gl.COLOR_ATTACHMENT0], 0, 0, 8, 8],
    renderbufferStorage: [-999, 999, 8, 8], renderbufferStorageMultisample: [-999, 4, 999, 8, 8], texStorage2D: [-999, 1, 999, 8, 8],
  }[method];
  const result = gl[method](...args);
  assert.equal(result, gl.result); assert.deepEqual(gl.calls.slice(before).map(c => c.name), [method]);
  assert.deepEqual(gl.log, ['native:' + method]);
  const report = observer.stop(); assert(report.failures.some(f => f.error.includes('Unsupported'))); assert.equal(report.coreBlitMetadataComplete, false); assert.deepEqual(gl.errors, [777]);
});

test('unsupported extension target also adds no diagnostic query around the original', () => {
  const { gl, observer } = fixture(), ext = gl.getExtension('WEBGL_multisampled_render_to_texture');
  for (const [method, args] of [['framebufferTexture2DMultisampleEXT', [-999, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, {}, 0, 4]], ['renderbufferStorageMultisampleEXT', [-999, 4, 999, 8, 8]]]) {
    gl.log.length = 0; assert.equal(ext[method](...args), gl.result); assert.deepEqual(gl.log, ['native:' + method]);
  }
  const report = observer.stop(); assert(report.failures.some(f => f.error.includes('Unsupported'))); assert.deepEqual(gl.errors, [777]);
});

for (const method of ['invalidateFramebuffer', 'invalidateSubFramebuffer']) test(`${method} never consumes one-shot native sequence or calls getters`, () => {
  const gl = new FakeGL(), seen = [];
  gl[method] = function (target, attachments) { this.note(method, arguments); seen.push(...Array.from(attachments)); return this.result; };
  const observer = installResolveObservation(gl), sequence = (function* () { yield gl.COLOR_ATTACHMENT0; yield gl.DEPTH_ATTACHMENT; })();
  assert.equal(gl[method](gl.FRAMEBUFFER, sequence, 0, 0, 8, 8), gl.result);
  const report = observer.stop(); assert.deepEqual(seen, [gl.COLOR_ATTACHMENT0, gl.DEPTH_ATTACHMENT]); assert.equal(gl.calls.filter(c => c.name === method).length, 1);
  assert.equal(report.events[0].attachments, 'unobserved; native sequence left untouched'); assert.equal(report.coreBlitMetadataComplete, false);
});

test('throwing native sequence preserves the original exception instead of swallowing it diagnostically', () => {
  const gl = new FakeGL(), sentinel = {};
  gl.invalidateFramebuffer = function (target, attachments) { this.note('invalidateFramebuffer', arguments); Array.from(attachments); return this.result; };
  const observer = installResolveObservation(gl), sequence = (function* () { throw sentinel; })();
  assert.throws(() => gl.invalidateFramebuffer(gl.FRAMEBUFFER, sequence), error => error === sentinel);
  const report = observer.stop(); assert.equal(report.events.at(-1).kind, 'native-throw'); assert.equal(gl.calls.filter(c => c.name === 'invalidateFramebuffer').length, 1);
});

test('proxy array iterator/getters are visited only by the native conversion', () => {
  const gl = new FakeGL(), visited = [];
  gl.invalidateFramebuffer = function (target, attachments) { this.note('invalidateFramebuffer', arguments); Array.from(attachments); return this.result; };
  const proxy = new Proxy([gl.COLOR_ATTACHMENT0], { get(target, key, receiver) { visited.push(String(key)); return Reflect.get(target, key, receiver); } });
  Array.from(proxy); const baseline = visited.splice(0);
  const observer = installResolveObservation(gl); gl.invalidateFramebuffer(gl.FRAMEBUFFER, proxy); observer.stop(); assert.deepEqual(visited, baseline);
});

test('native numeric valueOf runs once; unsupported object mask is not stored or cloned', () => {
  const gl = new FakeGL(); let conversions = 0;
  gl.blitFramebuffer = function (...a) { this.note('blitFramebuffer', a); void (a[8] | 0); return this.result; };
  const observer = installResolveObservation(gl), mask = { valueOf() { conversions++; return gl.COLOR_BUFFER_BIT; } };
  assert.equal(gl.blitFramebuffer(0, 0, 8, 8, 0, 0, 8, 8, mask, gl.NEAREST), gl.result);
  const report = observer.stop(); assert.equal(conversions, 1); assert.equal(report.events.length, 0); assert.equal(report.coreBlitMetadataComplete, false); assert(report.failures.some(f => f.error.includes('Nonprimitive')));
});

test('native string conversion for extension names runs once and is not reused diagnostically', () => {
  const gl = new FakeGL(); let conversions = 0;
  gl.getExtension = function (name) { this.note('getExtension', arguments); return String(name).includes('WEBGL') ? this.ext : null; };
  const observer = installResolveObservation(gl), name = { toString() { conversions++; return 'WEBGL_multisampled_render_to_texture'; } };
  assert.equal(gl.getExtension(name), gl.ext); const report = observer.stop(); assert.equal(conversions, 1); assert.equal(report.implicitApiCallReturnedWitnessed, false); assert(report.failures.some(f => f.stage === 'after:getExtension'));
});

test('GL nonthrow/no-op core reattachment cannot turn previous implicit sample4 into queried0', () => {
  const gl = new FakeGL(), original = gl.framebufferTexture2D;
  gl.framebufferTexture2D = function (...a) { if (a[4] === -1) { this.note('framebufferTexture2D', a); this.errors.push(1281); return this.result; } return Reflect.apply(original, this, a); };
  const observer = installResolveObservation(gl), fb = {}, texture = {};
  observer.registerOwner(fb, 'framebuffer', 'test/fb'); observer.registerOwner(texture, 'texture', 'test/texture');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texStorage2D(gl.TEXTURE_2D, 1, 999, 8, 8);
  const ext = gl.getExtension('WEBGL_multisampled_render_to_texture'); ext.framebufferTexture2DMultisampleEXT(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0, 4);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, -1); blit(gl);
  const report = observer.stop(), a = event(report).before.draw.attachments[0];
  assert.equal(a.queriedSamples, 4); assert.equal(a.attachmentAttempt.coreAttachment, true); assert.equal(a.sampleQueryExtension, 'WEBGL_multisampled_render_to_texture');
  assert.equal(report.actualImplicitBranch, 'unobserved; native return does not prove GL success'); assert.deepEqual(gl.errors, [777, 1281]); assert.equal(report.storageEqualityEligible, false);
});

for (const value of [NaN, -7, 2.5]) test(`invalid optional extension sample enum ${value} adds no invalid query`, () => {
  const { gl, observer, texture } = fixture(), ext = gl.getExtension('WEBGL_multisampled_render_to_texture');
  ext.FRAMEBUFFER_ATTACHMENT_TEXTURE_SAMPLES_EXT = value;
  ext.framebufferTexture2DMultisampleEXT(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, texture, 0, 4); blit(gl);
  const report = observer.stop(), a = event(report).after.draw.attachments[0];
  assert(a.queriedSamples.unobserved); assert.equal(report.coreBlitMetadataComplete, false);
  assert(!gl.log.some(row => row.startsWith('query:attachment:') && row.endsWith(':' + value))); assert.deepEqual(gl.errors, [777]);
});

test('native returned marker is retained separately when its after query fails', () => {
  const { gl, observer } = fixture(); gl.onNativeBlit = () => gl.queryFailure = gl.READ_BUFFER;
  assert.equal(blit(gl), gl.result); const report = observer.stop(), row = event(report);
  assert.equal(row.nativeCallReturned, true); assert.equal(row.after, null); assert.equal(report.coreBlitMetadataComplete, false); assert(report.failures.some(f => f.stage === 'after:blitFramebuffer'));
});

test('implicit native return is known even when allocation or after snapshot query fails', () => {
  const gl = new FakeGL(), ext = gl.ext, native = ext.framebufferTexture2DMultisampleEXT;
  ext.framebufferTexture2DMultisampleEXT = function (...args) { const out = Reflect.apply(native, this, args); gl.queryFailure = gl.READ_BUFFER; return out; };
  const observer = installResolveObservation(gl), fb = {}, texture = {};
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texStorage2D(gl.TEXTURE_2D, 1, 999, 8, 8); gl.getExtension('WEBGL_multisampled_render_to_texture');
  assert.equal(ext.framebufferTexture2DMultisampleEXT(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0, 4), gl.result);
  const row = observer.stop().events.find(e => e.kind === 'implicit-rtt-api'); assert.equal(row.nativeCallReturned, true); assert.equal(row.after, null);
});
