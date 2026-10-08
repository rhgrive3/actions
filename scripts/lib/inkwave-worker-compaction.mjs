// Keep top-level worker bindings and the unstamped config marker readable.
// Only local executable identifiers/whitespace are compacted; JSON is stamped later.
export function compactLoadingWorkerTemplate(source, transformSync) {
  return transformSync(source, {
    loader: 'js', minifyWhitespace: true, minifyIdentifiers: true,
    minifySyntax: false, legalComments: 'inline',
  }).code;
}
