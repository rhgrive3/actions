// #642 acceptance: mobile may use packed RGB HDR only after an actual
// render-target framebuffer probe; unsafe grades and unsupported contexts keep
// the original RGBA16F precision. Native Three objects below verify pair size,
// resize and disposal. The injected renderer models FBO outcomes; it is not a
// substitute for a browser/device pixel comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity, replaceOnce } from '../adapter.mjs';
import {
  adaptComposerFormat,
  configureComposerColorTargets,
  composerGradeKeepsPackedTargetNonnegative,
  selectComposerTargetFormat,
} from '../composer-format-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'inkwave-public');
const REL = 'src/core/renderer.js';
const BASELINE_TARGET =
  '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';

function compose(rel) {
  const raw = fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
  return adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
}

async function linkEntry(src) {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  const resolve = (spec, from) =>
    spec === 'three' ? path.join(UPSTREAM, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/')
      ? path.join(UPSTREAM, 'vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from), spec);
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(UPSTREAM, file);
    const code = rel.startsWith('..') ? fs.readFileSync(file, 'utf8')
      : rel === 'src/config.js' ? compose(rel) : fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  };
  const entry = new vm.SourceTextModule(src, { context, identifier: path.join(ROOT, 'c642-entry.mjs') });
  await entry.link((spec, from) => load(resolve(spec, from.identifier)));
  await entry.evaluate();
  return entry.namespace;
}

function fboRenderer({ complete = true, webgl2 = true, floatExtension = true, throwOnProbe = false } = {}) {
  const priorTarget = { label: 'prior-render-target' };
  const state = { bound: priorTarget, probes: [], probeDisposals: 0, checks: 0, restores: 0 };
  const gl = {
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
    checkFramebufferStatus(target) {
      assert.equal(target, this.FRAMEBUFFER);
      state.checks++;
      return complete ? this.FRAMEBUFFER_COMPLETE : this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
    },
  };
  const renderer = {
    capabilities: { isWebGL2: webgl2 },
    extensions: { has: (name) => name === 'EXT_color_buffer_float' && floatExtension },
    getContext: () => gl,
    getRenderTarget: () => state.bound,
    initRenderTarget(target) {
      state.probes.push(target);
      target.addEventListener('dispose', () => state.probeDisposals++);
      if (throwOnProbe) throw new Error('probe initialization failed');
    },
    setRenderTarget(target) {
      if (target === priorTarget) state.restores++;
      state.bound = target;
    },
  };
  return { renderer, state, priorTarget };
}

const nativeComposerRenderer = (pixelRatio) => ({
  getPixelRatio: () => pixelRatio,
  getSize: (target) => target.set(1, 1),
});

const MOBILE_QUALITY = { ao: false, bloom: false };
const SCREENFX_SOURCE = fs.readFileSync(path.join(UPSTREAM, 'src/fx/screenfx.js'), 'utf8');
const SCREENFX_SHADER = SCREENFX_SOURCE.match(/const FRAG = \/\* glsl \*\/`([\s\S]*?)`;/)?.[1];
assert.ok(SCREENFX_SHADER, 'read the production ScreenFX fragment shader');
const SCREENFX_PASS = { material: { fragmentShader: SCREENFX_SHADER } };

const PROFILES = [
  { name: 'touch-iOS-HIGH', quality: 'high', mobile: { touch: true, ios: true }, css: [744, 1133], dpr: 3 },
  { name: 'touch-Android-HIGH', quality: 'high', mobile: { touch: true, ios: false }, css: [800, 1280], dpr: 3 },
  { name: 'touch-iOS-MEDIUM', quality: 'medium', mobile: { touch: true, ios: true }, css: [744, 1133], dpr: 3 },
  { name: 'touch-iOS-LOW', quality: 'low', mobile: { touch: true, ios: true }, css: [744, 1133], dpr: 3 },
  { name: 'desktop-HIGH', quality: 'high', mobile: { touch: false }, css: [1920, 1080], dpr: 1.5 },
  { name: 'desktop-ULTRA', quality: 'ultra', mobile: { touch: false }, css: [1920, 1080], dpr: 2 },
];

test('#642 acceptance: mobile uses a renderable packed HDR pair and frees it on resize/dispose', async () => {
  const ns = await linkEntry(
    `export * as THREE from 'three';\n` +
    `export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';\n` +
    `export { RenderPass } from 'three/addons/postprocessing/RenderPass.js';\n` +
    `export { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';\n` +
    `export { effectiveQuality } from './inkwave-public/src/config.js';`);
  assert.equal(ns.THREE.REVISION, '186');
  assert.equal(ns.THREE.RGBFormat, 1022);
  assert.equal(ns.THREE.UnsignedInt101111Type, 35899);
  const threeSource = fs.readFileSync(path.join(UPSTREAM, 'vendor/three/build/three.module.js'), 'utf8');
  assert.ok(threeSource.includes('if ( glType === _gl.UNSIGNED_INT_10F_11F_11F_REV ) internalFormat = _gl.R11F_G11F_B10F;'));
  assert.ok(threeSource.includes('if ( p === UnsignedInt101111Type ) return gl.UNSIGNED_INT_10F_11F_11F_REV;'));

  for (const profile of PROFILES.filter((item) => item.mobile.touch)) {
    const q = ns.effectiveQuality({ quality: profile.quality }, profile.mobile);
    const ratio = Math.min(profile.dpr, q.pixelRatio, profile.mobile.ios ? 1.2 : 1.35);
    const width = profile.css[0] * ratio;
    const height = profile.css[1] * ratio;
    const { renderer, state, priorTarget } = fboRenderer();
    const decision = selectComposerTargetFormat(ns.THREE, renderer, {
      touch: true, quality: q, samples: 0, screenFx: SCREENFX_PASS,
    });

    assert.equal(decision.mode, 'mixed-r11f-grade-rgba16f-scene', `${profile.name} mixed target pair`);
    assert.equal(decision.reason, 'webgl2-fbo-complete');
    assert.equal(state.checks, 1, `${profile.name} ran the FBO completeness check`);
    assert.equal(state.probeDisposals, 1, `${profile.name} released the probe target`);
    assert.equal(state.bound, priorTarget, `${profile.name} restored the prior target`);
    assert.equal(state.restores, 1);

    const target = new ns.THREE.WebGLRenderTarget(width, height, decision.options);
    const composer = new ns.EffectComposer(nativeComposerRenderer(ratio), target);
    configureComposerColorTargets(ns.THREE, composer, decision);
    composer.setPixelRatio(ratio);
    composer.setSize(profile.css[0], profile.css[1]);
    const renderPass = new ns.RenderPass(new ns.THREE.Scene(), new ns.THREE.Camera());
    const gradePass = new ns.ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'void main(){ gl_Position = vec4(0.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }',
    });
    composer.addPass(renderPass);
    composer.addPass(gradePass);
    const pair = [composer.renderTarget1, composer.renderTarget2];
    assert.equal(composer.passes.length, 2);
    assert.equal(composer.passes[0], renderPass);
    assert.equal(composer.passes[1], gradePass);
    assert.equal(renderPass.needsSwap, false, `${profile.name} RenderPass keeps scene in readBuffer`);
    assert.equal(gradePass.needsSwap, true, `${profile.name} Grade ShaderPass swaps after writing`);
    assert.notEqual(pair[0], pair[1]);
    assert.equal(composer.writeBuffer, pair[0], `${profile.name} Grade destination starts as packed target1`);
    assert.equal(composer.readBuffer, pair[1], `${profile.name} RenderPass scene input starts as HalfFloat target2`);
    const touchedTargets = [];
    const passRenderer = {
      autoClear: true,
      autoClearColor: true,
      autoClearDepth: true,
      autoClearStencil: true,
      setRenderTarget: (value) => touchedTargets.push(value),
      clear: () => {},
      render: () => {},
    };
    renderPass.render(passRenderer, composer.writeBuffer, composer.readBuffer);
    gradePass.render(passRenderer, composer.writeBuffer, composer.readBuffer);
    assert.deepEqual(touchedTargets, [pair[1], pair[0]],
      `${profile.name} RenderPass writes HalfFloat scene first; Grade writes packed output second`);
    composer.swapBuffers();
    assert.equal(composer.readBuffer, pair[0], `${profile.name} ScreenFX then reads packed Grade output`);
    composer.swapBuffers();
    for (const [index, item] of pair.entries()) {
      assert.equal(item.width, width, `${profile.name} target width`);
      assert.equal(item.height, height, `${profile.name} target height`);
      assert.equal(item.samples, 0, `${profile.name} no MSAA`);
      assert.equal(item.texture.format, index === 0 ? ns.THREE.RGBFormat : ns.THREE.RGBAFormat,
        `${profile.name} target ${index + 1} format`);
      assert.equal(item.texture.type, index === 0 ? ns.THREE.UnsignedInt101111Type : ns.THREE.HalfFloatType,
        `${profile.name} target ${index + 1} precision`);
    }
    const pixels = Math.ceil(pair[0].width) * Math.ceil(pair[0].height);
    const mixedBytes = pixels * (4 + 8);
    const halfFloatBytes = pixels * (8 + 8);
    assert.equal(mixedBytes * 4, halfFloatBytes * 3,
      `${profile.name} reduces pair color bytes by 25%, excluding depth/driver overhead`);

    let targetDisposals = 0;
    for (const item of pair) item.addEventListener('dispose', () => targetDisposals++);
    const resizedCssWidth = profile.css[0] * 0.8;
    const resizedCssHeight = profile.css[1] * 0.8;
    composer.setSize(resizedCssWidth, resizedCssHeight);
    assert.equal(targetDisposals, 2, `${profile.name} resized both targets exactly once`);
    assert.deepEqual(pair.map((item) => [item.width, item.height]), [
      [resizedCssWidth * ratio, resizedCssHeight * ratio],
      [resizedCssWidth * ratio, resizedCssHeight * ratio],
    ]);
    composer.dispose();
    assert.equal(targetDisposals, 4, `${profile.name} disposal released the resized pair exactly once`);
    gradePass.dispose();
  }
});

