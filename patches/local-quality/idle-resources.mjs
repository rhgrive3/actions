// Project resource budgets, not Nintendo/Switch memory measurements.
export const MENU_ATTRACT_HZ = 20;
export const MENU_ATTRACT_STEP = 1 / MENU_ATTRACT_HZ;
const EMPTY_SETTINGS = Object.freeze({});
const LIVE_WORLD = Object.freeze({ paused: false, draw: true });
const PAUSED_UNCHANGED = Object.freeze({ paused: true, draw: false });
const BACKDROP_SETTINGS = Object.freeze(['quality','shadows','bloom','fov','cameraShake','colorblind','timeOfDay','gyro']);

export function idleAttractMenuBudget(game, G) {
  const mobile = game?.mobile ?? G?.mobile ?? {};
  return !!(game?.match?.attract && G?.mode === 'menu' && !game?.showcase?.fullFrame &&
    (mobile.touch || game?.settings?.quality === 'low'));
}

export function notePausedWorldChange(game, partial) {
  if (!game) return;
  if (partial) {
    let changed = false;
    for (const key of BACKDROP_SETTINGS) if (Object.hasOwn(partial, key) && game.settings?.[key] !== partial[key]) { changed = true; break; }
    if (!changed) return;
  }
  game._pausedWorldRevision = (game._pausedWorldRevision || 0) + 1;
}

export function environmentBudget(settings = {}, mobile = {}) {
  const constrained = mobile?.touch || settings?.quality === 'low';
  return constrained ? { cloudWidth: 1024, cloudHeight: 320, farSize: 256 }
    : { cloudWidth: 2048, cloudHeight: 640, farSize: 512 };
}

export function releaseFarReflection(env) {
  env.U.uFarOn.value = 0;
  env.U.uFarCube.value = null;
  const target = env._farRT;
  env._farRT = env._farCam = null;
  target?.dispose();
}

// The planar reflection target (RGBA16F + depth, mipmapped) only exists for marina water. Leaving that stage class
// releases it and clears the sampler; _renderReflection recreates it lazily on the next marina entry.
export function releaseReflection(env) {
  env.U.uReflOn.value = 0;
  env.U.uReflTex.value = null;
  const target = env._reflRT;
  env._reflRT = env._reflCam = null;
  target?.dispose();
}

export function refreshEnvironmentBudget(env, settings, mobile) {
  if (!env?._cloudRT) return false;
  const q = environmentBudget(settings, mobile), rt = env._cloudRT;
  const cloudChanged = rt.width !== q.cloudWidth || rt.height !== q.cloudHeight;
  const farChanged = !!env._farRT && env._farRT.width !== q.farSize;
  if (!cloudChanged && !farChanged) return false;
  if (cloudChanged) {
    // Three.setSize disposes the old GPU allocation, retaining its texture owner.
    rt.setSize(q.cloudWidth, q.cloudHeight);
    env._cloudMat.uniforms.uRes.value.set(q.cloudWidth, q.cloudHeight);
  }
  if (farChanged) releaseFarReflection(env);
  // Clouds feed both the visible sky and PMREM; update both together once.
  env.setTheme(env.theme);
  return true;
}

