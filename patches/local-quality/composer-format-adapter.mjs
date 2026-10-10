// Issue #642: use the packed, unsigned RGB HDR format for the mobile Grade
// output target only when that output is nonnegative and the format is
// renderable on this WebGL context. The scene/read target remains RGBA16F.

export function composerGradeKeepsPackedTargetNonnegative(grade) {
  // This checks the environment-controlled Grade inputs. The remaining live
  // controls are bounded in main.js (uHurt approaches 0..0.8) and uFlash stays
  // at its zero default; the focused acceptance test pins those source facts.
  const components = (value, fallback) => {
    if (value == null) return fallback;
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value);
    if (Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
      return [value.x, value.y, value.z];
    }
    return null;
  };

  const lift = grade?.uLift ?? 0;
  const exposure = grade?.uExposure ?? 1;
  const vignette = grade?.uVignette ?? 0.22;
  const contrast = grade?.uContrast ?? 1.07;
  const saturation = grade?.uSat ?? 1.08;
  const vibrance = grade?.uVib ?? 0.12;
  const shadow = components(grade?.uShadowTint, [0.975, 0.99, 1.035]);
  const high = components(grade?.uHighTint, [1.025, 1.0, 0.972]);

  if (![lift, exposure, vignette, contrast, saturation, vibrance].every(Number.isFinite)) return false;
  if (lift < 0 || exposure < 0 || vignette > 1) return false;
  for (const tint of [shadow, high]) {
    if (!tint || tint.length !== 3 || !tint.every((value) => Number.isFinite(value) && value >= 0)) return false;
  }

  return true;
}

export function selectComposerTargetFormat(THREE, renderer, {
  touch = false,
  quality = null,
  samples = null,
  grade = null,
  screenFx = null,
} = {}) {
  const rgbaOptions = {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    samples,
    depthBuffer: true,
  };
  const fallback = (reason, canPack = false) => ({
    options: { ...rgbaOptions },
    mode: 'rgba16f',
    packed: false,
    canPack,
    reason,
  });

  if (!touch || samples !== 0 || !quality || quality.ao || quality.bloom) return fallback('profile-keeps-rgba16f');

  if (screenFx) {
    const shader = screenFx.material?.fragmentShader;
    const readsRgbOnlyAndWritesOpaque = typeof shader === 'string'
      && shader.includes('uniform float uLensOn;')
      && shader.includes('vec3 sceneTap(vec2 uv, vec2 ca)')
      && shader.includes('gl_FragColor = vec4(col, 1.0);');
    const diffuseSamples = typeof shader === 'string'
      ? [...shader.matchAll(/texture2D\(\s*tDiffuse\s*,[^)]*\)\s*(?:\.\s*(\w+))?/g)]
      : [];
    const samplesRgbOnly = diffuseSamples.length > 0
      && diffuseSamples.every((match) => ['r', 'g', 'b', 'rgb'].includes(match[1]));
    if (!readsRgbOnlyAndWritesOpaque || !samplesRgbOnly) return fallback('screenfx-output-not-proven');
  }

  if (typeof THREE.RGBFormat !== 'number' || typeof THREE.UnsignedInt101111Type !== 'number') {
    return fallback('packed-format-unavailable');
  }
  if (renderer?.capabilities?.isWebGL2 !== true) return fallback('webgl2-required');
  try {
    if (renderer.extensions?.has?.('EXT_color_buffer_float') !== true) return fallback('float-color-buffer-extension-missing');
  } catch {
    return fallback('float-color-buffer-extension-unavailable');
  }

  let gl;
  try {
    gl = renderer.getContext?.();
  } catch {
    return fallback('framebuffer-probe-unavailable');
  }
  if (!gl || typeof gl.checkFramebufferStatus !== 'function'
    || typeof renderer.getRenderTarget !== 'function'
    || typeof renderer.initRenderTarget !== 'function'
    || typeof renderer.setRenderTarget !== 'function') {
    return fallback('framebuffer-probe-unavailable');
  }

  let previous;
  try {
    previous = renderer.getRenderTarget();
  } catch {
    return fallback('framebuffer-probe-unavailable');
  }
  let probe = null;
  let framebufferComplete = false;

  try {
    probe = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RGBFormat,
      type: THREE.UnsignedInt101111Type,
      samples: 0,
      depthBuffer: true,
    });
    renderer.initRenderTarget(probe);
    renderer.setRenderTarget(probe);
    framebufferComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    framebufferComplete = false;
  } finally {
    try {
      renderer.setRenderTarget(previous);
    } catch {
      // The context may already be lost; disposing the probe still releases its
      // Three.js-side references and the next restored renderer can retry.
    }
    try {
      probe?.dispose();
    } catch {
      // A lost context can make the renderer's disposal event fail as well.
    }
  }

  if (!framebufferComplete) return fallback('packed-framebuffer-incomplete');
  if (!composerGradeKeepsPackedTargetNonnegative(grade)) return fallback('grade-can-output-negative-rgb', true);

  return {
    options: {
      format: THREE.RGBFormat,
      type: THREE.UnsignedInt101111Type,
      samples,
      depthBuffer: true,
    },
    mode: 'mixed-r11f-grade-rgba16f-scene',
    packed: true,
    canPack: true,
    reason: 'webgl2-fbo-complete',
  };
}

