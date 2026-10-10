// Build-only source transform. Runtime recovery helper retains its existing URL.
const ISSUE_415_REL = 'patches/splatoon3/runtime/resources.mjs';
const ISSUE_415_ANCHOR = '    a.lastDamage = Math.min(a.lastDamage, r.enemyInkRegenSuppression);';
const ISSUE_415_IMPORT = `import { resetEnemyInkRecovery } from './issue-415-adapter.mjs';`;

export function adaptIssue415(rel, code) {
  if (rel !== ISSUE_415_REL) return code;
  const first = code.indexOf(ISSUE_415_ANCHOR);
  if (first < 0 || code.indexOf(ISSUE_415_ANCHOR, first + ISSUE_415_ANCHOR.length) >= 0) {
    throw new Error('INKWAVE issue-415 anchor mismatch: expected exactly one enemy-ink recovery clamp.');
  }
  let patched = code.slice(0, first) + '    resetEnemyInkRecovery(a);' + code.slice(first + ISSUE_415_ANCHOR.length);
  if (!patched.includes('./issue-415-adapter.mjs')) patched = `${ISSUE_415_IMPORT}\n${patched}`;
  return patched;
}
