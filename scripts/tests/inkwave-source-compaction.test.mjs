import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
import { compactModuleStrings } from '../lib/inkwave-source-compaction.mjs';

const PHRASE = 'A verbose catalog phrase retained byte for byte across repeated runtime values.';

function exportedNames(code) {
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = [];
  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') names.push('default');
    if (node.type !== 'ExportNamedDeclaration') continue;
    for (const specifier of node.specifiers) names.push(specifier.exported.name ?? specifier.exported.value);
    const declaration = node.declaration;
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) if (item.id.type === 'Identifier') names.push(item.id.name);
    } else if (declaration?.id?.name) names.push(declaration.id.name);
  }
  return names.sort();
}

function findNodes(root, type, result = []) {
  if (!root || typeof root !== 'object') return result;
  if (root.type === type) result.push(root);
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) value.forEach(item => findNodes(item, type, result));
    else if (value && typeof value === 'object') findNodes(value, type, result);
  }
  return result;
}

test('compiled ESM string compaction preserves exports, imports, values, comments and syntax roles', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-source-compaction-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'dependency.mjs'), 'export const dependencyValue="dependency stays imported";\n');

  const source = `/*! source-compaction fixture license */
"use strict";
import { dependencyValue } from "./dependency.mjs";
export const exportedPhrase = "${PHRASE}";
export function inspect(input) {
  "use strict";
  const values = ["${PHRASE}", "${PHRASE}", "${PHRASE}"];
  const record = {
    "${PHRASE}": "${PHRASE}",
    ["${PHRASE}"]: values[0],
    template: \`template keeps raw text: ${PHRASE} / \${input}\`,
    imported: dependencyValue
  };
  let category;
  switch (input) { case "${PHRASE}": category = "matched"; break; default: category = "other"; }
  return { values, record, input, category };
}
export const loadDependency = () => import("./dependency.mjs");
`;
  const compiled = transformSync(source, {
    loader: 'js', format: 'esm', minify: true, charset: 'utf8', legalComments: 'inline',
  }).code;
  const compacted = compactModuleStrings(compiled);
  assert(compacted.bytesSaved > 0, 'the repeated runtime value should produce a byte saving');
  assert(compacted.functions > 0);
  assert(compacted.code.length < compiled.length);
  assert.match(compacted.code, /\/\*! source-compaction fixture license \*\//, 'inline legal comment stays intact');

  const afterAst = parse(compacted.code, { ecmaVersion: 'latest', sourceType: 'module' });
  assert.deepEqual(exportedNames(compacted.code), exportedNames(compiled), 'public module exports stay exact');
  assert(findNodes(afterAst, 'FunctionDeclaration').some(node => node.body.body.some(statement => statement.directive === 'use strict')),
    'function directive remains a directive');
  assert(findNodes(afterAst, 'Property').some(node => !node.computed && node.key.type === 'Literal' && node.key.value === PHRASE),
    'a non-computed property key remains a literal key');
  assert(findNodes(afterAst, 'ImportExpression').some(node => node.source.type === 'Literal' && node.source.value === './dependency.mjs'),
    'dynamic import specifiers remain literal');
  assert(findNodes(afterAst, 'ImportDeclaration').some(node => node.source.value === './dependency.mjs'),
    'static import specifiers remain literal');
  assert(findNodes(afterAst, 'TemplateLiteral').some(node => node.quasis.some(part => part.value.raw.includes(`template keeps raw text: ${PHRASE}`))),
    'template text stays inline and byte stable');

  const sourceFile = path.join(directory, 'source.mjs');
  const compiledFile = path.join(directory, 'compiled.mjs');
  const compactedFile = path.join(directory, 'compacted.mjs');
  fs.writeFileSync(sourceFile, source);
  fs.writeFileSync(compiledFile, compiled);
  fs.writeFileSync(compactedFile, compacted.code);
  const [sourceModule, compiledModule, compactedModule] = await Promise.all([
    import(`${pathToFileURL(sourceFile).href}?source`),
    import(`${pathToFileURL(compiledFile).href}?compiled`),
    import(`${pathToFileURL(compactedFile).href}?compacted`),
  ]);
  assert.deepEqual(Object.keys(compactedModule).sort(), Object.keys(compiledModule).sort());
  assert.deepEqual(Object.keys(compiledModule).sort(), Object.keys(sourceModule).sort());
  assert.deepEqual(compiledModule.inspect('same input'), sourceModule.inspect('same input'));
  assert.deepEqual(compactedModule.inspect('same input'), compiledModule.inspect('same input'));
  assert.equal(compactedModule.inspect(PHRASE).category, 'matched', 'case labels remain separated from the keyword');
  assert.equal(compactedModule.exportedPhrase, compiledModule.exportedPhrase);
  assert.deepEqual(await compactedModule.loadDependency(), await compiledModule.loadDependency(),
    'static and dynamic module resolution stays unchanged');
  assert.deepEqual(await compiledModule.loadDependency(), await sourceModule.loadDependency());
});

test('non-module syntax is rejected before its scope can be changed', () => {
  assert.throws(() => compactModuleStrings('with (scope) { run("repeat"); run("repeat"); }'), /sourceType|module|strict/i);
});

test('a top-level directive remains ahead of injected declarations', () => {
  const source = `"use strict";import "./dependency.mjs";export const first="${PHRASE}";export const second="${PHRASE}";`;
  const compacted = compactModuleStrings(source);
  const ast = parse(compacted.code, { ecmaVersion: 'latest', sourceType: 'module' });
  assert.equal(ast.body[0].directive, 'use strict');
  assert.equal(ast.body[1].type, 'ImportDeclaration');
  assert(compacted.code.indexOf('"use strict"') < compacted.code.indexOf('function '));
});

test('shared literals stay available during cyclic dependency evaluation', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-source-compaction-cycle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const aSource = `import "./cycle.mjs";
export function early() { return "${PHRASE}"; }
export function later() { return "${PHRASE}"; }
`;
  const cycleSource = 'import { early } from "./a.mjs"; export const seen = early();\n';
  const variants = [
    ['source', aSource],
    ['compiled', transformSync(aSource, { loader: 'js', format: 'esm', minify: true, charset: 'utf8' }).code],
  ];
  for (const [name, code] of variants) {
    const subdir = path.join(directory, name);
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(subdir, 'a.mjs'), code);
    fs.writeFileSync(path.join(subdir, 'cycle.mjs'), cycleSource);
  }
  const compacted = compactModuleStrings(variants[1][1]);
  assert(compacted.bytesSaved > 0);
  const compactDir = path.join(directory, 'compacted');
  fs.mkdirSync(compactDir);
  fs.writeFileSync(path.join(compactDir, 'a.mjs'), compacted.code);
  fs.writeFileSync(path.join(compactDir, 'cycle.mjs'), cycleSource);

  for (const name of ['source', 'compiled', 'compacted']) {
    const moduleUrl = pathToFileURL(path.join(directory, name, 'a.mjs')).href;
    const entry = await import(moduleUrl);
    const cycle = await import(moduleUrl.replace('/a.mjs', '/cycle.mjs'));
    assert.equal(entry.early(), PHRASE);
    assert.equal(entry.later(), PHRASE);
    assert.equal(cycle.seen, PHRASE, `${name} dependency called an export before module body evaluation`);
  }
});
