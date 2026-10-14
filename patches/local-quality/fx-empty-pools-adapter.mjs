// Build-time-only, image-identical FX pool culling.
//
// Each FX particle pool (droplets, puffs, glows, rings+marks, shells, beams+pillars) is one always-visible instanced
// mesh. With no live particles its instanceCount is 0 and nothing is drawn, yet a visible mesh still costs three.js
// its render-list entry, program/state/VAO setup and uniform uploads every frame. The pool updates are the only place
// instanceCount changes (clear() only zeroes it), so after them each mesh is shown exactly when it has instances.
// The ambient motes keep their own visibility switch. Fail closed when an anchor changes.
export function adaptFxEmptyPools(rel, code, replaceOnce) {
  if (rel !== 'src/fx/fx.js') return code;
  return replaceOnce(code,
    '    this._updateShells(dt);\n    this._updateBeams(dt);\n  }\n',
    '    this._updateShells(dt);\n    this._updateBeams(dt);\n' +
    '    for (const m of this._iwPoolMeshes || (this._iwPoolMeshes = [this.dMesh, this.puffs.mesh, this.glows.mesh, this.rings.mesh, this.shells.mesh, this.beams.mesh]))\n' +
    '      m.visible = m.geometry.instanceCount > 0;\n  }\n',
    'fx empty pools: hide instanced pools with no live particles');
}
