import { adaptSource } from '../patches/splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../patches/touch-layout/adapter.mjs';
import { adaptReliability } from '../patches/reliability/adapter.mjs';
import { adaptQualitySource } from '../patches/local-quality/adapter.mjs';
import { adaptNetworkSource } from '../patches/network-replication/adapter.mjs';
import { adaptRange } from '../patches/practice-range/adapter.mjs';
import { adaptProjectileVisuals } from '../patches/splatoon3/projectile-visual-adapter.mjs';

// Keep the tested source path identical to the production build's adapters.
export function adaptBuildSource(rel, code) {
  code = adaptSource(rel, code);
  code = adaptTouchLayout(rel, code);
  code = adaptReliability(rel, code);
  code = adaptQualitySource(rel, code);
  code = adaptNetworkSource(rel, code);
  code = adaptRange(rel, code);
  return adaptProjectileVisuals(rel, code);
}
