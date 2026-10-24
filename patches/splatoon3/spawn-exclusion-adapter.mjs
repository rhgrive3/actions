import { replaceOnce } from '../local-quality/adapter.mjs';

export function adaptSpawnExclusion(rel, code) {
  if (rel === 'src/game/actor.js') return "import { installSpawnExclusion } from '../../patches/splatoon3/runtime/spawn-exclusion.mjs';\n" + code + '\ninstallSpawnExclusion(Actor, G, PLAYER);\n';
  if (rel === 'src/net/netmatch.js') {
    code = replaceOnce(code, '    a.vel.set(S.vx, S.vy, S.vz);',
      '    a.vel.set(S.vx, S.vy, S.vz);\n    constrainSpawnPosition(a, G.level, PLAYER);',
      'remote interpolation respects the authoritative spawn volume');
    return "import { constrainSpawnPosition } from '../../patches/splatoon3/runtime/spawn-exclusion.mjs';\n" + code;
  }
  return code;
}