export function configureComposerColorTargets(THREE, composer, selection) {
  if (!selection?.packed) return composer;

  // EffectComposer starts with target1 as writeBuffer and target2 as
  // readBuffer. RenderPass writes the scene to target2; the first ShaderPass
  // (Grade) writes to target1. Keep scene RGB/alpha in HalfFloat and pack only
  // the known nonnegative Grade output. ScreenFX writes back to target2.
  const sceneTarget = composer?.renderTarget2;
  if (!sceneTarget?.texture) throw new TypeError('composer read target is unavailable');
  sceneTarget.texture.format = THREE.RGBAFormat;
  sceneTarget.texture.type = THREE.HalfFloatType;
  return composer;
}

const BASELINE_TARGET =
  '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';
const LAZY_TARGET_OPTIONS = '        { type: THREE.HalfFloatType, samples });';
const RENDER_GRADE_ANCHOR =
  '    const gr = G.env && G.env.grade;\n    if (gr && gr !== this._gradeSrc && this.grade) {';
const RENDER_GRADE_GUARD =
  '    const gr = G.env && G.env.grade;\n' +
  '    const gradeCanUsePackedTarget = composerGradeKeepsPackedTargetNonnegative(gr);\n' +
  '    if (this._composerPackedCapable && this._composerUsesPackedTarget !== gradeCanUsePackedTarget) this._buildComposer();\n' +
  '    if (gr && gr !== this._gradeSrc && this.grade) {';

const HELPER_ANCHOR = 'const BLOOM = [0.28, 0.45, 2.4];';
const HELPER_SOURCE = `${composerGradeKeepsPackedTargetNonnegative.toString()}\n\n${selectComposerTargetFormat.toString()}\n\n${configureComposerColorTargets.toString()}\n\n`;

const DIRECT_TARGET =
  '    const composerColorTarget = selectComposerTargetFormat(THREE, r, {\n' +
  '      touch: this.mobile.touch, quality: q, samples, grade: G.env?.grade, screenFx: this.extraPass,\n' +
  '    });\n' +
  '    this._composerPackedCapable = composerColorTarget.canPack;\n' +
  '    this._composerUsesPackedTarget = composerColorTarget.packed;\n' +
  '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, composerColorTarget.options);';

const BASELINE_COMPOSER = '    const comp = (this.composer = new EffectComposer(r, rt));';
const CONFIGURED_COMPOSER =
  `${BASELINE_COMPOSER}\n    configureComposerColorTargets(THREE, comp, composerColorTarget);`;

const LAZY_TARGET =
  '        const composerColorTarget = selectComposerTargetFormat(THREE, r, {\n' +
  '          touch: this.mobile.touch, quality: q, samples, grade: G.env?.grade, screenFx: this.extraPass,\n' +
  '        });\n' +
  '        this._composerPackedCapable = composerColorTarget.canPack;\n' +
  '        this._composerUsesPackedTarget = composerColorTarget.packed;\n' +
  '        const rt = new THREE.WebGLRenderTarget(\n' +
  '          state.width * state.pixelRatio, state.height * state.pixelRatio,\n' +
  '          composerColorTarget.options);';
const LAZY_COMPOSER_ANCHOR = '      const composer = new EffectComposer(r, rt);';
const CONFIGURED_LAZY_COMPOSER =
  `${LAZY_COMPOSER_ANCHOR}\n      configureComposerColorTargets(THREE, composer, composerColorTarget);`;

export function adaptComposerFormat(rel, code, once) {
  if (rel !== 'src/core/renderer.js') return code;

  code = once(code, HELPER_ANCHOR, `${HELPER_SOURCE}${HELPER_ANCHOR}`, '#642 packed composer format helper');
  if (code.includes(BASELINE_TARGET)) {
    code = once(code, BASELINE_TARGET, DIRECT_TARGET, '#642 mobile packed composer target');
    code = once(code, BASELINE_COMPOSER, CONFIGURED_COMPOSER, '#642 HalfFloat scene-read composer target');
  } else {
    const lazyTarget =
      '      const rt = new THREE.WebGLRenderTarget(\n' +
      '        state.width * state.pixelRatio, state.height * state.pixelRatio,\n' +
      LAZY_TARGET_OPTIONS;
    code = once(code, lazyTarget, LAZY_TARGET, '#642 packed format after lazy composer adapter');
    code = once(code, LAZY_COMPOSER_ANCHOR, CONFIGURED_LAZY_COMPOSER, '#642 HalfFloat scene-read lazy target');
  }
  return once(code, RENDER_GRADE_ANCHOR, RENDER_GRADE_GUARD, '#642 negative-grade HalfFloat fallback');
}
