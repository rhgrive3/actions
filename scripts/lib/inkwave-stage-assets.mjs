import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAGE_ASSET_SOURCE = path.resolve(fileURLToPath(new URL('../../patches/splatoon3/assets/stages/', import.meta.url)));
const ASSET_PREFIX = 'assets/stages/';

function entriesFrom(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || Object.keys(manifest).join(',') !== 'scorch') {
    throw new Error('Scorch stage assets: overlay manifest must contain only scorch');
  }
  const stage = manifest.scorch;
  const expectedTimes = ['day', 'dusk'];
  if (!stage || Object.keys(stage).sort().join(',') !== expectedTimes.join(',')) {
    throw new Error('Scorch stage assets: day and dusk entries are required');
  }
  const files = [];
  for (const time of expectedTimes) {
    const images = stage[time];
    if (!images || Object.keys(images).sort().join(',') !== 'sm,src') {
      throw new Error(`Scorch stage assets: ${time} needs src and sm images`);
    }
    for (const [size, relative] of Object.entries(images)) {
      const expected = `${ASSET_PREFIX}scorch-${time}${size === 'sm' ? '-sm' : ''}.webp`;
      if (relative !== expected) throw new Error(`Scorch stage assets: unexpected ${time}/${size} path ${relative}`);
      files.push(relative);
    }
  }
  return files;
}

export function overlayScorchStageAssets(buildDir, sourceDir = STAGE_ASSET_SOURCE) {
  const source = path.resolve(sourceDir);
  const overlayPath = path.join(source, 'manifest.json');
  const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
  const files = entriesFrom(overlay);
  const build = path.resolve(buildDir);
  const destination = path.join(build, 'assets', 'stages');
  const manifestPath = path.join(destination, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Scorch stage assets: upstream stage manifest is missing');

  const base = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (Object.hasOwn(base, 'scorch')) throw new Error('Scorch stage assets: refusing to replace an existing stage entry');
  for (const relative of files) {
    const name = relative.slice(ASSET_PREFIX.length);
    const from = path.resolve(source, name);
    const to = path.resolve(build, relative);
    if (!from.startsWith(source + path.sep) || !to.startsWith(build + path.sep)) {
      throw new Error(`Scorch stage assets: unsafe path ${relative}`);
    }
    if (!fs.statSync(from).isFile()) throw new Error(`Scorch stage assets: not a file ${from}`);
    if (fs.existsSync(to)) throw new Error(`Scorch stage assets: refusing to replace ${relative}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ ...base, scorch: overlay.scorch }, null, 2) + '\n');
  return { files, manifest: manifestPath };
}
