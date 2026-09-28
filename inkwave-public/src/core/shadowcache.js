// Sun-shadow cost cutter (identical image, much less GPU work per shadow update).
//
// The sun's shadow camera is fitted once around the arena and never moves, and most shadow casters (the level,
// props, decor, docks) never move either — yet a normal shadow update re-renders all of them. This keeps a copy of
// their depth and, on every update, restores it with one WebGL2 depth blit and draws only what moves:
//
//   static cache   level / props / decor / environment casters are drawn once into a private depth target.
//                  A candidate that turns out to move (spinning fans → instance matrices, cloth → custom depth
//                  shader, anything whose matrix / visibility / geometry changes) is demoted to dynamic and the
//                  cache is rebuilt, so the result is always exactly what a full redraw would produce.
//   off-screen     squidkids whose body AND shadow are outside the player's view skip the shadow pass for that
//                  update (their shadow could not be seen anyway; they come back the moment they can).
//
// Hooks WebGLShadowMap.render for the game scene only (the menu showcase renders untouched).
import * as THREE from 'three';
import { G } from './ctx.js';

const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _v = new THREE.Vector3();

export class ShadowCache {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.roots = [];             // candidate static roots (set by the game when a stage is built)
    this.static = [];            // [{ o, m: Float64Array(16), iv, pv, vis }]
    this.dynamic = new WeakSet();
    this.cache = null;
    this.dirty = true;
    this.sig = '';
    this.stats = { rebuilds: 0, lastStatic: 0, skippedActors: 0 };
    const sm = renderer.shadowMap;
    const orig = sm.render;
    this._orig = orig;
    const self = this;
    sm.render = function (lights, scene, camera) {
      if (!self.enabled || scene !== G.scene || !lights.length || (sm.autoUpdate === false && sm.needsUpdate === false)) return orig.call(this, lights, scene, camera);
      return self._render(this, lights, scene, camera);
    };
  }

  /** Candidate static roots for the current stage; anything under them that never moves gets cached. */
  setStaticRoots(roots) {
    this.roots = roots.filter(Boolean);
    this.dynamic = new WeakSet();
    this.dirty = true;
  }
  invalidate() { this.dirty = true; }

  // ---------------------------------------------------------------------------------------------- internals
  _collect() {
    const list = [];
    const seen = new Set();
    for (const r of this.roots) r.traverse((o) => {
      if (seen.has(o) || !(o.isMesh || o.isInstancedMesh) || !o.castShadow || this.dynamic.has(o)) return;
      if (o.isSkinnedMesh || o.customDepthMaterial || o.morphTargetInfluences) { this.dynamic.add(o); return; }
      seen.add(o);
      o.updateWorldMatrix(true, false);
      list.push({ o, m: Float64Array.from(o.matrixWorld.elements), iv: o.instanceMatrix ? o.instanceMatrix.version : 0, pv: o.geometry?.attributes?.position?.version ?? 0, vis: this._visible(o), cnt: o.count ?? 0 });
    });
    return list;
  }
  // visible AND still attached to a scene (a detached subtree must leave the cache too)
  _visible(o) { let last = o; for (let p = o; p; p = p.parent) { if (!p.visible) return false; last = p; } return last.isScene === true; }
  /** true when a cached caster changed since it was cached (→ demote it, rebuild). */
  _checkMoved() {
    let moved = false;
    for (const s of this.static) {
      const o = s.o, e = o.matrixWorld.elements, m = s.m;
      let ch = !o.parent || s.vis !== this._visible(o) || (o.instanceMatrix && o.instanceMatrix.version !== s.iv) || (o.count ?? 0) !== s.cnt
        || (o.geometry?.attributes?.position?.version ?? 0) !== s.pv || !o.castShadow;
      if (!ch) for (let i = 0; i < 16; i++) if (e[i] !== m[i]) { ch = true; break; }
      if (ch) { this.dynamic.add(o); moved = true; }
    }
    return moved;
  }
  _fbo(rt) { return this.renderer.properties.get(rt).__webglFramebuffer; }
  _ensureCache(w, h) {
    if (this.cache && this.cache.width === w && this.cache.height === h) return;
    this.cache?.dispose();
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
    rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    rt.depthTexture.format = THREE.DepthFormat;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(rt); this.renderer.setRenderTarget(prev);   // allocate the framebuffer now
    this.cache = rt;
  }
  _blitDepth(fromRT, toRT, w, h) {
    const gl = this.renderer.getContext();
    const a = this._fbo(fromRT), b = this._fbo(toRT);
    if (!a || !b) return false;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, a);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, b);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    return true;
  }
  _rebind() {
    // hand the GL binding back to exactly what three.js believes is bound
    const gl = this.renderer.getContext();
    const cur = this.renderer.getRenderTarget();
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur ? this._fbo(cur) || null : null);
  }

  _render(sm, lights, scene, camera) {
    const orig = this._orig;
    const sun = lights.find((l) => l.isDirectionalLight && l.shadow);
    if (lights.length !== 1 || !sun || typeof WebGL2RenderingContext === 'undefined' || !(this.renderer.getContext() instanceof WebGL2RenderingContext)) {
      return orig.call(sm, lights, scene, camera);
    }
    const sh = sun.shadow;
    const sig = `${sun.position.x},${sun.position.y},${sun.position.z}|${sh.mapSize.x}|${sh.camera.left},${sh.camera.right},${sh.camera.top},${sh.camera.bottom},${sh.camera.near},${sh.camera.far}`;
    if (sig !== this.sig) { this.sig = sig; this.dirty = true; }
    if (!this.dirty && this._checkMoved()) this.dirty = true;
    const skipped = this._cullActors(camera);
    try {
      if (this.dirty || !sh.map || !this.cache) {
        // 1) draw only the static casters (normal clear), keep their depth
        this.static = this._collect();
        const dyn = [], stat = new Set(this.static.map((s) => s.o));
        scene.traverse((o) => { if (o.castShadow && (o.isMesh || o.isInstancedMesh) && !stat.has(o)) { dyn.push(o); o.castShadow = false; } });
        sm.needsUpdate = true;
        orig.call(sm, lights, scene, camera);
        for (const o of dyn) o.castShadow = true;
        const w = sh.map.width, hh = sh.map.height;
        this._ensureCache(w, hh);
        const ok = this._blitDepth(sh.map, this.cache, w, hh);
        this._rebind();
        this.dirty = !ok;
        this.stats.rebuilds++; this.stats.lastStatic = this.static.length;
        if (!ok) { this.enabled = false; sm.needsUpdate = true; return orig.call(sm, lights, scene, camera); }
        sm.needsUpdate = true;
      }
      // 2) restore static depth instead of clearing, then draw only what moves
      for (const s of this.static) s.o.castShadow = false;
      const r = this.renderer, clear = r.clear;
      const w = sh.map.width, hh = sh.map.height;
      r.clear = () => { this._blitDepth(this.cache, sh.map, w, hh); this._rebindTo(sh.map); };
      try { orig.call(sm, lights, scene, camera); }
      finally { r.clear = clear; for (const s of this.static) s.o.castShadow = true; }
    } finally {
      for (const o of skipped) o.castShadow = true;
    }
  }
  _rebindTo(rt) { const gl = this.renderer.getContext(); gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo(rt)); }

  /** Squidkids whose body and shadow are both outside the view skip this shadow update. */
  _cullActors(camera) {
    const out = [];
    const actors = G.actors;
    const cam = G.rig?.gameCam || camera;
    if (!actors || !actors.length || !cam) return out;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    // horizontal throw of a shadow per metre of height (from the sun direction)
    const sd = G.env?.U?.uSunDir?.value;
    const hy = sd ? Math.max(0.2, sd.y) : 0.7;
    const hx = sd ? -sd.x / hy : 0, hz = sd ? -sd.z / hy : 0;
    let n = 0;
    for (const a of actors) {
      const root = a.character?.root;
      if (!root || !root.visible) continue;
      const h = Math.max(0, a.pos.y + 2.2);                // height above the lowest possible ground (sea)
      const L = Math.min(18, h);
      _v.set(a.pos.x + hx * L * 0.5, a.pos.y + 0.8 - L * 0.4, a.pos.z + hz * L * 0.5);
      _sphere.set(_v, 2.2 + Math.hypot(hx, hz) * L * 0.55 + L * 0.4);
      if (_frustum.intersectsSphere(_sphere)) continue;
      const list = a._shadowMeshes || (a._shadowMeshes = []);
      if (!list.length || list._root !== root) { list.length = 0; list._root = root; root.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.castShadow) list.push(o); }); }
      for (const o of list) if (o.castShadow) { o.castShadow = false; out.push(o); }
      n++;
    }
    this.stats.skippedActors = n;
    return out;
  }
}
