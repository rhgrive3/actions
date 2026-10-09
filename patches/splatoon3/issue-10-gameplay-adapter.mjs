// Isolated fixes for verified residual INKWAVE issues. The source snapshot is
// upstream-locked; transform only disposable build artifacts.
export function adaptIssue10Gameplay(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'issue10 ' + label); };
  // Other residual fixes are added after exact current-composition checks.
  return code;
}
