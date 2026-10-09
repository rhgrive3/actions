// BUILD stays a top-level JSON literal. All other worker bindings are private.
// Compact their names before inserting configuration, retaining a classic script.
export function compactLoadingWorkerTemplate(source, transformSync) {
  const binding = /const BUILD\s*=\s*__INKWAVE_CACHE_CONFIG_VALUE__\s*;/g;
  if ([...source.matchAll(binding)].length !== 1) throw Error('Worker compaction requires one unstamped BUILD binding');
  const executable = source.replace(binding, '');
  const code = transformSync(executable, {
    loader: 'js', format: 'esm', minifyWhitespace: true, minifyIdentifiers: true,
    minifySyntax: true, legalComments: 'inline',
  }).code;
  // Input has no imports/exports. ESM mode only enables private top-level name
  // compaction; the emitted worker is still installed as a classic script.
  return 'const BUILD=__INKWAVE_CACHE_CONFIG_VALUE__;\n' + code;
}
