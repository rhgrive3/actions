import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { nonWailVfxTicks, consumeVfxPeriod } from '../runtime/nonwail-vfx-clock.mjs';
import { areaSpecialVfxTicks } from '../runtime/area-special-vfx-clock.mjs';
import { inkjetVfxTicks } from '../runtime/inkjet-vfx-clock.mjs';

const sourceURL = new URL('../runtime/special-vfx.mjs', import.meta.url);
const rel = 'patches/splatoon3/runtime/special-vfx.mjs';
const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/special-director-before-6dacd47.json', import.meta.url)));
const kitSource = fs.readFileSync(new URL('../runtime/special-vfx-kit.mjs', import.meta.url), 'utf8');
const current = fs.readFileSync(sourceURL, 'utf8');
function baseline(source) {
  for (const [name, [container, next]] of Object.entries({
    killerWail: ['const DIRECTORS =', '  // ---------------------------------------------------------------- Tenta Missiles'],
    strike: ['const OBJECT_FX =', '  decoy: {'],
  })) {
    const start = source.indexOf('  ' + name + ': {', source.indexOf(container)), end = source.indexOf(next, start);
    if (start < 0 || end < start) throw Error('Missing actual recipe ' + name);
    source = source.slice(0, start) + frozen.blocks[name] + source.slice(end);
  }
  return source;
}
const strip = source => source.replace(/^import .*;\n/gm, '').replace(/^export default .*;$/gm, '').replace(/^export /gm, '');
const kitNames = ['SpecialVfxKit', 'SPARK', 'PUFF', 'RIBBON', 'BEAM', 'SHELL', 'BAND', 'DISC', 'vfxRandom', 'excludeFromOverridePasses', 'inkLightUniforms'];

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ast = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const key = node => node?.name ?? node?.value;
const one = (values, why) => { assert.equal(values.length, 1, why); return values[0]; };
function nodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  for (const [name, value] of Object.entries(node)) if (name !== 'start' && name !== 'end') {
    if (Array.isArray(value)) for (const child of value) nodes(child, predicate, out);
    else nodes(value, predicate, out);
  }
  return out;
}
function exported(tree, name) {
  return one(nodes(tree, n => n.type === 'ExportSpecifier' && key(n.exported) === name), 'emitted export ' + name).local.name;
}
function objectBinding(tree, names) {
  return one(nodes(tree, n => n.type === 'VariableDeclarator' && n.init?.type === 'ObjectExpression'
    && names.every(name => n.init.properties.some(p => key(p.key) === name))), 'emitted recipe table').id.name;
}
function moduleBody(source, tree, instrumentRng = false) {
  const edits = [];
  for (const node of tree.body) {
    if (node.type === 'ImportDeclaration' || node.type === 'ExportDefaultDeclaration') edits.push([node.start, node.end, '']);
    else if (node.type === 'ExportNamedDeclaration') edits.push([node.start, node.declaration?.start ?? node.end, '']);
  }
  if (instrumentRng) {
    const name = exported(tree, 'vfxRandom');
    const fn = one(nodes(tree, n => n.type === 'FunctionDeclaration' && n.id?.name === name), 'emitted RNG function');
    edits.push([fn.body.start + 1, fn.body.start + 1, '__work.rng++;']);
  }
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + replacement + source.slice(end);
  return source;
}

// Selecting a site is strict: missing/stale/tampered output fails at import.
// Candidate module bodies below come only from the selected emitted artifact.
const emitted = (() => {
  if (!Object.hasOwn(process.env, 'INKWAVE_BUILT_SITE')) return null;
  assert.ok(process.env.INKWAVE_BUILT_SITE, 'nonempty INKWAVE_BUILT_SITE required');
  const root = fs.realpathSync(path.resolve(process.env.INKWAVE_BUILT_SITE));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'inkwave-build.json')));
  assert.equal(manifest.build.optimization, 'esbuild-minify', 'full production build required');
  assert.match(manifest.build.revision, /^[a-f0-9]{64}$/, 'immutable emitted revision');
  assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash, 'emitted input manifest seal');
  assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash, 'emitted artifact manifest seal');
  const modules = {}, hashes = {};
  for (const file of ['special-vfx.mjs', 'special-vfx-kit.mjs', 'nonwail-vfx-clock.mjs', 'area-special-vfx-clock.mjs', 'inkjet-vfx-clock.mjs']) {
    const rel = 'patches/splatoon3/runtime/' + file, filename = fs.realpathSync(path.join(root, rel));
    assert.ok(filename.startsWith(root + path.sep), 'artifact within selected site');
    const bytes = fs.readFileSync(filename);
    assert.equal(hash(bytes), manifest.artifacts[rel], 'emitted artifact identity ' + file);
    assert.deepEqual(bytes, fs.readFileSync(path.join(root, '_versions', manifest.build.revision, rel)), 'immutable revision copy ' + file);
    assert.equal(hash(fs.readFileSync(new URL('../runtime/' + file, import.meta.url))), manifest.files['patch/runtime/' + file], 'build matches current tested source ' + file);
    modules[file] = { code: bytes.toString(), tree: ast(bytes.toString()) }; hashes[file] = hash(bytes);
  }
  return { modules, receipt: { inputHash: manifest.inputHash, contentHash: manifest.contentHash, revision: manifest.build.revision, hashes } };
})();
export const directorEmittedIdentity = emitted?.receipt || null;

