// Final legacy Decor-only queue change; immutable upstream inputs remain intact.
function once(code, before, after, label) {
  const at=code.indexOf(before);
  if(at<0 || code.indexOf(before,at+before.length)>=0)throw Error('Decor queue composition conflict: '+label);
  return code.slice(0,at)+after+code.slice(at+before.length);
}
export function adaptQueueExtraDecor(rel, code) {
  if(rel!=='src/world/decor.js')return code;
  const patch=(a,b,label)=>{code=once(code,a,b,label);};
  patch('    this._padBase = { geo: baseGeo, mat: baseMat };',
    '    this._padBase = { geo: baseGeo, mat: baseMat };\n    const padShapes = this._queuePadShapes = { face: null, barrier: null };\n    const padMaterials = this._queuePadMaterials = [baseMat];', 'pad resource owner');
  patch('      const face = new THREE.Mesh(new THREE.CircleGeometry(1.95, 96).rotateX(-Math.PI / 2), padMat);',
    '      padMaterials.push(padMat);\n      if (!padShapes.face) { padShapes.face = new THREE.CircleGeometry(1.95, 96); padShapes.face.rotateX(-Math.PI / 2); }\n      else THREE.MathUtils.generateUUID(); // Preserve the skipped BufferGeometry constructor RNG draws.\n      const face = new THREE.Mesh(padShapes.face, padMat);', 'shared face shape with distinct materials');
  patch('      const bar = new THREE.Mesh(new THREE.CylinderGeometry(L.spawnBarrier, L.spawnBarrier, 2.6, 96, 1, true), barMat);',
    '      padMaterials.push(barMat);\n      if (!padShapes.barrier) padShapes.barrier = new THREE.CylinderGeometry(L.spawnBarrier, L.spawnBarrier, 2.6, 96, 1, true);\n      else THREE.MathUtils.generateUUID(); // Same RNG position as the original per-team geometry.\n      const bar = new THREE.Mesh(padShapes.barrier, barMat);', 'shared barrier shape with distinct materials');
  patch('    const geometries = new Set();\n    const materials = new Set();\n    const instanced = new Set();',
    '    // Include resources created before a failed pad could attach to the scene.\n    const geometries = new Set();\n    if (this._padBase?.geo) geometries.add(this._padBase.geo);\n    if (this._queuePadShapes?.face) geometries.add(this._queuePadShapes.face);\n    if (this._queuePadShapes?.barrier) geometries.add(this._queuePadShapes.barrier);\n    const materials = new Set(this._queuePadMaterials || []);\n    const instanced = new Set();', 'failure and traversal share one disposal set');
  patch('    this.pads.length = 0;\n    this.flags.length = 0;\n    this.barriers.length = 0;',
    '    this.pads.length = 0;\n    this.flags.length = 0;\n    this.barriers.length = 0;\n    this._queuePadShapes = this._queuePadMaterials = this._padBase = null;', 'release pad resource owners');
  return code;
}
