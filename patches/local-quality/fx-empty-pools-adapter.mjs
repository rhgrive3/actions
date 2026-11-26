// Build-time-only, image-identical FX pool culling.
//
// Each FX particle pool (droplets, puffs, glows, rings+marks, shells, beams+pillars) is one always-visible instanced
// mesh. With no live particles its instanceCount is 0 and nothing is drawn, yet a visible mesh still costs three.js
// its render-list entry, program/state/VAO setup and uniform uploads every frame. The pool updates are the only place
// instanceCount changes (clear() only zeroes it), so after them each mesh is shown exactly when it has instances.
// The ambient motes keep their own visibility switch. Fail closed when an anchor changes.
export function adaptFxEmptyPools(rel, code, replaceOnce) {
  if (rel !== 'src/fx/fx.js') return code;
  const hideAll = '    this.dMesh.visible = this.puffs.mesh.visible = this.glows.mesh.visible = this.rings.mesh.visible = this.shells.mesh.visible = this.beams.mesh.visible = false;';
  code = replaceOnce(code,
    '    this._initMotes(Math.round(300 * this.q));',
    '    this._initMotes(Math.round(300 * this.q));\n' + hideAll,
    'fx empty pools: hide instanced pools on construction');
  code = replaceOnce(code,
    '    this.marks.n = 0; this.pillars.n = 0; this._sqN = 0;\n  }',
    '    this.marks.n = 0; this.pillars.n = 0; this._sqN = 0;\n' + hideAll + '\n  }',
    'fx empty pools: hide instanced pools on clear');
  return replaceOnce(code,
    '    this._updateShells(dt);\n    this._updateBeams(dt);\n  }\n',
    '    this._updateShells(dt);\n    this._updateBeams(dt);\n' +
    '    const _p = this._iwPoolMeshes || (this._iwPoolMeshes = new Array(6));\n' +
    '    _p[0] = this.dMesh; _p[1] = this.puffs.mesh; _p[2] = this.glows.mesh; _p[3] = this.rings.mesh; _p[4] = this.shells.mesh; _p[5] = this.beams.mesh;\n' +
    // Keep 'for (const m of this._iwPoolMeshes ||' verbatim for downstream queue-ui-continuation-20261029-adapter.mjs:158 anchor.
    '    for (const m of this._iwPoolMeshes || _p)\n' +
    '      m.visible = m.geometry.instanceCount > 0;\n  }\n',
    'fx empty pools: hide instanced pools with no live particles');
}
