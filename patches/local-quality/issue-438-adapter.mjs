// INKWAVE issue #438: build-only Turf War result ranking adapter.
// New uniquely named file; does NOT edit shared dispatcher adapter.mjs or
// profile.json. The parent wires this in as:
//   import { adaptResultOrder } from '../local-quality/issue-438-adapter.mjs';
//   const adaptBuildSource = (rel, code) =>
//     adaptQualitySource(adaptResultOrder(rel, code), ...);
// or by calling adaptResultOrder inside adaptQualitySource for
// 'src/ui/menus.js'. Upstream inkwave-public/ stays byte-for-byte intact.
import { turfRankValue } from './result-order.mjs';

function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-438 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

// Sort the already-stable team slice by descending finite turf, preserving
// roster order for equal scores. Boss damage-ranked path is untouched.
const NATIVE_TURF_SORT =
  '      : all.slice().sort((x, y) => (x.team - y.team) || (y.turf - x.turf));';
const RANKED_TURF_SORT =
  '      : all.slice().sort((x, y) => (x.team - y.team) || (turfRankValue(y) - turfRankValue(x)));';

export function adaptResultOrder(rel, code) {
  if (rel !== 'src/ui/menus.js') return code;
  code = replaceOnce(code, NATIVE_TURF_SORT, RANKED_TURF_SORT, 'turf result ranking');
  return `import { turfRankValue } from '../../patches/local-quality/result-order.mjs';\n` + code;
}

export { turfRankValue };
