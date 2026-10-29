// Keep the existing FX geometry, shaders, draw order, and simulation. Ring
// colour/style data changes only at birth, recycling, compaction, or the
// immediate-mark tail; motion attributes continue updating every simulation.
function clearFxUploadRanges() { this.clearUpdateRanges(); }

function markFxStaticRange(attribute, first, last, liveEnd) {
  const changed = first < last;
  if (first >= last && attribute.updateRanges.length === 0) return;
  if (liveEnd <= 0) return; // an empty mesh cannot consume an upload
  if (first >= last) { first = liveEnd; last = 0; }
  for (const pending of attribute.updateRanges) {
    if (pending.start < liveEnd) {
      first = Math.min(first, pending.start);
      last = Math.max(last, Math.min(liveEnd, pending.start + pending.count));
    }
  }
  // A pending version may cover only a tail removed since the previous tick.
  // An empty range means a *full* upload in Three. Consume that version with
  // one live slot; later births always mark their overwritten slots dirty.
  if (first >= last) { first = 0; last = Math.min(liveEnd, attribute.itemSize); }
  const range = attribute._fxRange || (attribute._fxRange = { start: 0, count: 0 });
  range.start = first; range.count = last - first;
  attribute.updateRanges.length = 0;
  attribute.updateRanges.push(range);
  // Existing ranges already own an unconsumed dirty version. Coalescing them
  // after a skipped draw does not change source bytes or require a new signal.
  if (changed) attribute.needsUpdate = true;
}