function evaluateEmitted(module, context, dependencies, expose, instrumentRng = false) {
  const bindings = [];
  for (const node of module.tree.body.filter(n => n.type === 'ImportDeclaration')) {
    const dependency = dependencies[node.source.value];
    assert.ok(dependency, 'explicit emitted dependency ' + node.source.value);
    for (const spec of node.specifiers) {
      assert.equal(spec.type, 'ImportSpecifier', 'known named emitted import');
      assert.ok(Object.hasOwn(dependency, key(spec.imported)), 'explicit emitted import ' + key(spec.imported));
      bindings.push(`const ${spec.local.name}=__dependencies[${JSON.stringify(node.source.value)}][${JSON.stringify(key(spec.imported))}];`);
    }
  }
  context.__dependencies = dependencies;
  return vm.runInContext(`((__dependencies)=>{${bindings.join('\n')}\n${moduleBody(module.code, module.tree, instrumentRng)}\nreturn {${expose}};})(__dependencies)`, context);
}
function emittedRecipes(context, sinks, old, instrument) {
  const m = emitted.modules;
  const kit = evaluateEmitted(m['special-vfx-kit.mjs'], context, {}, kitNames.map(name => `${name}:${exported(m['special-vfx-kit.mjs'].tree, name)}`).join(','), instrument);
  const dependencies = { './special-vfx-kit.mjs': kit };
  for (const [file, names] of Object.entries({
    'nonwail-vfx-clock.mjs': ['nonWailVfxTicks', 'consumeVfxPeriod'],
    'area-special-vfx-clock.mjs': ['areaSpecialVfxTicks'], 'inkjet-vfx-clock.mjs': ['inkjetVfxTicks'],
  })) dependencies['./' + file] = evaluateEmitted(m[file], context, {}, names.map(name => `${name}:${exported(m[file].tree, name)}`).join(','));
  for (const [file, names] of Object.entries({
    '../../local-quality/layout-sample.mjs': ['LayoutSample'], './inkjet-vfx-budget.mjs': ['inkjetVfxAdmission', 'inkjetVfxRoom'],
    './kit-ink-vac.mjs': ['inkVacState'], './kit-big-bubbler.mjs': ['bigBubblerDomes', 'bigBubblerRemoteDomes'],
    './special-motion.mjs': ['createInkFist', 'disposeSpecialModel', 'trizookaPresentationMuzzle', 'inkVacPresentationMuzzle'],
    './all-specials.mjs': ['superChumpLandingPreview', 'tentaMissilesLockPreview'], './special-presentation.mjs': ['remoteKrakenPhase'],
    './wail-speakers.mjs': ['WAIL_SPEAKER_POSITIONS'],
  })) dependencies[file] = Object.fromEntries(names.map(name => [name, sinks[name]]));
  const tree = m['special-vfx.mjs'].tree;
  const director = one(nodes(tree, n => n.type === 'ClassDeclaration' && n.body.body.some(p => key(p.key) === 'endTrack')), 'actual emitted director');
  const recipes = evaluateEmitted(m['special-vfx.mjs'], context, dependencies,
    `Director:${director.id.name},DIRECTORS:${objectBinding(tree, ['krakenRoyale', 'killerWail', 'crabTank'])},OBJECT_FX:${objectBinding(tree, ['marker', 'strike', 'decoy'])},SPECIAL_VFX_CALIBRATION:${exported(tree, 'SPECIAL_VFX_CALIBRATION')}`);
  if (old) {
    // Only the two frozen 6dac methods are the oracle. The Director, helpers,
    // clock modules, geometry and complete pool implementation stay emitted.
    const method = (name, member) => {
      const code = `({${frozen.blocks[name]}})`, object = ast(code).body[0].expression.properties[0].value;
      const node = one(object.properties.filter(p => key(p.key) === member), 'frozen oracle method');
      return code.slice(node.start, node.end);
    };
    context.__oracleKit = kit; context.__oracleCalibration = recipes.SPECIAL_VFX_CALIBRATION;
    const oracle = vm.runInContext(`(()=>{const {BEAM,DISC,PUFF,vfxRandom}=__oracleKit;const SPECIAL_VFX_CALIBRATION=__oracleCalibration;${frozen.helpers.TAU}\n${frozen.helpers.rnd}\nreturn {wail:({${method('killerWail', 'event')}}).event,strike:({${method('strike', 'frame')}}).frame};})()`, context);
    recipes.DIRECTORS.killerWail.event = oracle.wail; recipes.OBJECT_FX.strike.frame = oracle.strike;
  }
  return recipes;
}

