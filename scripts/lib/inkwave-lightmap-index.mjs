import fs from 'node:fs';
import path from 'node:path';

export function lightmapLayoutIds(sourceRoot) {
  const directory = path.join(sourceRoot, 'assets/lightmaps');
  if (!fs.existsSync(directory)) return [];
  const files = new Set(fs.readdirSync(directory));
  return [...files].filter(name => /^[a-z0-9_-]+\.json$/.test(name) && files.has(name.slice(0, -5) + '.png'))
    .map(name => name.slice(0, -5)).sort();
}

export function emitLightmapIndex(source, sourceRoot) {
  const anchor = 'export const LIGHTMAP_LAYOUTS = null;';
  if (source.split(anchor).length !== 2) throw Error('Lightmap asset-index source contract changed');
  return source.replace(anchor, `export const LIGHTMAP_LAYOUTS = Object.freeze(${JSON.stringify(lightmapLayoutIds(sourceRoot))});`);
}
