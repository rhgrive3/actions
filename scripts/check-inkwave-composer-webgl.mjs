#!/usr/bin/env node
// Focused real-WebGL comparison for #642. Uses the shipped Three r186 runtime,
// Grade/FXAA shaders, ScreenFX class, and the production target-format/lifecycle
// adapters. The source scene is deterministic so two target formats receive
// identical post passes and effect state.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_EVIDENCE = process.argv[2];
const CHROMIUM = process.env.INKWAVE_CHROMIUM;
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE;
const BROWSER_PROFILE = process.env.INKWAVE_BROWSER_PROFILE;
const CSS_WIDTH = 320;
const CSS_HEIGHT = 180;
const INITIAL_PIXEL_RATIO = 1.2;
const RGB_TOLERANCE = { meanAbsoluteCode: 1.25, p99AbsoluteCode: 3, alphaMismatchPixels: 0 };

if (!DEFAULT_EVIDENCE) throw new Error('Usage: INKWAVE_CHROMIUM=<path> PLAYWRIGHT_MODULE=<path> node scripts/check-inkwave-composer-webgl.mjs <persistent-evidence-dir>');
if (!CHROMIUM || !PLAYWRIGHT || !BROWSER_PROFILE) throw new Error('Set INKWAVE_CHROMIUM, PLAYWRIGHT_MODULE and persistent INKWAVE_BROWSER_PROFILE paths.');

const evidenceDir = path.resolve(DEFAULT_EVIDENCE);
await fs.mkdir(evidenceDir, { recursive: true });
const resolvedEvidence = await fs.realpath(evidenceDir);
if (!resolvedEvidence.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/')) {
  throw new Error(`Evidence path is outside persistent agent-work/evidence: ${resolvedEvidence}`);
}

const rendererPath = path.join(ROOT, 'inkwave-public/src/core/renderer.js');
const screenFxPath = path.join(ROOT, 'inkwave-public/src/fx/screenfx.js');
const rendererSource = await fs.readFile(rendererPath, 'utf8');
const screenFxSource = await fs.readFile(screenFxPath, 'utf8');

function objectInitializer(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  const end = source.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error(`Could not extract shipped ${name} object`);
  return source.slice(start + prefix.length, end + 2);
}

function shaderTemplate(source, name) {
  const re = new RegExp(`const ${name} = \\/\\* glsl \\*\\/\\x60([\\s\\S]*?)\\x60;`);
  const match = source.match(re);
  if (!match) throw new Error(`Could not extract shipped ${name} shader`);
  return match[1];
}

const gradeInitializer = objectInitializer(rendererSource, 'GradeShader');
const fxaaInitializer = objectInitializer(rendererSource, 'FXAAShader');
const screenFxVertex = shaderTemplate(screenFxSource, 'VERT');
const screenFxFragment = shaderTemplate(screenFxSource, 'FRAG');
const sourceHashes = {
  renderer: crypto.createHash('sha256').update(rendererSource).digest('hex'),
  screenfx: crypto.createHash('sha256').update(screenFxSource).digest('hex'),
  packedAdapter: crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT, 'patches/local-quality/composer-format-adapter.mjs'))).digest('hex'),
  lazyAdapter: crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT, 'patches/local-quality/composer-target-adapter.mjs'))).digest('hex'),
};

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><script type="importmap">${JSON.stringify({ imports: {
  three: '/inkwave-public/vendor/three/build/three.module.js',
  'three/addons/': '/inkwave-public/vendor/three/jsm/',
} })}</script></head><body style="margin:0"><canvas id="gl"></canvas><script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ScreenFX } from '/inkwave-public/src/fx/screenfx.js';
import { effectiveQuality } from '/inkwave-public/src/config.js';
import { selectComposerTargetFormat, configureComposerColorTargets } from '/patches/local-quality/composer-format-adapter.mjs';
import { createLazyComposerTarget } from '/patches/local-quality/composer-target-adapter.mjs';

