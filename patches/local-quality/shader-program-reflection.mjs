// compileAsync() links programs but, in the bundled Three.js, does not read
// their uniform/attribute locations. The first visible draw does that work.
// For a small, known set of long-lived materials, move that first-use work to
// the existing loading warmup, after compileAsync resolves. Each WebGLProgram
// already caches this data and may be shared with a later material.
export function warmProgramReflection(renderer, material) {
  if (!material || typeof renderer?.properties?.get !== 'function') return 0;
  let gl, programs, unique;
  try {
    // Without KHR, Three.js isReady() returns true without checking the GPU;
    // getUniforms() could then synchronously stall the main thread and defeat
    // the match loader's timeout. Leave that renderer on its original path.
    if (renderer.extensions?.has?.('KHR_parallel_shader_compile') !== true) return 0;
    gl = renderer.getContext?.();
    if (!gl || gl.isContextLost?.()) return 0;
    programs = renderer.properties.get(material)?.programs;
    if (!(programs instanceof Map)) return 0;
    unique = new Set(programs.values());
  } catch { return 0; }
  let warmed = 0;
  for (const program of unique) {
    try {
      if (typeof program?.isReady !== 'function' || typeof program?.getUniforms !== 'function') continue;
      if (gl?.isContextLost?.() || !program.isReady()) continue;
      // Three.js getUniforms() initializes both uniforms and attributes once.
      program.getUniforms();
      warmed++;
    } catch { /* preserve the normal first-use fallback */ }
  }
  return warmed;
}
