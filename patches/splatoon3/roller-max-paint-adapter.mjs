// The existing wire format already transports the kind string unchanged.
// rollFloor is a surface-filtered alias of the SAME CPU/GPU roll morphology.
export function adaptRollerMaxPaint(rel,code,replaceOnce) {
  if(rel!=='src/world/paint.js')return code;
  code=replaceOnce(code,'roll: 6, speck: 7','roll: 6, rollFloor: 6, speck: 7','roller #189 floor band kind');
  code=replaceOnce(code,'        if (!f.atlas) continue;',
    "        if (!f.atlas) continue;\n        if (opts.kind === 'rollFloor' && f.n.y < .45) continue; // lateral Roller splash cannot paint adjacent walls",
    'roller #189 lateral floor-only projection');
  return code;
}
