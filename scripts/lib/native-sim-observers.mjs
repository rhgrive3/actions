// Wrapping raycast/ray changes identity guards in NativePhysics.groundProbe
// and los, selecting the slower scalar fallback. Observe their callers and
// the existing BVH counters instead; never replace either canonical method.
export const NATIVE_SIM_PHYSICS_METHODS = Object.freeze([
  'groundProbe', 'collideBody', 'bodyFits', 'cameraProbe', 'segment',
]);
export const NATIVE_SIM_BVH_METHODS = Object.freeze([
  'rayDownBatch', 'queryBox', 'sweepSphere',
]);
