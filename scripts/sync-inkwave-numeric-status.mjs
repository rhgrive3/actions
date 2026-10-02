#!/usr/bin/env node
// Record every tuning number, including calibration. No missing default is inferred.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export function numericStatus(profile) {
  const result = {};
  function visit(value, key) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Non-finite tuning value: ${key}`);
      const binding = profile.bindings?.[key] || null;
      result[key] = { value, status: binding ? 'derived from pinned extracted data; physical scale unverified' : 'calibration or derived value; see reference raw table and unverified list', binding };
    } else if (value && typeof value === 'object') {
      for (const [name, next] of Object.entries(value)) if (name !== 'bindings' && name !== 'calibration') visit(next, key ? `${key}.${name}` : name);
    }
  }
  visit(profile, ''); return result;
}
if (process.argv.includes('--write')) {
  const root = new URL('../patches/splatoon3/', import.meta.url);
  const profile = JSON.parse(fs.readFileSync(new URL('profile.json', root), 'utf8'));
  const target = fileURLToPath(new URL('reference/numeric-status.json', root));
  fs.writeFileSync(target + '.writing', JSON.stringify(numericStatus(profile), null, 2) + '\n');
  fs.renameSync(target + '.writing', target);
  console.log(`Recorded ${Object.keys(numericStatus(profile)).length} numeric fields`);
}
