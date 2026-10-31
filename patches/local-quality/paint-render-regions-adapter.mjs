// Terminal source composition only. The protected source snapshot stays intact.
export function adaptPaintRenderRegions(rel, code, once) {
  if (rel !== 'src/world/paint.js') return code;
  const marker = '// INKWAVE exact regional paint rendering v2';
  if (code.includes('// INKWAVE exact regional paint rendering')) throw new Error('Regional paint rendering already composed');
  for (const anchor of ['export class PaintSystem', '_drawQuads()', '_regenerateMipmaps()', 'THREE.ReverseSubtractEquation']) {
    if (!code.includes(anchor)) throw new Error('Regional paint source contract missing: ' + anchor);
  }
  // Order matters: sparse drying selects its exact geometry before the inner
  // mip owner records which base-level pixels can have changed.
  return "import { installPaintRegionalMips } from '../../patches/local-quality/paint-regional-mips.mjs';\n" +
    "import { installPaintDryRegions } from '../../patches/local-quality/paint-dry-regions.mjs';\n" +
    "import { installPaintProfileBatch } from '../../patches/local-quality/paint-profile-batch.mjs';\n" +
    "import { installNativePaintTransfer } from '../../patches/local-quality/native-paint-transfer.mjs';\n" +
    "import { installNativePaintTickBatch } from '../../patches/local-quality/native-paint-tick-batch.mjs';\n" + code + '\n' + marker +
    '\ninstallPaintRegionalMips(PaintSystem);\ninstallPaintDryRegions(PaintSystem);\ninstallPaintProfileBatch(PaintSystem);\ninstallNativePaintTransfer(PaintSystem);\ninstallNativePaintTickBatch(PaintSystem, G);\n';
}