// Full production module and pool implementation, with external gameplay and
// DOM dependencies as sinks. With INKWAVE_BUILT_SITE this executes only actual
// emitted candidate bodies; otherwise it covers source/production transforms.
// Neither mode establishes WebGL, network acceptance or retail footage.
export function directorFixture({ old = false, minified = false, instrument = true } = {}) {
  const work = { clones: 0, sin: 0, cos: 0, rng: 0 };
  const math = instrument ? Object.create(Math) : Math;
  if (instrument) for (const name of ['sin', 'cos']) math[name] = x => { work[name]++; return Math[name](x); };
  const Vector3 = instrument ? class Vector3 extends THREE.Vector3 {
    clone() { work.clones++; return new Vector3(this.x, this.y, this.z); }
  } : THREE.Vector3;
  const three = { ...THREE, Vector3 };
  const sinks = {
    nonWailVfxTicks, consumeVfxPeriod, areaSpecialVfxTicks, inkjetVfxTicks,
    LayoutSample: class {}, inkjetVfxAdmission: () => ({}), inkjetVfxRoom: () => true,
    inkVacState: () => null, bigBubblerDomes: () => [], bigBubblerRemoteDomes: () => [],
    createInkFist: () => null, disposeSpecialModel() {}, trizookaPresentationMuzzle: () => false,
    inkVacPresentationMuzzle: () => false, superChumpLandingPreview: () => null,
    tentaMissilesLockPreview: () => null, remoteKrakenPhase: () => null,
    WAIL_SPEAKER_POSITIONS: [],
  };
  const context = vm.createContext({ console, Math: math, __work: work, Float32Array, ...sinks });
  let recipes;
  if (emitted) {
    assert.equal(minified, false, 'emitted mode never substitutes a local minification');
    recipes = emittedRecipes(context, sinks, old, instrument);
  } else {
    const instrumentedKit = instrument ? kitSource.replace('export function vfxRandom() {', 'export function vfxRandom() { __work.rng++;') : kitSource;
    let program = `const {${kitNames.join(',')}} = (() => {${strip(instrumentedKit)}\nreturn {${kitNames.join(',')}};})();\n`
      + strip(adaptBuildSource(rel, old ? baseline(current) : current))
      + '\nglobalThis.__directorLane = {Director, DIRECTORS, OBJECT_FX};';
    if (minified) program = transformSync(program, { loader: 'js', minify: true, charset: 'utf8' }).code;
    vm.runInContext(program, context); recipes = context.__directorLane;
  }
  const { Director, DIRECTORS, OBJECT_FX } = recipes;
  const scene = new THREE.Scene(), fx = { root: new THREE.Group(), q: 1 };
  scene.add(fx.root);
  const actor = { alive: false, team: 0, color: new THREE.Color(.7, .2, .1), pos: new Vector3() };
  const G = { scene, time: 0, actors: [actor], teamColors: [actor.color], fx,
    projectiles: { list: [], _s3AllSpecialObjects: [], _s3SupportCoolers: [], _catalogueFists: [], clouds: [] } };
  const director = new Director({ THREE: three, G }, fx);
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, .1, 500); camera.position.set(0, 5, 12); camera.updateMatrixWorld();
  for (const key of Object.keys(work)) work[key] = 0;
  return { director, actor, G, work, THREE: three, DIRECTORS, OBJECT_FX,
    laser(index, frame, activation = 1) {
      const pos = [frame * .013 + index, 2 + index * .1, -1 + index * .2];
      const target = [frame % 3 ? 30 + index : 220 + index, 4 + frame * .003, 15 - index];
      director.event({ actor, id: 'killerWail', action: 'laser', activation, index, pos, target });
    },
    step(dt) { G.time += dt; director.update(dt, camera); },
    close() { director.clear(); director.kit.dispose(); },
  };
}

export function directorState(f) {
  const d = f.director, kit = d.kit;
  const shapes = Array.from(kit.pools.slice(2), p => ({
    records: Array.from(p.recs, r => ({ t: r.t, life: r.life, dead: r.dead, v: Array.from(r.v) })),
    attributes: Array.from(p.buf, b => Array.from(b.array)), instanceCount: p.mesh.geometry.instanceCount,
  }));
  return {
    time: d.time, errors: d.errors, marks: { ...f.actor._s3SpecialMarks },
    beams: [...d.lasers].map(([key, r]) => [key, r.from.toArray(), r.to.toArray(), r.drawTo.toArray(), r.seen]),
    sprites: [kit.sparks, kit.puffs].map(p => ({ n: p.n, state: Array.from(p.p),
      attributes: [p.aPos, p.aDir, p.aCol, p.aPar].map(a => Array.from(a.array)), instanceCount: p.mesh.geometry.instanceCount })),
    shapes, stats: { ...kit.stats() }, rng: f.work.rng,
  };
}

export function addStrikes(f, count = 3) {
  for (let i = 0; i < count; i++) f.G.projectiles._s3AllSpecialObjects.push({
    kind: 'strike', owner: f.actor, team: 0, age: 0, pos: new f.THREE.Vector3(i * 4 - 4, 0, i * 2), currentRadius: 4.5, dur: 51 / 60,
  });
}
