import { createHash } from 'node:crypto';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';

export const REVIEWED_AUDIO_ORPHAN = 'patches/splatoon3/runtime/audio/charge-hit-cue.mjs';
const authoredHash = '119a9fa2c5910cb9378111116fa28de945eaeed988e832065fc3ff9e9ba322cf';
// Explicit reviewed owners only, not a general dynamic-import resolver. Hash
// only the argument binding and all local loader call sites, not entire files.
const closureHashes = new Map([
  [
    "src/main.js",
    "6bc5b639ed5f74241acbc29e332565d22717cd5df9491ed7d01b56f04bcbc331"
  ],
  [
    "src/game/character.js",
    "82ab55e730eea25837ed5fd2f87514280c3fcc8c5d76cfe259fd076c3080c158"
  ],
  [
    "src/audio/music.js",
    "095dd539c7a7d95cfc90067086e23f32dfe4d26dd2af4d7db5173a64a8fee631"
  ]
]);
const clean = value => JSON.parse(JSON.stringify(value, (key, item) => ['start', 'end', 'loc', 'raw'].includes(key) ? undefined : item));
// These complete QA URL expressions were included in the current graph review.
const reviewedURLs = new Map([
  ['patches/local-quality/paint-mipmap-probe.mjs', ['src/world/paint.js', 'patches/local-quality/world-quality.mjs']],
  ['patches/local-quality/quality-probe.mjs', ['src/config.js']],
].map(([file, paths]) => [file, paths.map(target => JSON.stringify(clean(parse(
  `new URL(${JSON.stringify(target)}, document.baseURI).href`, { ecmaVersion: 'latest', sourceType: 'module' }).body[0].expression)))]));
export function reviewedLoaderClosure(file, source) {
  const nodes = [], parents = new WeakMap();
  const visit = (node, parent) => { if (!node?.type) return; nodes.push(node); parents.set(node, parent);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(n => visit(n, node)); else if (value?.type) visit(value, node); };
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), null);
  const one = list => { if (list.length !== 1) throw Error('ambiguous reviewed binding'); return list[0]; };
  const refs = (list, name) => list.filter(n => n.type === 'Identifier' && n.name === name).length;
  let proof;
  if (file === 'src/main.js') proof = ['loadModule', 'loadLazyModule'].map(name => {
    const declaration = one(nodes.filter(n => (n.type === 'FunctionDeclaration' || n.type === 'VariableDeclarator') && n.id?.name === name));
    const calls = nodes.filter(n => n.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === name);
    if (refs(nodes, name) !== calls.length + 1 || !calls.length || calls.some(n => n.arguments[0]?.type !== 'Literal' || typeof n.arguments[0].value !== 'string')) throw Error('loader escapes or nonliteral caller');
    if (parents.get(declaration)?.type === 'ExportNamedDeclaration' || parents.get(parents.get(declaration))?.type === 'ExportNamedDeclaration') throw Error('exported loader');
    return [clean(declaration), calls.map(n => n.arguments.map(clean))];
  });
  else if (file === 'src/game/character.js') {
    const declaration = one(nodes.filter(n => n.type === 'VariableDeclarator' && n.id?.name === 'SOURCE_MOTION_MODULE'));
    const use = one(nodes.filter(n => n.type === 'ImportExpression' && n.source?.name === 'SOURCE_MOTION_MODULE'));
    if (refs(nodes, 'SOURCE_MOTION_MODULE') !== 2) throw Error('motion binding escaped'); proof = [clean(declaration), clean(use)];
  } else if (file === 'src/audio/music.js') {
    const method = one(nodes.filter(n => n.type === 'MethodDefinition' && n.key?.name === '_startTimer'));
    const local = nodes.filter(n => n.start >= method.start && n.end <= method.end);
    const bindings = ['src', 'url'].map(name => { if (refs(local, name) !== (name === 'url' ? 3 : 2)) throw Error('worker binding escaped'); return one(local.filter(n => n.type === 'VariableDeclarator' && n.id?.name === name)); });
    const worker = one(local.filter(n => n.type === 'NewExpression' && n.callee?.name === 'Worker'));
    if (worker.arguments[0]?.name !== 'url') throw Error('worker argument changed'); proof = [...bindings.map(clean), clean(worker)];
  } else throw Error('unreviewed opaque owner');
  return createHash('sha256').update(JSON.stringify(proof)).digest('hex');
}
const reviewedOpaqueSites = new Map([
  ['src/main.js:import:Identifier', 2], ['src/game/character.js:import:Identifier', 1], ['src/audio/music.js:worker:Identifier', 1],
]);

