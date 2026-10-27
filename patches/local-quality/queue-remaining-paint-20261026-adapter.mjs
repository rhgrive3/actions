// Local Library queue work: preserve the painter's ordering and numeric results.
// Run after the canonical paint ownership/pool adapters. Source drift fails closed.
function once(code, before, after) {
  if (code.split(before).length !== 2) throw new Error('Remaining paint source anchor: ' + before.slice(0, 100));
  return code.replace(before, after);
}

export function adaptRemainingPaint20261026(rel, code) {
  if (rel !== 'src/world/paint.js') return code;
  const patch = (before, after) => { code = once(code, before, after); };

  // Both rectangle distances are nonpositive: hypot(max(qa,0),max(qb,0))
  // is exactly +0. Retain the original arithmetic outside this interior.
  patch('const sd = Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;',
    'const sd = (qa <= 0 && qb <= 0 ? 0 : Math.hypot(Math.max(qa, 0), Math.max(qb, 0))) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;');

  // The eighth slot is the UNCLAMPED projection used by repeated growth draws.
  // Admission retains its clamped radius, including NaN and signed-zero rules.
  // Explicit stride preserves legacy/external seven-slot growth records.
  patch('const rr = Math.sqrt(Math.max(0, radius * radius - dn * dn));',
    'const projectionSq = radius * radius - dn * dn;\n          const rrGrowth = Math.sqrt(projectionSq);\n          const rr = projectionSq < 0 ? 0 : Math.max(0, rrGrowth);');
  patch('entries.push(f, lu, lv, dn, sdu, sdv, sa);',
    'entries.push(f, lu, lv, dn, sdu, sdv, sa, rrGrowth);');
  patch('g.entries = entries; entries = null; growth = g;',
    'g.entries = entries; g.entryStride = 8; g.entryRadius = radius; entries = null; growth = g;');
  patch('const E = g.entries, R = g.R, kind = g.kind;',
    'const E = g.entries, R = g.R, kind = g.kind;\n    const entryStride = g.entryStride === 8 ? 8 : 7;\n    const cachedProjection = entryStride === 8 && Object.is(g.entryRadius, R);');
  patch('for (let i = 0; i < E.length; i += 7) {',
    'for (let i = 0; i < E.length; i += entryStride) {');
  patch('const rr = Math.sqrt(R * R - dn * dn);',
    'const rr = cachedProjection ? E[i + 7] : Math.sqrt(R * R - dn * dn);');
  patch('_releaseSplatEntries(entries) {', '_releaseSplatEntries(entries, entryStride = 7) {');
  patch('const faceCount = entries.length / 7;', 'const faceCount = entries.length / entryStride;');
  patch('this._releaseSplatEntries(g.entries);', 'this._releaseSplatEntries(g.entries, g.entryStride === 8 ? 8 : 7);');
  patch('    g.entries = null;', '    g.entries = null; g.entryStride = 7; g.entryRadius = 0;');
  patch('if (entries) this._releaseSplatEntries(entries);', 'if (entries) this._releaseSplatEntries(entries, 8);');

  // Staging is owned only by this synchronous layout call. Restore original
  // face order before every stable sort: previous retry order is not a tiebreak.
  patch('    let ppm = maxDensity;\n    for (let attempt = 0; attempt < 30; attempt++) {\n      if (this._tryPack(faces, ppm, S)) break;',
    '    let ppm = maxDensity;\n    const staging = { records: faces.map(f => ({ f, w: 0, h: 0, x: 0, y: 0 })), rects: [] };\n    for (let attempt = 0; attempt < 30; attempt++) {\n      if (this._tryPack(faces, ppm, S, staging)) break;');
  patch('  _tryPack(faces, ppm, S) {\n    const pad = this.pad;\n    const rects = faces.map((f) => ({ f, w: Math.ceil(f.su * ppm) + pad * 2, h: Math.ceil(f.sv * ppm) + pad * 2 }));',
    '  _tryPack(faces, ppm, S, staging = null) {\n    const pad = this.pad;\n    const rects = staging ? staging.rects : faces.map((f) => ({ f, w: Math.ceil(f.su * ppm) + pad * 2, h: Math.ceil(f.sv * ppm) + pad * 2 }));\n    if (staging) {\n      rects.length = faces.length;\n      for (let i = 0; i < faces.length; i++) {\n        const r = staging.records[i], f = faces[i];\n        r.f = f; r.w = Math.ceil(f.su * ppm) + pad * 2; r.h = Math.ceil(f.sv * ppm) + pad * 2; r.x = r.y = 0;\n        rects[i] = r;\n      }\n    }');
  return code;
}
