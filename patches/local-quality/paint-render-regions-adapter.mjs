// Terminal source composition only. The protected source snapshot stays intact.
export function adaptPaintRenderRegions(rel, code, once) {
  if (rel !== 'src/world/paint.js') return code;
  const marker = '// INKWAVE exact regional paint rendering v2';
  if (code.includes('// INKWAVE exact regional paint rendering')) throw new Error('Regional paint rendering already composed');
  for (const anchor of ['export class PaintSystem', '_drawQuads()', '_regenerateMipmaps()', 'THREE.ReverseSubtractEquation']) {
    if (!code.includes(anchor)) throw new Error('Regional paint source contract missing: ' + anchor);
  }
  const before = 'const range=at._paintRange||(at._paintRange={start:0,count:0});\n        range.count=n*at.itemSize;\n        at.clearUpdateRanges(); at.updateRanges.push(range); at.needsUpdate = true;';
  const after = 'markPaintAttributeRange(at, n, THREE.BufferAttribute);';
  if (code.split(before).length !== 2) throw new Error('Paint attribute upload source contract missing or duplicated');
  code = code.replace(before, after);
  // Order matters: sparse drying selects its exact geometry before the inner
  // mip owner records which base-level pixels can have changed.
  return "import { markPaintAttributeRange } from '../../patches/local-quality/paint-attribute-upload-cache.mjs';\n" +
    "import { installPaintRegionalMips } from '../../patches/local-quality/paint-regional-mips.mjs';\n" +
    "import { installPaintDryRegions } from '../../patches/local-quality/paint-dry-regions.mjs';\n" +
    "import { installPaintProfileBatch } from '../../patches/local-quality/paint-profile-batch.mjs';\n" + code + '\n' + marker +
    '\ninstallPaintRegionalMips(PaintSystem);\ninstallPaintDryRegions(PaintSystem);\ninstallPaintProfileBatch(PaintSystem);\n';
}
