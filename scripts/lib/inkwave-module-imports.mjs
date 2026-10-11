// Source-accurate static ESM imports for emitted bundles. Compact minifiers
// legally omit whitespace around import/export clauses, so token regexes cannot
// be used to decide which modules the offline Service Worker must install.
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';

export function staticEsModuleImports(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const out = [];
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration' &&
        node.type !== 'ExportNamedDeclaration' &&
        node.type !== 'ExportAllDeclaration') continue;
    if (typeof node.source?.value === 'string') out.push(node.source.value);
  }
  return out;
}
