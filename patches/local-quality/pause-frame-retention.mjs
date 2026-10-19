// Retain a GPU-only snapshot of the final onscreen composer output during offline pause.
// WebGL's default drawing buffer is NOT retained after page composition. Skipping every
// subsequent draw can make the frozen arena black, even while its DOM menu stays visible.
// This captures exactly once per invalidation, then presents one cheap fullscreen triangle
// per visible frame. No CPU readback and no global preserveDrawingBuffer performance cost.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

function snapshotMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { tFrame: { value: null } },
    vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    // The snapshot was copied from the *finished* sRGB drawing buffer, after
    // output colour management. Do not tone-map or gamma-transform it again.
    fragmentShader: `uniform sampler2D tFrame;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tFrame, vUv); }`,
    depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.NoBlending,
  });
}

export function installPausedFrameRetention(Renderer) {
  if (Renderer.prototype.capturePausedFrame) return;

  Renderer.prototype.releasePausedFrame = function () {
    this._pauseSnapshot?.dispose();
    this._pauseSnapshot = null;
    // FullScreenQuad's geometry is shared by Three's postprocessing passes;
    // do not dispose the shared geometry on each pause/resume.
    if (this._pauseQuad) this._pauseQuad.material.dispose();
    this._pauseQuad = null;
  };

  Renderer.prototype.capturePausedFrame = function () {
    const r = this.renderer, gl = r?.getContext?.();
    if (!r || gl?.isContextLost?.()) { this.releasePausedFrame(); return false; }
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const width = Math.floor(size.x), height = Math.floor(size.y);
    if (width < 1 || height < 1) { this.releasePausedFrame(); return false; }
    // Only the final default framebuffer has the OutputPass's finished colour.
    // Never accidentally cache an HDR intermediate composer target.
    if (r.getRenderTarget?.() !== null) { this.releasePausedFrame(); return false; }
    try {
      let snapshot = this._pauseSnapshot;
      if (!snapshot || snapshot.image.width !== width || snapshot.image.height !== height) {
        this.releasePausedFrame();
        snapshot = new THREE.FramebufferTexture(width, height);
        snapshot.generateMipmaps = false;
        snapshot.minFilter = snapshot.magFilter = THREE.LinearFilter;
        snapshot.colorSpace = THREE.NoColorSpace;
        this._pauseSnapshot = snapshot;
      }
      // GPU->GPU framebuffer copy, performed before the browser composites/clears it.
      r.copyFramebufferToTexture(snapshot);
      return true;
    } catch {
      this.releasePausedFrame();
      return false; // caller keeps the full-render fallback if copying is unavailable
    }
  };

  Renderer.prototype.presentPausedFrame = function () {
    const r = this.renderer, snapshot = this._pauseSnapshot;
    if (!r || !snapshot) return false;
    const gl = r.getContext?.();
    if (gl?.isContextLost?.()) { this.releasePausedFrame(); return false; }
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    if (snapshot.image.width !== Math.floor(size.x) || snapshot.image.height !== Math.floor(size.y)) {
      this.releasePausedFrame();
      return false;
    }
    const previousTarget = r.getRenderTarget(), previousAutoClear = r.autoClear;
    try {
      const quad = this._pauseQuad || (this._pauseQuad = new FullScreenQuad(snapshotMaterial()));
      quad.material.uniforms.tFrame.value = snapshot;
      r.setRenderTarget(null);
      r.autoClear = true;
      quad.render(r);
      return true;
    } catch {
      this.releasePausedFrame();
      return false;
    } finally {
      r.autoClear = previousAutoClear;
      r.setRenderTarget(previousTarget);
    }
  };
}
