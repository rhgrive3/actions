// Project resource budgets, not Nintendo/Switch memory measurements.
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
  if (!paused) { game._pausedWorld = null; return { paused: false, draw: true }; }
  const gl = G.renderer?.getContext?.();
  if (gl?.isContextLost?.()) { game._pausedWorld = null; return { paused: true, draw: false }; }
  const stamp = JSON.stringify([viewport.innerWidth, viewport.innerHeight, viewport.devicePixelRatio,
    game.settings, game.R?.dynScale, G.env?.theme, game._pausedWorldRevision || 0]);
  const previous = game._pausedWorld;
  return { paused: true, draw: !previous || previous.match !== game.match || previous.level !== G.level || previous.stamp !== stamp,
    commit() { game._pausedWorld = { match: game.match, level: G.level, stamp }; } };
}
