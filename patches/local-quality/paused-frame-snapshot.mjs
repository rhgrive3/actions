// Offline pause keeps the frozen arena visible without redrawing it (#1659).
//
// pausedWorldFrame() stops all world/composer work once the paused scene is
// unchanged. The renderer's default drawing buffer is created without
// preserveDrawingBuffer, and WebGL only guarantees its content until the page
// is composited, so a frame that is never redrawn can turn black while the DOM
// pause menu stays interactive. Enabling preserveDrawingBuffer globally costs
// performance on mobile, so the finished frame is copied once (GPU to GPU, no
// CPU readback) into a FramebufferTexture and presented with one cheap
// fullscreen draw per visible frame. The snapshot is the already tone-mapped,
// output-encoded default framebuffer; it is never colour-managed a second time.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const PRESENT_VS = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const PRESENT_FS = `uniform sampler2D tFrame;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tFrame, vUv).rgb, 1.0); }`;

function presentMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { tFrame: { value: null } },
    vertexShader: PRESENT_VS, fragmentShader: PRESENT_FS,
    depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
  });
}

// Pure helper so the lifetime rules can be tested without a GPU.
export function snapshotMatchesBuffer(snapshot, width, height) {
  return !!snapshot && snapshot.image.width === width && snapshot.image.height === height;
}

export function installPausedFrameSnapshot(Renderer) {
  const proto = Renderer.prototype;
  if (proto.capturePausedFrame) return;

  proto.releasePausedFrame = function releasePausedFrame() {
    const snapshot = this._pauseSnapshot, quad = this._pauseQuad;
    this._pauseSnapshot = null; this._pauseQuad = null;
    snapshot?.dispose();
    // FullScreenQuad's geometry is shared by three's postprocessing passes. Only the material is ours.
    quad?.material.dispose();
    return false;
  };

  // Call straight after a complete render to the default framebuffer, in the same task.
  proto.capturePausedFrame = function capturePausedFrame() {
    const r = this.renderer;
    if (!r || r.getContext?.().isContextLost?.()) return this.releasePausedFrame();
    // Only the final default framebuffer holds finished colour; never cache an HDR composer target.
    if (r.getRenderTarget?.() !== null) return this.releasePausedFrame();
    const size = r.getDrawingBufferSize(this._pauseBufferSize || (this._pauseBufferSize = new THREE.Vector2()));
    const width = Math.floor(size.x), height = Math.floor(size.y);
    if (width < 1 || height < 1) return this.releasePausedFrame();
    try {
      let snapshot = this._pauseSnapshot;
      if (!snapshotMatchesBuffer(snapshot, width, height)) {
        this.releasePausedFrame();
        snapshot = new THREE.FramebufferTexture(width, height);
        snapshot.generateMipmaps = false;
        snapshot.minFilter = snapshot.magFilter = THREE.NearestFilter;
        snapshot.colorSpace = THREE.NoColorSpace;
        this._pauseSnapshot = snapshot;
      }
      r.copyFramebufferToTexture(snapshot);
      return true;
    } catch (error) {
      console.warn('[pause] frame snapshot unavailable; the frozen scene is redrawn instead', error);
      return this.releasePausedFrame();
    }
  };

  // true when the retained frame was drawn; false means the caller must render the world again.
  proto.presentPausedFrame = function presentPausedFrame() {
    const r = this.renderer, snapshot = this._pauseSnapshot;
    if (!r || !snapshot) return false;
    if (r.getContext?.().isContextLost?.()) return this.releasePausedFrame();
    const size = r.getDrawingBufferSize(this._pauseBufferSize || (this._pauseBufferSize = new THREE.Vector2()));
    if (!snapshotMatchesBuffer(snapshot, Math.floor(size.x), Math.floor(size.y))) return this.releasePausedFrame();
    const previousTarget = r.getRenderTarget(), previousAutoClear = r.autoClear;
    try {
      const quad = this._pauseQuad || (this._pauseQuad = new FullScreenQuad(presentMaterial()));
      quad.material.uniforms.tFrame.value = snapshot;
      r.setRenderTarget(null);
      r.autoClear = false;
      quad.render(r);
      this._pausePresented = (this._pausePresented || 0) + 1;
      return true;
    } catch (error) {
      console.warn('[pause] frame snapshot presentation failed; the frozen scene is redrawn instead', error);
      return this.releasePausedFrame();
    } finally {
      r.autoClear = previousAutoClear;
      r.setRenderTarget(previousTarget);
    }
  };
}