export function reviewedAudioOrphanDecision(authoredSource, modules, composedOwners) {
  const keep = reason => ({ omit: false, reason });
  if (createHash('sha256').update(authoredSource).digest('hex') !== authoredHash) return keep('authored helper changed');
  for (const [file, hash] of closureHashes) {
    if (!modules.has(file) || !composedOwners?.has(file)) return keep('missing reviewed owner: ' + file);
    try { if (reviewedLoaderClosure(file, composedOwners.get(file)) !== hash) return keep('loader closure changed: ' + file); }
    catch { return keep('unproven loader closure: ' + file); }
  }
  for (const required of [REVIEWED_AUDIO_ORPHAN, 'patches/splatoon3/bootstrap.mjs', 'patches/loading-cache/runtime/startup.mjs', 'patches/loading-cache/sw.js', 'entry-script-1.mjs'])
    if (!modules.has(required)) return keep('missing graph root: ' + required);
  const sites = new Map(); let reference = null, parseFailure = null;
  for (const [file, source] of modules) {
    if (file === REVIEWED_AUDIO_ORPHAN) continue;
    let ast; try { ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
    catch { parseFailure = file; break; }
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      // Also inspect loader arguments and URL constructors, not only ESM import
      // declarations. Any literal naming this module retains it, conservatively.
      if (node.type === 'Literal' && typeof node.value === 'string') {
        let value = node.value; try { value = decodeURIComponent(value); } catch { /* retain original */ }
        if (value.includes('charge-hit-cue')) reference = file;
      }
      if ((node.type === 'Identifier' && ['eval', 'Function'].includes(node.name)) || (node.type === 'Literal' && ['eval', 'Function'].includes(node.value))) reference = file + ' (unreviewed code generation)';
      const kind = node.type === 'ImportExpression' ? 'import'
        : node.type === 'NewExpression' && ['Worker', 'SharedWorker'].includes(node.callee?.name) ? 'worker' : null;
      if (kind) {
        const target = kind === 'import' ? node.source : node.arguments[0];
        const expression = target?.type === 'MemberExpression' && !target.computed && target.property?.name === 'href' ? target.object : target;
        const base = expression?.arguments?.[1];
        const literalURL = expression?.type === 'NewExpression' && expression.callee?.name === 'URL' && expression.arguments.length === 2
          && expression.arguments[0]?.type === 'Literal' && typeof expression.arguments[0].value === 'string'
          && base?.type === 'MemberExpression' && !base.computed && base.property?.name === 'url'
          && base.object?.type === 'MetaProperty' && base.object.meta?.name === 'import' && base.object.property?.name === 'meta';
        if (target?.type !== 'Literal' && !literalURL && !reviewedURLs.get(file)?.includes(JSON.stringify(clean(target)))) {
          const key = `${file}:${kind}:${target?.type}`; sites.set(key, (sites.get(key) || 0) + 1);
        }
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }; walk(ast);
  }
  if (parseFailure) return keep('unparsed module: ' + parseFailure);
  if (reference) return keep('module reference: ' + reference);
  for (const [site, count] of sites) if (reviewedOpaqueSites.get(site) !== count) return keep('unreviewed dynamic site: ' + site);
  for (const [site, count] of reviewedOpaqueSites) if (sites.get(site) !== count) return keep('missing reviewed dynamic site: ' + site);
  return { omit: true, reason: 'reviewed current orphan; no literal reference', opaqueSites: [...sites] };
}
