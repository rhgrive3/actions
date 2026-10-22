import path from 'node:path';import assert from 'node:assert/strict';
assert.ok(process.env.INKWAVE_MATERIAL_COMMON_SOURCE,'Set INKWAVE_MATERIAL_COMMON_SOURCE to the separate immutable cc0 source tree');
export const commonRoot=path.resolve(process.env.INKWAVE_MATERIAL_COMMON_SOURCE);
export const commonFile=name=>path.join(commonRoot,name);
