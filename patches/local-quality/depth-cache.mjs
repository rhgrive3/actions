import { FloatType, UnsignedShortType } from 'three';

// A dedicated WebGL2 framebuffer: no texture/color storage is created. Three's
// RenderTarget requires >=1 color texture, so count:0 is not a supported escape.
export function createDepthCache(gl, width, height, type) {
  if (gl.isContextLost()) return null;
  const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
  const rb = gl.getParameter(gl.RENDERBUFFER_BINDING);
  const framebuffer = gl.createFramebuffer(), depth = gl.createRenderbuffer();
  let disposed = false;
  const cache = { width, height, framebuffer, depth, colorBytes: 0, depthType: type,
    valid: () => !disposed && !gl.isContextLost() && gl.isFramebuffer(framebuffer) && gl.isRenderbuffer(depth),
    dispose() { if (disposed) return; disposed = true; gl.deleteFramebuffer(framebuffer); gl.deleteRenderbuffer(depth); } };
  try {
    if (!framebuffer || !depth) { cache.dispose(); return null; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    const format = type === FloatType ? gl.DEPTH_COMPONENT32F : type === UnsignedShortType ? gl.DEPTH_COMPONENT16 : gl.DEPTH_COMPONENT24;
    gl.renderbufferStorage(gl.RENDERBUFFER, format, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { cache.dispose(); return null; }
    return cache;
  } catch {
    cache.dispose(); return null;
  } finally {
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
  }
}
export function installDepthOnlyShadowCache(ShadowCache) {
  const p = ShadowCache.prototype, nativeFbo = p._fbo, nativeRender = p._render;
  p._fbo = function (rt) { return rt?.valid ? (rt.valid() ? rt.framebuffer : null) : rt ? nativeFbo.call(this, rt) : null; };
  p._ensureCache = function (width, height, type) {
    if (this.cache?.width === width && this.cache.height === height && this.cache.depthType === type && this.cache.valid()) return;
    this.cache?.dispose(); this.cache = createDepthCache(this.renderer.getContext(), width, height, type);
  };
  p._render = function (...args) {
    if (this.cache && !this.cache.valid()) { this.cache.dispose(); this.cache = null; this.dirty = true; }
    return nativeRender.apply(this, args);
  };
  p.dispose = function () {
    this.enabled = false; this.cache?.dispose(); this.cache = null;
    this.renderer.domElement?.removeEventListener('webglcontextrestored', this._depthRestore);
    if (this.renderer.shadowMap.render === this._depthHook) this.renderer.shadowMap.render = this._orig;
    this.roots.length = 0; this.static.length = 0; this.dynamic = new WeakSet();
  };
}
export function attachDepthCacheLifecycle(owner, G) {
  owner._depthHook = owner.renderer.shadowMap.render;
  owner._depthRestore = () => {
    owner.cache?.dispose(); owner.cache = null; owner.dirty = true;
    // Three recreates WebGLShadowMap before dispatching its restore listener.
    // Reconnect to that new owner, never call the stale renderer internals.
    const sm = owner.renderer.shadowMap;
    if (sm.render !== owner._depthHook) {
      owner._orig = sm.render;
      owner._depthHook = sm.render = function (lights, scene, camera) {
        if (!owner.enabled || scene !== G.scene || !lights.length || (sm.autoUpdate === false && sm.needsUpdate === false))
          return owner._orig.call(this, lights, scene, camera);
        return owner._render(this, lights, scene, camera);
      };
    }
  };
  owner.renderer.domElement?.addEventListener('webglcontextrestored', owner._depthRestore);
}
