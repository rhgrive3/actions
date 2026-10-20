import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, existsSync, mkdirSync, writeFileSync, cpSync, renameSync } from 'node:fs';
import path from 'node:path';
export const BASE = 'ada098a8fe5f2b9f2990f10812c01acb70bde190';
// da285 changes nine QA/report files only; both pinned audio originals and the
// exact pristine production build identity are unchanged. Unknown bases fail closed.
export const QA_MAIN = 'da285129eb919d094d29e6a9b388f5eeb11059e9';
export const FIX = '90c73134af22ce96bb662d753354502155df12f8';
const sha = data => createHash('sha256').update(data).digest('hex');
export const blob = data => createHash('sha1').update(`blob ${Buffer.byteLength(data)}\0`).update(data).digest('hex');
const pins = [ ['patches/local-quality/platform-audio.mjs', '1eb470941974aff851510dcd688071d9a8075661', '4cd8a3b8be7d41d171a63b8f35c404e105c3fad4'], ['inkwave-public/src/audio/music.js', 'eca13851e6c3be9003bb36526972e47c28d4a7a5', 'e7ae70b8c3b080460fa4e33f15ab6a7734fc0e64'] ];
function need(ok, text) { if (!ok) throw Error(`reference audio: ${text}`); }
const raw = readFileSync(new URL('../fixtures/inkwave-reference-audio.json', import.meta.url));
need(sha(raw) === 'c84ab5810f92c1c611e4cc7ba9b3ab00ea44d8f5ca50067dc8c6b84efb4eb4ce', 'fixture pin mismatch');
export const files = JSON.parse(raw).files;
need(files.length === pins.length && files.every((f,i) => f.path === pins[i][0] && blob(f.before) === pins[i][1] && blob(f.after) === pins[i][2]), 'fixture blob/path mismatch');
export function eligible({ side, pr, baseRef, baseSha }) { return side === 'before' && String(pr) === '1695' && baseRef === 'main' && (baseSha === BASE || baseSha === QA_MAIN); }
export function snapshot(root) {
  const out = {};
  function visit(dir, rel = '') {
    for (const name of readdirSync(dir).sort()) {
      if (!rel && name === '.git') continue;
      const p = path.join(dir,name), key = rel ? `${rel}/${name}` : name, stat = lstatSync(p);
      need(!stat.isSymbolicLink(), `symlink forbidden: ${key}`);
      if (stat.isDirectory()) visit(p,key);
      else { need(stat.isFile(), `non-file: ${key}`); out[key] = sha(readFileSync(p)); }
    }
  }
  visit(root); return out;
}
function same(a,b,label) { need(JSON.stringify(a) === JSON.stringify(b), label); }
export function verifyTrees(original, derived) {
  const before = snapshot(original), after = snapshot(derived), expected = {...before};
  for (const f of files) {
    need(blob(readFileSync(path.join(original,f.path))) === blob(f.before), `original stale: ${f.path}`);
    need(blob(readFileSync(path.join(derived,f.path))) === blob(f.after), `derived stale: ${f.path}`);
    expected[f.path] = sha(f.after);
  }
  same(expected,after,'unexpected source change');
  return { sourceFiles: Object.keys(before).length, unchangedSourceFiles: Object.keys(before).length-files.length, originalSourceDigest: sha(JSON.stringify(before)), derivedSourceDigest: sha(JSON.stringify(after)) };
}
export function prepare({ original, derived, candidate, identity, actualBase }) {
  need(eligible(identity) && actualBase === identity.baseSha, 'ineligible source/PR/side');
  original=path.resolve(original); derived=path.resolve(derived); candidate=path.resolve(candidate);
  need(!existsSync(derived), 'destination exists');
  need(!derived.startsWith(original+path.sep) && !original.startsWith(derived+path.sep), 'overlapping trees');
  const pristine = snapshot(original);
  for (const f of files) {
    need(blob(readFileSync(path.join(original,f.path))) === blob(f.before), `original pin mismatch: ${f.path}`);
    need(blob(readFileSync(path.join(candidate,f.path))) === blob(f.after), `candidate pin mismatch: ${f.path}`);
  }
  // All validation above is read-only. Publish the derived tree only after full verification.
  const stage=derived+'.staging'; need(!existsSync(stage),'staging exists');
  cpSync(original,stage,{recursive:true,filter:p=>path.relative(original,p)!=='.git'});
  for (const f of files) writeFileSync(path.join(stage,f.path),f.after);
  const checked=verifyTrees(original,stage); same(pristine,snapshot(original),'pristine changed during preparation');
  renameSync(stage,derived);
  return { schema:1, referenceKind:actualBase===BASE?'audio-stabilized-ada':'audio-stabilized-da285', publicMainEquivalent:false, performanceScope:'stabilized reference versus candidate, not untouched public main', originalCommit:actualBase, correctionCommit:FIX, original,derived, writtenPaths:files.map(f=>({path:f.path,beforeBlob:blob(f.before),afterBlob:blob(f.after)})), ...checked };
}
export function verifyBuilds(pristine,derived) {
  need(pristine.build?.revision === '1b30d25ee3ca97c63c89a9d38cea21826b522d06f76924184630d1552a4ed3bb' && pristine.inputHash === 'c8545591049cb13eecc91fa819cd9d98be6b53141f32bd847d2b3eb19af52695' && pristine.contentHash === 'a946c46a2a0521cff8c76fcdc2a0581da25dbe29281166c683e81fbe87bdb878','pristine build identity mismatch');
  const expected={...pristine.files};
  for (const f of files) { need(expected[f.inputKey]===sha(f.before),'pristine input pin mismatch'); expected[f.inputKey]=sha(f.after); }
  same(expected,derived.files,'unexpected production input change');
  need(derived.build?.revision && derived.build.revision!==pristine.build.revision && derived.inputHash!==pristine.inputHash && derived.contentHash!==pristine.contentHash,'derived build identity not distinct');
  return { productionInputCount:Object.keys(pristine.files).length, unchangedProductionInputs:Object.keys(pristine.files).length-files.length, pristine:{revision:pristine.build.revision,inputHash:pristine.inputHash,contentHash:pristine.contentHash},derived:{revision:derived.build.revision,inputHash:derived.inputHash,contentHash:derived.contentHash},publicMainEquivalent:false };
}