export function pausedWorldFrame(game, G, viewport = globalThis) {
  // A platform owner can stop RAF throughout context loss. Do not depend on
  // observing a lost context inside a frame in order to repaint after restore.
  const canvas = G.renderer?.domElement;
  if (game._pausedWorldCanvas?.canvas !== canvas) {
    const previous = game._pausedWorldCanvas;
    for (const event of ['webglcontextlost', 'webglcontextrestored']) previous?.canvas?.removeEventListener?.(event, previous.invalidate);
    game._pausedWorldCanvas = null;
    if (canvas?.addEventListener) {
      const invalidate = () => { game._pausedWorld = null; };
      for (const event of ['webglcontextlost', 'webglcontextrestored']) canvas.addEventListener(event, invalidate);
      game._pausedWorldCanvas = { canvas, invalidate };
    }
    game._pausedWorld = null;
  }
  const paused = !!(game.match?.paused && !game.match.attract && !G.netm && !game.showcase?.fullFrame);
  if (!paused) { game._pausedWorld = null; return LIVE_WORLD; }
  const gl = G.renderer?.getContext?.();
  if (gl?.isContextLost?.()) { game._pausedWorld = null; return PAUSED_UNCHANGED; }
  const width = viewport.innerWidth, height = viewport.innerHeight, pixelRatio = viewport.devicePixelRatio;
  const settings = game.settings || EMPTY_SETTINGS, camera = G.camera, position = camera?.position;
  const quaternion = camera?.quaternion, scale = camera?.scale;
  const renderer = G.renderer, shadows = renderer?.shadowMap;
  const render = game.R, bloom = render?.bloom, ao = render?.gtao, env = G.env, far = env?._farRT;
  const revision = game._pausedWorldRevision || 0;
  const previous = game._pausedWorld;
  const draw = !previous || previous.match !== game.match || previous.level !== G.level ||
    previous.width !== width || previous.height !== height || previous.pixelRatio !== pixelRatio ||
    previous.quality !== settings.quality || previous.shadowsSetting !== settings.shadows ||
    previous.bloomSetting !== settings.bloom || previous.fovSetting !== settings.fov ||
    previous.cameraShake !== settings.cameraShake || previous.colorblind !== settings.colorblind ||
    previous.timeOfDay !== settings.timeOfDay || previous.gyro !== settings.gyro ||
    previous.revision !== revision || previous.camera !== camera ||
    previous.cameraX !== position?.x || previous.cameraY !== position?.y || previous.cameraZ !== position?.z ||
    previous.cameraQx !== quaternion?.x || previous.cameraQy !== quaternion?.y ||
    previous.cameraQz !== quaternion?.z || previous.cameraQw !== quaternion?.w ||
    previous.cameraScaleX !== scale?.x || previous.cameraScaleY !== scale?.y || previous.cameraScaleZ !== scale?.z ||
    previous.cameraFov !== camera?.fov || previous.cameraAspect !== camera?.aspect ||
    previous.cameraNear !== camera?.near || previous.cameraFar !== camera?.far || previous.cameraZoom !== camera?.zoom ||
    previous.renderer !== renderer || previous.canvas !== canvas ||
    previous.canvasWidth !== canvas?.width || previous.canvasHeight !== canvas?.height ||
    previous.rendererPixelRatio !== renderer?.getPixelRatio?.() || previous.autoClear !== renderer?.autoClear ||
    previous.toneMapping !== renderer?.toneMapping || previous.toneMappingExposure !== renderer?.toneMappingExposure ||
    previous.outputColorSpace !== renderer?.outputColorSpace ||
    previous.shadowEnabled !== shadows?.enabled || previous.shadowAutoUpdate !== shadows?.autoUpdate ||
    previous.render !== render || previous.dynScale !== render?.dynScale || previous.renderQuality !== render?.q ||
    previous.qualityPixelRatio !== render?.q?.pixelRatio || previous.qualityShadowSize !== render?.q?.shadowSize ||
    previous.qualityMsaa !== render?.q?.msaa || previous.qualityBloom !== render?.q?.bloom ||
    previous.qualityAo !== render?.q?.ao || previous.bloom !== bloom || previous.bloomEnabled !== bloom?.enabled ||
    previous.bloomStrength !== bloom?.strength || previous.bloomRadius !== bloom?.radius ||
    previous.bloomThreshold !== bloom?.threshold || previous.ao !== ao || previous.aoEnabled !== ao?.enabled ||
    previous.environment !== env || previous.theme !== env?.theme || previous.reflections !== env?.reflections ||
    previous.reflectionScale !== env?.reflScale || previous.marina !== env?._marina || previous.farTarget !== far ||
    previous.farWidth !== far?.width || previous.farHeight !== far?.height;
  if (!draw) return PAUSED_UNCHANGED;
  return { paused: true, draw: true,
    commit() {
      game._pausedWorld = { match: game.match, level: G.level, width, height, pixelRatio, settings,
        quality: settings.quality, shadowsSetting: settings.shadows, bloomSetting: settings.bloom,
        fovSetting: settings.fov, cameraShake: settings.cameraShake, colorblind: settings.colorblind,
        timeOfDay: settings.timeOfDay, gyro: settings.gyro,
        revision, camera, cameraX: position?.x, cameraY: position?.y, cameraZ: position?.z,
        cameraQx: quaternion?.x, cameraQy: quaternion?.y, cameraQz: quaternion?.z, cameraQw: quaternion?.w,
        cameraScaleX: scale?.x, cameraScaleY: scale?.y, cameraScaleZ: scale?.z,
        cameraFov: camera?.fov, cameraAspect: camera?.aspect, cameraNear: camera?.near,
        cameraFar: camera?.far, cameraZoom: camera?.zoom, renderer, canvas, canvasWidth: canvas?.width,
        canvasHeight: canvas?.height, rendererPixelRatio: renderer?.getPixelRatio?.(), autoClear: renderer?.autoClear,
        toneMapping: renderer?.toneMapping, toneMappingExposure: renderer?.toneMappingExposure,
        outputColorSpace: renderer?.outputColorSpace, shadowEnabled: shadows?.enabled,
        shadowAutoUpdate: shadows?.autoUpdate, render, dynScale: render?.dynScale, renderQuality: render?.q,
        qualityPixelRatio: render?.q?.pixelRatio, qualityShadowSize: render?.q?.shadowSize,
        qualityMsaa: render?.q?.msaa, qualityBloom: render?.q?.bloom, qualityAo: render?.q?.ao,
        bloom, bloomEnabled: bloom?.enabled, bloomStrength: bloom?.strength, bloomRadius: bloom?.radius,
        bloomThreshold: bloom?.threshold, ao, aoEnabled: ao?.enabled, environment: env, theme: env?.theme,
        reflections: env?.reflections, reflectionScale: env?.reflScale, marina: env?._marina,
        farTarget: far, farWidth: far?.width, farHeight: far?.height };
    } };
}
