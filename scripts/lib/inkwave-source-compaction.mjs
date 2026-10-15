import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';

const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_';
const RESERVED_WORDS = new Set('arguments await break case catch class const continue debugger default delete do else enum eval export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let implements interface package private protected public static'.split(' '));
const utf8Length = value => Buffer.byteLength(value, 'utf8');
const identifierPart = char => !!char && /[A-Za-z0-9_$\u0080-\uFFFF]/.test(char);

function nextIdentifier(index) {
  let name = '';
  let value = index;
  do {
    name = NAME_ALPHABET[value % NAME_ALPHABET.length] + name;
    value = Math.floor(value / NAME_ALPHABET.length) - 1;
  } while (value >= 0);
  return name;
}

function literalIsRuntimeValue(node, parent, key) {
  if (parent?.type === 'ExpressionStatement' && parent.directive) return false;
  if (parent?.type === 'Property' && key === 'key' && !parent.computed) return false;
  if (parent?.type === 'MethodDefinition' && key === 'key' && !parent.computed) return false;
  if (parent?.type === 'PropertyDefinition' && key === 'key' && !parent.computed) return false;
  if (['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].includes(parent?.type) && key === 'source') return false;
  if (parent?.type === 'ImportExpression' && key === 'source') return false;
  if (['ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier', 'ExportSpecifier', 'ExportNamespaceSpecifier', 'ImportAttribute'].includes(parent?.type)) return false;
  return node.type === 'Literal' && typeof node.value === 'string';
}

function analyze(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const identifiers = new Set();
  const literals = new Map();

  function visit(node, parent = null, key = null) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier') identifiers.add(node.name);
    if (node.type === 'Literal' && literalIsRuntimeValue(node, parent, key)) {
      let entries = literals.get(node.value);
      if (!entries) literals.set(node.value, entries = []);
      entries.push(node);
    }
    for (const childKey of Object.keys(node)) {
      if (['start', 'end', 'loc', 'range'].includes(childKey)) continue;
      const child = node[childKey];
      if (Array.isArray(child)) child.forEach(value => visit(value, node, childKey));
      else if (child && typeof child === 'object') visit(child, node, childKey);
    }
  }
  visit(ast);

  let insertion = 0;
  if (source.startsWith('#!')) {
    const newline = source.indexOf('\n');
    insertion = newline < 0 ? source.length : newline + 1;
  }
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration' || (node.type === 'ExpressionStatement' && node.directive)) insertion = Math.max(insertion, node.end);
    else break;
  }
  return { ast, identifiers, literals, insertion };
}

/**
 * Share repeated runtime string values in an already-compiled ES module.
 * Static module specifiers, property names, directives and template text are
 * left intact. The returned byte count measures the exact UTF-8 reduction.
 */
export function compactModuleStrings(source) {
  const { identifiers, literals, insertion } = analyze(source);
  const groups = [...literals].filter(([, nodes]) => nodes.length > 1).map(([value, nodes]) => {
    const raw = source.slice(nodes[0].start, nodes[0].end);
    const originalBytes = nodes.reduce((sum, node) => sum + utf8Length(source.slice(node.start, node.end)), 0);
    return { nodes, raw, originalBytes, value };
  }).sort((a, b) => b.originalBytes - a.originalBytes || a.value.localeCompare(b.value));

  const makeReferences = (nodes, reference) => nodes.map(node => {
    let text = reference;
    if (identifierPart(source[node.start - 1])) text = ' ' + text;
    if (identifierPart(source[node.end])) text += ' ';
    return { node, text };
  });
  const emit = (declarations, edits) => {
    if (!declarations.length) return null;
    let code = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
    code = code.slice(0, insertion) + '\n' + declarations.join('') + code.slice(insertion);
    // Parse the complete result so malformed edits fail the build before it
    // can be published or enter the offline cache manifest.
    parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    const bytesSaved = utf8Length(source) - utf8Length(code);
    return bytesSaved > 0 ? { code, bytesSaved, functions: declarations.length } : null;
  };

  // Direct accessors have the shortest call sites when the input already has
  // many distinct short identifiers. Keep only groups that repay their own
  // declaration and call overhead.
  const directDeclarations = [];
  const directEdits = [];
  const directIdentifiers = new Set(identifiers);
  let directIndex = 0;
  for (const group of groups) {
    let name;
    let nextIndex = directIndex;
    do name = nextIdentifier(nextIndex++); while (directIdentifiers.has(name) || RESERVED_WORDS.has(name));
    // A function declaration is initialized during module instantiation, before
    // cyclic imports evaluate. A const would remain in its TDZ while deps run.
    const declaration = `function ${name}(){return ${group.raw}}`;
    const references = makeReferences(group.nodes, `${name}()`);
    const originalBytes = group.nodes.reduce((sum, node) => sum + utf8Length(source.slice(node.start, node.end)), 0);
    const addedBytes = references.reduce((sum, item) => sum + utf8Length(item.text), utf8Length(declaration));
    if (originalBytes <= addedBytes) continue;
    directIndex = nextIndex;
    directIdentifiers.add(name);
    directDeclarations.push(declaration);
    directEdits.push(...references.map(({ node, text }) => ({ start: node.start, end: node.end, text })));
  }
  const direct = emit(directDeclarations, directEdits);

  // A shared switch dispatcher reduces per-string declaration overhead in
  // metadata-heavy modules, while its function declaration keeps cyclic-call
  // behavior safe. Compare emitted bytes and select the smaller valid module.
  const dispatchIdentifiers = new Set(identifiers);
  let dispatcherIndex = 0;
  let dispatcherName;
  do dispatcherName = nextIdentifier(dispatcherIndex++);
  while (dispatchIdentifiers.has(dispatcherName) || RESERVED_WORDS.has(dispatcherName));
  const cases = [];
  const dispatchEdits = [];
  for (const group of groups) {
    const index = cases.length;
    const reference = makeReferences(group.nodes, `${dispatcherName}(${index})`);
    const caseCode = `case ${index}:return ${group.raw};`;
    const originalBytes = group.nodes.reduce((sum, node) => sum + utf8Length(source.slice(node.start, node.end)), 0);
    const addedBytes = reference.reduce((sum, item) => sum + utf8Length(item.text), utf8Length(caseCode));
    if (originalBytes <= addedBytes) continue;
    cases.push(caseCode);
    dispatchEdits.push(...reference.map(({ node, text }) => ({ start: node.start, end: node.end, text })));
  }
  const dispatch = cases.length
    ? emit([`function ${dispatcherName}(i){switch(i){${cases.join('')}}}`], dispatchEdits)
    : null;
  if (!direct && !dispatch) return { code: source, bytesSaved: 0, functions: 0 };
  return dispatch && (!direct || dispatch.bytesSaved > direct.bytesSaved) ? dispatch : direct;
}
