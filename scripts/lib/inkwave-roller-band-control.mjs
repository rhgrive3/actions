// Explicit QA counterfactuals for the two historical #1165 CPU-only defects.
// Operate on the declared compiled PaintSystem module, never its shader or
// runtime fixture results. Unknown source shapes fail closed.
export function rollerBandCounterfactual(source, control) {
  if (control !== 'original-core' && control !== 'old-scan') throw new Error('unknown Roller counterfactual');
  const method = /_cpuSplat\([^)]*\)\s*\{/.exec(source);
  const end = method ? source.indexOf('_pushQuad(', method.index + method[0].length) : -1;
  if (!method || end < 0) throw new Error('missing compiled PaintSystem CPU method');
  const before = source.slice(method.index, end);
  const bound = /Math\.hypot\(([A-Za-z_$][\w$]*)\+([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\+\2\+\.12\)/;
  const axes = before.match(bound);
  if (!axes || before.match(new RegExp(bound.source, 'g'))?.length !== 1) throw new Error('ambiguous compiled Roller bounds');
  let after;
  if (control === 'old-scan') {
    after = before.replace(bound, '(Math.hypot(' + axes[1] + ',' + axes[3] + ')+' + axes[2] + '+.05)');
  } else {
    const width = /(\b[A-Za-z_$][\w$]*=Math\.abs\([A-Za-z_$][\w$]*\)-([A-Za-z_$][\w$]*)\*[A-Za-z_$][\w$]*)-[A-Za-z_$][\w$]*;if\(Math\.hypot\(/;
    const match = before.match(width);
    if (!match || before.match(new RegExp(width.source, 'g'))?.length !== 1) throw new Error('ambiguous compiled Roller width');
    // Remove only the seeded width term; keep the normal full-body CPU scan.
    after = before.replace(width, '$1;if(Math.hypot(');
    const threshold = '-' + match[2] + '*' + axes[2] + '>0)continue';
    if (after.split(threshold).length !== 2) throw new Error('ambiguous compiled Roller inset');
    after = after.replace(threshold, '-' + match[2] + '*' + axes[2] + '>-.03*' + match[2] + ')continue');
  }
  if (after === before) throw new Error('counterfactual did not change CPU code');
  return source.slice(0, method.index) + after + source.slice(end);
}