test('#642 acceptance: unsupported WebGL, incomplete FBO and unproven ScreenFX fall back to RGBA16F', async () => {
  const ns = await linkEntry(
    `export * as THREE from 'three';\n` +
    `export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';`);
  for (const scenario of [
    { name: 'WebGL 1', options: { webgl2: false }, expected: 'webgl2-required' },
    { name: 'missing float color buffer extension', options: { floatExtension: false }, expected: 'float-color-buffer-extension-missing' },
    { name: 'incomplete packed framebuffer', options: { complete: false }, expected: 'packed-framebuffer-incomplete' },
    { name: 'failed framebuffer setup', options: { throwOnProbe: true }, expected: 'packed-framebuffer-incomplete' },
    { name: 'MSAA profile', options: {}, samples: 2, expected: 'profile-keeps-rgba16f' },
    { name: 'AO profile', options: {}, quality: { ao: true, bloom: false }, expected: 'profile-keeps-rgba16f' },
    { name: 'bloom profile', options: {}, quality: { ao: false, bloom: true }, expected: 'profile-keeps-rgba16f' },
  ]) {
    const { renderer, state, priorTarget } = fboRenderer(scenario.options);
    const decision = selectComposerTargetFormat(ns.THREE, renderer, {
      touch: true, quality: scenario.quality || MOBILE_QUALITY,
      samples: scenario.samples ?? 0, grade: null, screenFx: SCREENFX_PASS,
    });
    assert.equal(decision.mode, 'rgba16f', scenario.name);
    assert.equal(decision.reason, scenario.expected, scenario.name);
    assert.equal(decision.options.format, ns.THREE.RGBAFormat, scenario.name);
    assert.equal(decision.options.type, ns.THREE.HalfFloatType, scenario.name);
    assert.equal(decision.options.depthBuffer, true, `${scenario.name} retains the existing depth attachment`);
    const target = new ns.THREE.WebGLRenderTarget(64, 32, decision.options);
    const composer = new ns.EffectComposer(nativeComposerRenderer(1), target);
    configureComposerColorTargets(ns.THREE, composer, decision);
    assert.deepEqual([composer.renderTarget1.texture.type, composer.renderTarget2.texture.type],
      [ns.THREE.HalfFloatType, ns.THREE.HalfFloatType], `${scenario.name} keeps both targets HalfFloat`);
    composer.dispose();
    if (state.probes.length) assert.equal(state.probeDisposals, 1, `${scenario.name} disposes its attempted probe`);
    assert.equal(state.bound, priorTarget, `${scenario.name} restores the previous target`);
  }

  const unknownScreenFx = { material: { fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }' } };
  const { renderer, state } = fboRenderer();
  const decision = selectComposerTargetFormat(ns.THREE, renderer, {
    touch: true, quality: MOBILE_QUALITY, samples: 0, screenFx: unknownScreenFx,
  });
  assert.equal(decision.reason, 'screenfx-output-not-proven');
  assert.equal(decision.mode, 'rgba16f');
  assert.equal(state.checks, 0, 'unrecognized passes fall back before touching the GL state');

  const missingFormat = selectComposerTargetFormat({
    ...ns.THREE, UnsignedInt101111Type: undefined,
  }, renderer, { touch: true, quality: MOBILE_QUALITY, samples: 0, screenFx: SCREENFX_PASS });
  assert.equal(missingFormat.reason, 'packed-format-unavailable');
  assert.equal(state.checks, 0, 'missing Three format constants fall back before touching the GL state');
  const targetReadFailure = fboRenderer();
  targetReadFailure.renderer.getRenderTarget = () => { throw new Error('context unavailable'); };
  const inaccessibleTarget = selectComposerTargetFormat(ns.THREE, targetReadFailure.renderer, {
    touch: true, quality: MOBILE_QUALITY, samples: 0, screenFx: SCREENFX_PASS,
  });
  assert.equal(inaccessibleTarget.reason, 'framebuffer-probe-unavailable');
  assert.equal(targetReadFailure.state.probes.length, 0);

  const alphaLine = SCREENFX_SHADER.match(/gl_FragColor\s*=\s*vec4\(col,\s*1\.0\);/);
  assert.ok(alphaLine, 'production ScreenFX explicitly emits opaque alpha');
  assert.ok(SCREENFX_SHADER.includes('col = max(mix(vec3(l0), col, uSat * (1.0 - uDesat)), 0.0);'));
  const gradeShader = fs.readFileSync(path.join(UPSTREAM, 'src/core/renderer.js'), 'utf8');
  assert.ok(gradeShader.includes('gl_FragColor = c;'), 'Grade preserves sampled alpha; RGB targets supply alpha one');
  const rendererSource = fs.readFileSync(path.join(UPSTREAM, 'src/core/renderer.js'), 'utf8');
  const threeRendererSource = fs.readFileSync(path.join(UPSTREAM, 'vendor/three/build/three.module.js'), 'utf8');
  assert.ok(rendererSource.includes('antialias: false, powerPreference:'), 'renderer setup omits alpha:true');
  assert.ok(threeRendererSource.includes('alpha = false,'), 'Three r186 defaults WebGLRenderer alpha to false');
  const passOrder = [
    'comp.addPass(this.renderPass);', 'comp.addPass(this.grade);',
    'if (this.extraPass) comp.addPass(this.extraPass);',
    'comp.addPass(new OutputPass());', 'comp.addPass(this.fxaa);',
  ].map((token) => rendererSource.indexOf(token));
  assert.ok(passOrder.every((index) => index >= 0));
  assert.deepEqual(passOrder, [...passOrder].sort((a, b) => a - b),
    'the expected scene, Grade, ScreenFX, output and FXAA stages remain ordered');
});

test('#642 acceptance: negative grade output selects HalfFloat, shipped grades remain eligible, and desktop keeps HDR', async () => {
  const ns = await linkEntry(
    `export * as THREE from 'three';\n` +
    `export { effectiveQuality } from './inkwave-public/src/config.js';`);
  const envSource = fs.readFileSync(path.join(UPSTREAM, 'src/world/environment.js'), 'utf8');
  const lifts = [...envSource.matchAll(/uLift:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/g)].map((match) => Number(match[1]));
  assert.deepEqual(lifts, [0, 0, 0], 'all shipped stage grades keep nonnegative lift');
  assert.ok(envSource.includes('(hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0'),
    'scene dithering can be signed, so the RenderPass input must stay HalfFloat');
  assert.equal(composerGradeKeepsPackedTargetNonnegative({ uLift: 0 }), true);
  const mainSource = fs.readFileSync(path.join(UPSTREAM, 'src/main.js'), 'utf8');
  assert.ok(mainSource.includes('clamp(1 - loc.hp / 55, 0, 1)'), 'live low-health grade control is clamped to 0..1');
  assert.ok(mainSource.includes('g.uHurt.value = damp(g.uHurt.value, hpK * 0.8, 6, dt)'), 'live Grade hurt amount approaches at most 0.8');
  const gradeSource = fs.readFileSync(path.join(UPSTREAM, 'src/core/renderer.js'), 'utf8');
  assert.ok(gradeSource.includes('uFlash: { value: 0 }'), 'Grade flash begins at zero');
  assert.ok(!mainSource.includes('grade.uniforms.uFlash') && !mainSource.includes('g.uFlash.value'),
    'production code does not change Grade flash');

  const blackAtNegativeLift = 0.18 * Math.pow(1e-6 / 0.18, 1.07) - 0.01;
  assert.ok(blackAtNegativeLift < 0, 'the shader adds uLift after its nonnegative clamp, so a negative lift clips on unsigned RGB');
  assert.equal(composerGradeKeepsPackedTargetNonnegative({ uLift: -0.01 }), false);

  const { renderer } = fboRenderer();
  const negative = selectComposerTargetFormat(ns.THREE, renderer, {
    touch: true, quality: MOBILE_QUALITY, samples: 0,
    grade: { uLift: -0.01 }, screenFx: SCREENFX_PASS,
  });
  assert.equal(negative.canPack, true, 'the real FBO capability remains known for later grade changes');
  assert.equal(negative.packed, false);
  assert.equal(negative.reason, 'grade-can-output-negative-rgb');
  assert.equal(negative.options.type, ns.THREE.HalfFloatType);

  for (const profile of PROFILES.filter((item) => !item.mobile.touch)) {
    const q = ns.effectiveQuality({ quality: profile.quality }, profile.mobile);
    const { renderer: desktopRenderer, state } = fboRenderer();
    const decision = selectComposerTargetFormat(ns.THREE, desktopRenderer, {
      touch: false, quality: q, samples: q.msaa || 0, screenFx: SCREENFX_PASS,
    });
    assert.equal(decision.mode, 'rgba16f', `${profile.name} retains HalfFloat HDR`);
    assert.equal(decision.options.format, ns.THREE.RGBAFormat);
    assert.equal(decision.options.type, ns.THREE.HalfFloatType);
    assert.equal(state.checks, 0, `${profile.name} does not probe or change desktop targets`);
  }
});

test('#642 adapter composes with the existing renderer and the latest PR #1175 lazy target diff', () => {
  const raw = fs.readFileSync(path.join(UPSTREAM, REL), 'utf8');
  assert.ok(raw.includes(BASELINE_TARGET), 'the locked public renderer remains unchanged');
  const composed = compose(REL);
  assert.ok(composed.includes('selectComposerTargetFormat(THREE, r'));
  assert.ok(composed.includes('configureComposerColorTargets(THREE, comp, composerColorTarget)'));
  assert.ok(composed.includes('this._composerPackedCapable && this._composerUsesPackedTarget !== gradeCanUsePackedTarget'));
  assert.ok(composed.includes('type: THREE.UnsignedInt101111Type'));
  assert.ok(qualityIdentity()['composer-format-adapter.mjs']);
  assert.doesNotThrow(() => new vm.SourceTextModule(composed, { identifier: REL }));

  const baselineComposer =
    '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });\n' +
    '    const comp = (this.composer = new EffectComposer(r, rt));\n' +
    '    comp.setPixelRatio(pr);\n' +
    '    comp.setSize(w, h);';
  const lazyComposerSource =
    '    const comp = (this.composer = createLazyComposerTarget((state) => {\n' +
    '      const rt = new THREE.WebGLRenderTarget(\n' +
    '        state.width * state.pixelRatio, state.height * state.pixelRatio,\n' +
    '        { type: THREE.HalfFloatType, samples });\n' +
    '      const composer = new EffectComposer(r, rt);\n' +
    '      composer.setSize(state.width, state.height);\n' +
    '      return composer;\n' +
    '    }, { width: w, height: h, pixelRatio: pr, ownerDocument: r.domElement?.ownerDocument }));\n' +
    '    comp.setPixelRatio(pr);\n' +
    '    comp.setSize(w, h);';
  assert.ok(raw.includes(baselineComposer));
  const simulatedPr1175 = raw.replace(baselineComposer, lazyComposerSource);
  const lazyComposed = adaptComposerFormat(REL, simulatedPr1175, replaceOnce);
  assert.ok(lazyComposed.includes('createLazyComposerTarget'));
  assert.ok(lazyComposed.includes('state.width * state.pixelRatio'));
  assert.ok(lazyComposed.includes('composerColorTarget.options'));
  assert.ok(lazyComposed.includes('this._composerUsesPackedTarget = composerColorTarget.packed'));
  assert.ok(lazyComposed.includes('configureComposerColorTargets(THREE, composer, composerColorTarget)'));
  assert.doesNotThrow(() => new vm.SourceTextModule(lazyComposed, { identifier: `${REL}#pr1175` }));
});