const CANVAS = document.getElementById('gl');
const WIDTH = ${CSS_WIDTH}, HEIGHT = ${CSS_HEIGHT}, INITIAL_PR = ${INITIAL_PIXEL_RATIO};
const renderer = new THREE.WebGLRenderer({ canvas: CANVAS, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.debug.checkShaderErrors = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.info.autoReset = false;
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(INITIAL_PR);
renderer.setSize(WIDTH, HEIGHT);

const gl = renderer.getContext();
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const qMobile = effectiveQuality({ quality: 'high' }, { touch: true, ios: true });
const qDesktop = effectiveQuality({ quality: 'high' }, { touch: false, ios: false });
const sourceMaterial = new THREE.ShaderMaterial({
  toneMapped: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: \`varying vec2 vUv;
    void main(){
      vec2 p=vUv;
      float grid=step(0.52, fract(p.x*21.0))*step(0.5, fract(p.y*13.0));
      float edge=step(0.45, fract((p.x+p.y*0.37)*17.0));
      vec3 c=vec3(0.018 + p.x*0.72, 0.025 + p.y*0.66, 0.035 + (p.x+p.y)*0.26);
      c=mix(c, vec3(0.045,0.075,0.22), grid*0.75);
      c=mix(c, vec3(0.88,0.23,0.07), edge*0.24);
      float hi=1.0-smoothstep(0.012,0.095,length((p-vec2(0.32,0.62))*vec2(1.0,1.4)));
      c += vec3(2.8,1.65,0.92)*hi;
      float spot=1.0-smoothstep(0.008,0.052,length(p-vec2(0.73,0.34)));
      c += vec3(0.28,1.45,2.2)*spot;
      gl_FragColor=vec4(c,1.0);
    }\`,
});
const scene = new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), sourceMaterial));
const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,2);
camera.position.z = 1;

const G = {
  mode: 'menu', match: null, settings: { quality: 'high', cameraShake: 1 },
  mobile: { touch: true, ios: true }, hud: null,
  teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
  teamHex: ['#ff8a14','#2f5bff'], projectiles: null,
};
const R = { renderer, setExtraPass(pass) { this.extraPass = pass; } };
const sfx = new ScreenFX(R, G);

globalThis.runComposerWebGLProbe = (payload) => {
  const GradeShader = new Function('THREE', 'return (' + payload.gradeInitializer + ');')(THREE);
  const FXAAShader = new Function('THREE', 'return (' + payload.fxaaInitializer + ');')(THREE);
  const gradeProbePass = new ShaderPass(GradeShader);
  const gradeUniformValues = Object.fromEntries(Object.entries(gradeProbePass.uniforms).map(([key, uniform]) => [key, uniform.value]));
  const mobileSelection = selectComposerTargetFormat(THREE, renderer, {
    touch: true, quality: qMobile, samples: 0, grade: gradeUniformValues, screenFx: sfx.pass,
  });
  const negativeGradeSelection = selectComposerTargetFormat(THREE, renderer, {
    touch: true, quality: qMobile, samples: 0, grade: { ...gradeUniformValues, uLift: -0.1 }, screenFx: sfx.pass,
  });
  const desktopSelection = selectComposerTargetFormat(THREE, renderer, {
    touch: false, quality: qDesktop, samples: qDesktop.msaa, grade: gradeUniformValues, screenFx: sfx.pass,
  });

  const source = {
    browser: navigator.userAgent,
    webglVersion: gl.getParameter(gl.VERSION),
    glslVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maskedVendor: gl.getParameter(gl.VENDOR), maskedRenderer: gl.getParameter(gl.RENDERER),
    unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
    isWebGL2: renderer.capabilities.isWebGL2,
    extColorBufferFloat: renderer.extensions.has('EXT_color_buffer_float'),
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    contextLost: gl.isContextLost(),
  };

  const metricTextureTarget = (target) => {
    const texture = target.texture;
    renderer.setRenderTarget(target);
    const color = gl.COLOR_ATTACHMENT0;
    const size = (pname) => {
      try { return gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, color, pname); } catch { return null; }
    };
    const fboStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    const attachmentBits = {
      red: size(gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE), green: size(gl.FRAMEBUFFER_ATTACHMENT_GREEN_SIZE),
      blue: size(gl.FRAMEBUFFER_ATTACHMENT_BLUE_SIZE), alpha: size(gl.FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE),
      componentType: size(gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE),
      colorEncoding: size(gl.FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING),
    };
    const value = {
      dimensions: [target.width, target.height],
      format: texture.format, type: texture.type, samples: target.samples,
      bytesPerTexelFromAttachmentBits: (attachmentBits.red + attachmentBits.green + attachmentBits.blue + attachmentBits.alpha) / 8,
      attachmentBits,
      framebufferStatus: fboStatus,
      framebufferComplete: fboStatus === gl.FRAMEBUFFER_COMPLETE,
    };
    renderer.setRenderTarget(null);
    return value;
  };

  const makePipeline = (packed) => {
    const life = { created: 0, targetDisposals: 0, generations: [] };
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.uAspect.value = WIDTH / HEIGHT;
    const fxaa = new ShaderPass(FXAAShader);
    const texel = new THREE.Vector2(1 / Math.round(WIDTH * INITIAL_PR), 1 / Math.round(HEIGHT * INITIAL_PR));
    fxaa.uniforms.uTexel.value.copy(texel);
    const proxy = createLazyComposerTarget((size) => {
      life.created++;
      const actualRatio = size.pixelRatio;
      const selected = packed ? mobileSelection : {
        options: { format: THREE.RGBAFormat, type: THREE.HalfFloatType, samples: 0, depthBuffer: true },
        packed: false, mode: 'rgba16f-reference', reason: 'reference-format',
      };
      const rt = new THREE.WebGLRenderTarget(size.width * actualRatio, size.height * actualRatio, selected.options);
      const composer = new EffectComposer(renderer, rt);
      // Match the production adapter: the supplied target is in device pixels,
      // while EffectComposer stores its internal dimensions in logical pixels.
      composer.setSize(size.width, size.height);
      if (packed) configureComposerColorTargets(THREE, composer, selected);
      for (const target of [composer.renderTarget1, composer.renderTarget2]) {
        target.addEventListener('dispose', () => life.targetDisposals++);
      }
      life.generations.push({
        packed, createdAt: [size.width, size.height, actualRatio],
        target1Type: composer.renderTarget1.texture.type, target2Type: composer.renderTarget2.texture.type,
      });
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(grade);
      composer.addPass(sfx.pass);
      composer.addPass(new OutputPass());
      composer.addPass(fxaa);
      return composer;
    }, { width: WIDTH, height: HEIGHT, pixelRatio: INITIAL_PR, ownerDocument: document });
    return { proxy, life, grade, fxaa, packed };
  };

  const capturePipeline = (pipeline) => {
    pipeline.proxy.render();
    gl.finish();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const pngBase64 = CANVAS.toDataURL('image/png').split(',')[1];
    const targets = {
      target1: metricTextureTarget(pipeline.proxy.renderTarget1),
      target2: metricTextureTarget(pipeline.proxy.renderTarget2),
    };
    return { pixels, pngBase64, drawingBuffer: [width, height], targets };
  };

  const pixelMetrics = (before, after) => {
    const bins = new Uint32Array(256);
    let sum = 0, max = 0, alphaMismatchPixels = 0, changedPixels = 0;
    const tailCounts = { over4Code: 0, over8Code: 0, over16Code: 0, over32Code: 0 };
    const pixels = before.length / 4;
    for (let i = 0; i < before.length; i += 4) {
      let changed = false;
      for (let c = 0; c < 3; c++) {
        const diff = Math.abs(before[i + c] - after[i + c]);
        bins[diff]++;
        sum += diff;
        if (diff > max) max = diff;
        if (diff > 4) tailCounts.over4Code++;
        if (diff > 8) tailCounts.over8Code++;
        if (diff > 16) tailCounts.over16Code++;
        if (diff > 32) tailCounts.over32Code++;
        if (diff) changed = true;
      }
      if (before[i + 3] !== after[i + 3]) alphaMismatchPixels++;
      if (changed) changedPixels++;
    }
    const samples = pixels * 3;
    const percentile = (q) => {
      const target = Math.ceil(samples * q);
      let count = 0;
      for (let i = 0; i < bins.length; i++) { count += bins[i]; if (count >= target) return i; }
      return 255;
    };
    return {
      pixelCount: pixels, rgbSampleCount: samples,
      meanAbsoluteCode: sum / samples, p95AbsoluteCode: percentile(0.95), p99AbsoluteCode: percentile(0.99),
      p99_9AbsoluteCode: percentile(0.999), p99_99AbsoluteCode: percentile(0.9999),
      maxAbsoluteCode: max, changedPixels, changedPixelPercent: changedPixels * 100 / pixels,
      tailCounts, alphaMismatchPixels,
    };
  };

  const seedRandom = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const resetEffectState = () => {
    sfx.reset(); sfx.force = null; sfx.debugHold = 0; sfx.time = 0.375;
    const U = sfx.U;
    for (const key of ['uSpeed','uStretch','uPunch','uBlast','uBlastRing','uChroma','uLensOn','uHurt','uFocus','uFloodDrip','uFloodClear','uHole','uDesat']) U[key].value = 0;
    for (const key of ['uPunchPos','uBlastPos']) U[key].value.set(0.5, 0.5);
    U.uBlastColor.value.setRGB(1,0.9,0.8); U.uSpeedTint.value.setRGB(1,1,1);
    U.uLensTexel.value.set(1/64,1/64); U.uLensColA.value.setRGB(0.1,0.2,1); U.uLensColB.value.setRGB(1,0.4,0.05);
    U.uEdgeInk.value.set(0,0,0,0); U.uAura.value.set(0,0,0,0); U.uHeart.value.set(0.6,0.02,0.06,0);
    U.uUrgency.value.set(1,0.16,0.05,0); U.uSwim.value.set(0,0,0,0); U.uCharge.value.set(1,1,1,0);
    U.uShimmer.value.set(0,0,0,0); U.uFlood.value.set(0,0,0,0); U.uHoleRim.value.setRGB(1,1,1);
    U.uFlash.value.set(1,1,1,0); U.uKill.value.set(1,1,1,0); U.uSat.value = 1;
    U.uLensOn.value = 0; U.uAspect.value = WIDTH/HEIGHT;
    sfx.pass.enabled = false;
  };
  const withSeed = (seed, callback) => {
    const saved = Math.random;
    Math.random = seedRandom(seed);
    try { return callback(); } finally { Math.random = saved; }
  };
  const prepareScenario = (scenario) => {
    resetEffectState();
    if (scenario.trigger) withSeed(scenario.seed, () => {
      for (const trigger of scenario.trigger) sfx.test(trigger.name, trigger.options || {});
      sfx.update(1/60, null);
    });
    else sfx.update(0, null);
    return { passEnabled: sfx.pass.enabled, time: sfx.U.uTime.value, lensParts: sfx.stats.lensParts };
  };

  const reference = makePipeline(false);
  const packed = makePipeline(true);
  const scenarios = [
    { name: 'grade-fxaa', seed: 101, trigger: null },
    { name: 'damage-screenfx-fxaa', seed: 102, trigger: [{ name: 'damage', options: { amount: 50, hold: 8 } }] },
    { name: 'lens-splat-screenfx-fxaa', seed: 103, trigger: [{ name: 'splat', options: { x: 0.73, y: 0.58, size: 0.13, angle: 0.3, hold: 8 } }] },
    { name: 'low-health-damage-screenfx-fxaa', seed: 104, trigger: [{ name: 'heart', options: { amount: 0.8, beat: 0.9, hold: 8 } }] },
    { name: 'swim-screenfx-fxaa', seed: 105, trigger: [{ name: 'swim', options: { hold: 8 } }] },
    { name: 'special-aura-screenfx-fxaa', seed: 106, trigger: [{ name: 'aura', options: { hold: 8 } }] },
    { name: 'flood-screenfx-fxaa', seed: 107, trigger: [{ name: 'flood', options: { t: 0.64, hold: 8 } }] },
    { name: 'respawn-reveal-screenfx-fxaa', seed: 108, trigger: [{ name: 'reveal', options: { t: 0.45, hold: 8 } }] },
    { name: 'combined-screenfx-fxaa', seed: 109, trigger: [
      { name: 'damage', options: { amount: 50, hold: 8 } },
      { name: 'swim', options: { hold: 8 } },
      { name: 'aura', options: { hold: 8 } },
      { name: 'flood', options: { t: 0.56, hold: 8 } },
    ] },
  ];
  const comparisons = [];
  for (const scenario of scenarios) {
    const effectState = prepareScenario(scenario);
    const before = capturePipeline(reference);
    const after = capturePipeline(packed);
    comparisons.push({
      name: scenario.name, effectState,
      outputDimensions: before.drawingBuffer,
      referenceTargets: before.targets, packedTargets: after.targets,
      metrics: pixelMetrics(before.pixels, after.pixels),
      referencePngBase64: before.pngBase64,
      packedPngBase64: after.pngBase64,
    });
  }

  reference.proxy.dispose();
  const candidateLifecycle = [];
  const recordLifecycle = (label) => {
    const one = metricTextureTarget(packed.proxy.renderTarget1);
    const two = metricTextureTarget(packed.proxy.renderTarget2);
    candidateLifecycle.push({ label, targets: { target1: one, target2: two }, targetDisposals: packed.life.targetDisposals, generations: packed.life.created });
  };
  sfx.reset(); sfx.force = null; sfx.debugHold = 0; sfx.update(0, null);
  sfx.pass.enabled = false;
  packed.proxy.render();
  recordLifecycle('initial-320x180-pr1.2');
  const disposeBeforeScale = packed.life.targetDisposals;
  const dynamicScale = 0.75;
  const dynamicPixelRatio = Math.round(Math.min(INITIAL_PR, qMobile.pixelRatio, 1.2) * dynamicScale * 1e6) / 1e6;
  renderer.setPixelRatio(dynamicPixelRatio);
  packed.proxy.setPixelRatio(dynamicPixelRatio);
  packed.proxy.setSize(320,180);
  packed.fxaa.uniforms.uTexel.value.set(1/(320*dynamicPixelRatio),1/(180*dynamicPixelRatio));
  sfx.update(0, null);
  packed.proxy.render();
  recordLifecycle('dynamic-resolution-scale' + dynamicScale + '-320x180-pr' + dynamicPixelRatio);
  const scaleDisposals = packed.life.targetDisposals - disposeBeforeScale;
  const disposeBeforeResize = packed.life.targetDisposals;
  renderer.setSize(180,320);
  packed.proxy.setSize(180,320);
  packed.fxaa.uniforms.uTexel.value.set(1/(180*dynamicPixelRatio),1/(320*dynamicPixelRatio));
  sfx.update(0, null);
  packed.proxy.render();
  recordLifecycle('orientation-resize-180x320-pr' + dynamicPixelRatio);
  const resizeDisposals = packed.life.targetDisposals - disposeBeforeResize;
  const beforeFinalDispose = packed.life.targetDisposals;
  packed.proxy.dispose();
  const finalDisposals = packed.life.targetDisposals - beforeFinalDispose;

  const negativeFallback = {
    mode: negativeGradeSelection.mode, packed: negativeGradeSelection.packed,
    reason: negativeGradeSelection.reason, format: negativeGradeSelection.options.format,
    type: negativeGradeSelection.options.type,
  };
  const desktopHdrRetention = {
    mode: desktopSelection.mode, packed: desktopSelection.packed,
    reason: desktopSelection.reason, format: desktopSelection.options.format,
    type: desktopSelection.options.type, msaaSamplesRequested: qDesktop.msaa,
  };
  const first = comparisons[0];
  const pairBytesPerPixel = (targets) => targets.target1.bytesPerTexelFromAttachmentBits + targets.target2.bytesPerTexelFromAttachmentBits;
  const referencePairBytesPerPixel = pairBytesPerPixel(first.referenceTargets);
  const packedPairBytesPerPixel = pairBytesPerPixel(first.packedTargets);
  const comparisonPixels = first.outputDimensions[0] * first.outputDimensions[1];
  const allocation = {
    outputDimensions: first.outputDimensions,
    referenceTargets: first.referenceTargets,
    selectedTargets: first.packedTargets,
    referenceColorBytesPerPixelPair: referencePairBytesPerPixel,
    selectedColorBytesPerPixelPair: packedPairBytesPerPixel,
    referenceColorMiB: comparisonPixels * referencePairBytesPerPixel / 1048576,
    selectedColorMiB: comparisonPixels * packedPairBytesPerPixel / 1048576,
    colorOnlyReductionPercent: (1 - packedPairBytesPerPixel / referencePairBytesPerPixel) * 100,
    scope: 'measured color attachment component bits only; depth, driver padding, and resident process/GPU overhead excluded',
  };
  const results = {
    gpu: source,
    profiles: {
      mobileHigh: { touch: true, quality: 'high', pixelRatioCap: 1.2, msaa: qMobile.msaa, ao: qMobile.ao, bloom: qMobile.bloom },
      desktopHigh: { touch: false, quality: 'high', hdr: desktopHdrRetention },
    },
    actualFormatProbe: {
      mode: mobileSelection.mode, packed: mobileSelection.packed, reason: mobileSelection.reason,
      format: mobileSelection.options.format, type: mobileSelection.options.type,
      selectedTypeName: mobileSelection.packed ? 'RGBFormat + UnsignedInt101111Type (R11F_G11F_B10F)' : 'RGBAFormat + HalfFloatType (RGBA16F)',
    },
    allocation,
    negativeGradeFallback: negativeFallback,
    comparisons,
    tolerance: payload.tolerance,
    lifecycle: {
      initialCssSize: [WIDTH,HEIGHT], initialPixelRatio: INITIAL_PR,
      dynamicScale, dynamicPixelRatio,
      steps: candidateLifecycle, scaleDisposals, resizeDisposals, finalDisposals,
      finalGenerations: packed.life.created,
    },
    contextErrors: gl.getError(),
    contextLost: gl.isContextLost(),
    lensFieldTarget: { dimensions: [sfx.lens.rt.width,sfx.lens.rt.height], format: sfx.lens.rt.texture.format, type: sfx.lens.rt.texture.type },
  };
  sfx.dispose();
  renderer.dispose();
  return results;
};
globalThis.__composerWebGLReady = true;
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/__composer-webgl-harness.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html); return;
    }
    const filePath = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
    if (!filePath.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
    const body = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    const contentType = extension === '.js' || extension === '.mjs' ? 'text/javascript; charset=utf-8'
      : extension === '.json' ? 'application/json; charset=utf-8'
      : extension === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' }); res.end(body);
  } catch (error) { res.writeHead(404); res.end(String(error)); }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const playwright = await import(pathToFileURL(path.resolve(PLAYWRIGHT)).href);
const contextDir = path.resolve(BROWSER_PROFILE);
await fs.mkdir(contextDir, { recursive: true });
const resolvedProfile = await fs.realpath(contextDir);
if (!resolvedProfile.startsWith('/mnt/workspace/.dev-state/agent-work/cache/')) {
  throw new Error(`Browser profile is outside persistent agent-work/cache: ${resolvedProfile}`);
}
const context = await playwright.chromium.launchPersistentContext(contextDir, {
  headless: true, executablePath: CHROMIUM,
  viewport: { width: CSS_WIDTH, height: CSS_HEIGHT }, deviceScaleFactor: INITIAL_PIXEL_RATIO,
  isMobile: true, hasTouch: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const browserVersion = context.browser()?.version?.() || null;
const page = context.pages()[0] || await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });

let report;
try {
  await page.goto(`http://127.0.0.1:${address.port}/__composer-webgl-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__composerWebGLReady === true, null, { timeout: 20000 });
  report = await page.evaluate((payload) => globalThis.runComposerWebGLProbe(payload), {
    gradeInitializer, fxaaInitializer, screenFxVertex, screenFxFragment, tolerance: RGB_TOLERANCE,
  });
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}

const comparisons = report.comparisons.map(({ referencePngBase64, packedPngBase64, ...item }) => item);
const imagePaths = [];
for (let index = 0; index < report.comparisons.length; index++) {
  const comparison = report.comparisons[index];
  const selectedTargetSuffix = report.actualFormatProbe.type === 35899 ? 'r11f-g11f-b10f'
    : report.actualFormatProbe.packed ? `format-${report.actualFormatProbe.format}-type-${report.actualFormatProbe.type}` : 'rgba16f-selected';
  for (const [suffix, payload] of [['rgba16f-reference', comparison.referencePngBase64], [selectedTargetSuffix, comparison.packedPngBase64]]) {
    const file = `${String(index + 1).padStart(2, '0')}-${comparison.name}-${suffix}.png`;
    await fs.writeFile(path.join(resolvedEvidence, file), Buffer.from(payload, 'base64'));
    imagePaths.push(file);
  }
}
report.comparisons = comparisons;
report.toolchain = {
  browser: 'Chromium/Chrome for Testing', browserVersion,
  chromiumExecutable: CHROMIUM, playwrightModule: PLAYWRIGHT,
  cssViewport: [CSS_WIDTH,CSS_HEIGHT], deviceScaleFactor: INITIAL_PIXEL_RATIO,
  postStack: ['RenderPass', 'shipped GradeShader', 'shipped ScreenFX', 'shipped OutputPass', 'shipped FXAAShader'],
  scenarios: report.comparisons.map((item) => item.name), imageEvidence: imagePaths,
  sourceSha256: sourceHashes, pageErrors,
};
report.failures = [];
if (!report.gpu.isWebGL2 || !report.gpu.extColorBufferFloat) report.failures.push('WebGL2/EXT_color_buffer_float unavailable');
if (!report.actualFormatProbe.packed) report.failures.push(`packed target probe did not select: ${report.actualFormatProbe.reason}`);
if (report.negativeGradeFallback.packed) report.failures.push('negative Grade unexpectedly retained packed target');
if (report.profiles.desktopHigh.hdr.packed || report.profiles.desktopHigh.hdr.type !== 1016) report.failures.push('desktop selection did not retain HalfFloat HDR');
if (report.contextErrors !== 0 || report.contextLost) report.failures.push(`WebGL context error/loss: ${report.contextErrors}/${report.contextLost}`);
if (pageErrors.length) report.failures.push(`browser console/page errors: ${pageErrors.join(' | ')}`);
for (const item of report.comparisons) {
  const m = item.metrics;
  if (m.meanAbsoluteCode > RGB_TOLERANCE.meanAbsoluteCode || m.p99AbsoluteCode > RGB_TOLERANCE.p99AbsoluteCode
    || m.alphaMismatchPixels > RGB_TOLERANCE.alphaMismatchPixels) {
    report.failures.push(`${item.name} image diff exceeds tolerance: ${JSON.stringify(m)}`);
  }
}
for (const step of report.lifecycle.steps) {
  for (const target of [step.targets.target1,step.targets.target2]) {
    if (!target.framebufferComplete) report.failures.push(`${step.label} target FBO incomplete`);
  }
}
if (report.lifecycle.scaleDisposals !== 2 || report.lifecycle.resizeDisposals !== 2 || report.lifecycle.finalDisposals !== 2) {
  report.failures.push(`lifecycle target dispose event counts unexpected: ${JSON.stringify(report.lifecycle)}`);
}
const reportText = JSON.stringify(report, null, 2) + '\n';
const pending = path.join(resolvedEvidence, 'webgl-comparison.json.pending');
await fs.writeFile(pending, reportText);
await fs.rename(pending, path.join(resolvedEvidence, 'webgl-comparison.json'));
console.log(JSON.stringify({
  gpu: report.gpu, format: report.actualFormatProbe,
  comparisonSummary: report.comparisons.map((item) => ({ name: item.name, ...item.metrics })),
  lifecycle: report.lifecycle, tolerance: report.tolerance, failures: report.failures,
  imageEvidence: imagePaths,
}, null, 2));
if (report.failures.length) process.exitCode = 1;