export function adaptRenderTransfers(rel, code, once) {
  if (rel !== 'src/fx/fx.js') return code;
  const marker = '// INKWAVE persistent ring attribute transfers v1';
  if (code.includes(marker)) return code;
  const pairedOwnership = code.includes('    if (a === staticAttribute || a === staticAttribute2) continue;') ||
    code.includes('    if (a === staticAttribute || a === staticAttribute2 || a._fxStatic) continue;');
  const hasExtendedOwner = code.includes('    if (a === staticAttribute || a._fxStatic) continue;') ||
    code.includes('    if (a === staticAttribute || a === staticAttribute2 || a._fxStatic) continue;');
  if (!hasExtendedOwner && !code.includes('    if (a === staticAttribute) continue;') && !pairedOwnership)
    throw new Error('Ring transfers require static FX attribute ownership');
  const patch = (before, after, label) => { code = once(code, before, after, 'ring transfers: ' + label); };
  // 2026-10-28 main also manages two static ring attributes via staticDirty.
  // Preserve that ownership contract while restricting only the dirty slots.
  if (!hasExtendedOwner) {
    if (pairedOwnership) patch('    if (a === staticAttribute || a === staticAttribute2) continue;',
      '    if (a === staticAttribute || a === staticAttribute2 || a._fxStatic) continue;', 'honour paired FX attributes in markUpdated');
    else patch('    if (a === staticAttribute) continue;',
      '    if (a === staticAttribute || a._fxStatic) continue;', 'honour static FX attributes in markUpdated');
  }
  patch('export class FX {', marker + '\n' + clearFxUploadRanges.toString() + '\n' + markFxStaticRange.toString() + '\n\nexport class FX {', 'helper');
  patch('    this.rings = { cap, n: 0, geo, mesh, P:',
    '    geo.attributes.aColA._fxStatic = true; geo.attributes.aMisc._fxStatic = true;\n    geo.attributes.aColA.onUpload(clearFxUploadRanges); geo.attributes.aMisc.onUpload(clearFxUploadRanges);\n    this.rings = { cap, n: 0, dirtyStart: cap, dirtyEnd: 0, geo, mesh, P:', 'static ring attributes');
  patch('    R.X[x + 7] = style === R_DISC || style === R_BLOT ? 0.55 : style === R_DUST ? 0.35 : 0.22;\n    return i;',
    '    R.X[x + 7] = style === R_DISC || style === R_BLOT ? 0.55 : style === R_DUST ? 0.35 : 0.22;\n    R.dirtyStart = Math.min(R.dirtyStart, i); R.dirtyEnd = Math.max(R.dirtyEnd, i + 1);\n    return i;', 'birth and recycling');
  patch('if (i !== last) { R.P.copyWithin(i3, last * 3, last * 3 + 3); R.V.copyWithin(i3, last * 3, last * 3 + 3); R.N.copyWithin(i3, last * 3, last * 3 + 3); R.C.copyWithin(i3, last * 3, last * 3 + 3); X.copyWithin(x, last * 8, last * 8 + 8); }',
    'if (i !== last) { R.P.copyWithin(i3, last * 3, last * 3 + 3); R.V.copyWithin(i3, last * 3, last * 3 + 3); R.N.copyWithin(i3, last * 3, last * 3 + 3); R.C.copyWithin(i3, last * 3, last * 3 + 3); X.copyWithin(x, last * 8, last * 8 + 8); R.dirtyStart = Math.min(R.dirtyStart, i); R.dirtyEnd = Math.max(R.dirtyEnd, i + 1); }', 'compaction');
  const staticValues = '      aC[i4] = R.C[i3]; aC[i4 + 1] = R.C[i3 + 1]; aC[i4 + 2] = R.C[i3 + 2]; aC[i4 + 3] = X[x + 3];\n      aM[i4] = X[x + 6]; aM[i4 + 1] = X[x + 4]; aM[i4 + 2] = X[x + 5]; aM[i4 + 3] = 0;';
  const mainPairValues = '      if (R.staticDirty) {\n        aC[i4] = R.C[i3]; aC[i4 + 1] = R.C[i3 + 1]; aC[i4 + 2] = R.C[i3 + 2]; aC[i4 + 3] = X[x + 3];\n        aM[i4] = X[x + 6]; aM[i4 + 1] = X[x + 4]; aM[i4 + 2] = X[x + 5]; aM[i4 + 3] = 0;\n      }';
  patch(pairedOwnership ? mainPairValues : staticValues,
    '      if (i >= R.dirtyStart && i < R.dirtyEnd) {\n        aC[i4] = R.C[i3]; aC[i4 + 1] = R.C[i3 + 1]; aC[i4 + 2] = R.C[i3 + 2]; aC[i4 + 3] = X[x + 3];\n        aM[i4] = X[x + 6]; aM[i4 + 1] = X[x + 4]; aM[i4 + 2] = X[x + 5]; aM[i4 + 3] = 0;\n      }', 'persistent values');
  const updateCall = pairedOwnership
    ? '    markUpdated(R.geo, n, R.geo.attributes.aColA, R.geo.attributes.aMisc);\n    R.staticDirty = false;'
    : '    markUpdated(R.geo, n);';
  const mainPairEnd = '    M.n = 0;\n    R.geo.instanceCount = n;\n    markUpdated(R.geo, n, R.staticDirty ? null : R.geo.attributes.aColA, R.staticDirty ? null : R.geo.attributes.aMisc);\n    R.staticDirty = false;';
  const originalEnd = '    M.n = 0;\n    R.geo.instanceCount = n;\n    markUpdated(R.geo, n);';
  patch(pairedOwnership ? mainPairEnd : originalEnd,
    `    // A render can be skipped for several simulation updates. Coalesce with
    // all unconsumed ranges; WebGLAttributes clears them after actual upload.
    let first = R.dirtyStart, last = Math.min(R.dirtyEnd, R.n);
    if (M.n > 0) { first = Math.min(first, R.n); last = n; }
    markFxStaticRange(R.geo.attributes.aColA, first * 4, last * 4, n * 4);
    markFxStaticRange(R.geo.attributes.aMisc, first * 4, last * 4, n * 4);
    R.dirtyStart = R.cap; R.dirtyEnd = 0;
    M.n = 0;
    R.geo.instanceCount = n;
` + updateCall, 'dirty uploads and marks');
  patch('    this.marks.n = 0; this.pillars.n = 0; this._sqN = 0;',
    '    this.rings.dirtyStart = this.rings.cap; this.rings.dirtyEnd = 0;\n    this.marks.n = 0; this.pillars.n = 0; this._sqN = 0;', 'clear');
  return code;
}
