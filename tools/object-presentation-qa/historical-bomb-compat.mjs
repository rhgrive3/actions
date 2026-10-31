import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// QA only. The immutable Clam comparison predates the two forecast exports
// imported by the current production graph. Keep every historical byte and
// append the genuine current definitions, binding to the historical sampler.
// Neither helper participates in a Clam comparison; count every invocation so
// both the source fixture and the native runner enforce that boundary.
export const HISTORICAL_BOMB_BASE = '3839b61a6c6c4d5ac998b82168f37b802bc55099';
export const HISTORICAL_BOMB_FILE = 'patches/splatoon3/runtime/bomb-motion.mjs';
export const HISTORICAL_BOMB_SHA256 = 'ae3fb4d73f970e335a622ad76f17ac0b5b860924d39eb76a485958333861374c';
export const HISTORICAL_BOMB_CALLS = '__INKWAVE_QA_HISTORICAL_BOMB_COMPAT_CALLS__';
const hash = source => createHash('sha256').update(source).digest('hex');
const exports = Object.freeze({
  stormThrowPosition: Object.freeze({ sha256: '80b76e9bf23280c1b7924b5c11ff8521e542c2a288ae4662d89e42c659acf094', dependencies: [] }),
  bombPredictionPosition: Object.freeze({ sha256: 'c5b1eef5a8ff1f0fb5ab0a582ace1c35c6728d06f8d5a0d89088592552086ea6', dependencies: ['stateMap', 'sampleRelease'] }),
});

export function historicalBombCompatibility({ suite, file, base, historicalSource, candidateSource }) {
  if (suite !== 'clam' || file !== HISTORICAL_BOMB_FILE) return { source: historicalSource, receipt: null };
  assert.equal(base, HISTORICAL_BOMB_BASE, 'Clam historical base must remain immutable');
  assert.equal(hash(historicalSource), HISTORICAL_BOMB_SHA256, 'Historical bomb body and dependency closure must remain byte-exact');
  const definitions = [], copiedExports = {};
  for (const [name, reviewed] of Object.entries(exports)) {
    const pattern = new RegExp('^export function ' + name + '\\(a, out\\) \\{\\n[\\s\\S]*?^\\}', 'gm');
    const matches = [...candidateSource.matchAll(pattern)];
    assert.equal(matches.length, 1, 'Exactly one genuine candidate definition: ' + name);
    assert.equal(hash(matches[0][0]), reviewed.sha256, 'Reviewed prediction definition changed: ' + name);
    assert(!new RegExp('\\b' + name + '\\b').test(historicalSource), 'Compatibility must not replace a historical binding');
    for (const dependency of reviewed.dependencies) assert(new RegExp('(?:const|function) ' + dependency + '\\b').test(historicalSource), 'Genuine historical dependency is present: ' + dependency);
    definitions.push(matches[0][0]);
    copiedExports[name] = { sha256: reviewed.sha256, dependencies: [...reviewed.dependencies] };
  }
  const tracking = `
if (Object.hasOwn(globalThis, '${HISTORICAL_BOMB_CALLS}')) throw Error('Duplicate historical bomb compatibility namespace');
const __iwQaBombCalls = Object.seal({ stormThrowPosition: 0, bombPredictionPosition: 0 });
Object.defineProperty(globalThis, '${HISTORICAL_BOMB_CALLS}', { value: __iwQaBombCalls });
const __iwQaStormThrowPosition = stormThrowPosition;
stormThrowPosition = function (...args) { __iwQaBombCalls.stormThrowPosition++; return __iwQaStormThrowPosition(...args); };
const __iwQaBombPredictionPosition = bombPredictionPosition;
bombPredictionPosition = function (...args) { __iwQaBombCalls.bombPredictionPosition++; return __iwQaBombPredictionPosition(...args); };
`;
  const source = historicalSource + '\n// QA-only, unused forecast API compatibility. Original body above is byte-exact.\n' + definitions.join('\n') + tracking;
  assert.equal(source.slice(0, historicalSource.length), historicalSource, 'Historical prefix is unchanged');
  return { source, receipt: {
    kind: 'qa-only-unused-prediction-exports', historicalBase: base,
    historicalSha256: HISTORICAL_BOMB_SHA256, historicalBytes: Buffer.byteLength(historicalSource),
    historicalBodyPreserved: true, candidateSourceSha256: hash(candidateSource),
    copiedExports, dependencyClosure: 'Existing immutable historical stateMap/sampleRelease and their original dependencies; no replacement or stub',
    callCounterGlobal: HISTORICAL_BOMB_CALLS, requiredCalls: { stormThrowPosition: 0, bombPredictionPosition: 0 },
  } };
}

export function assertHistoricalBombCompatibilityUnused(calls) {
  assert.deepEqual(calls && { ...calls }, { stormThrowPosition: 0, bombPredictionPosition: 0 }, 'Historical forecast compatibility exports must never run during a Clam comparison');
  return { ...calls };
}
