import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformLifecycle } from '../platform-lifecycle.mjs';

// #843: an initially-unfocused visible page must not inherit pad authority
// before its first focus. The lifecycle samples document.hasFocus() once at
// construction; the #780 pollPad gate then suppresses gamepad input.
function lifecycleEnv({ hidden = false, hasFocus } = {}) {
  const listeners = new Map();
  const doc = { hidden, addEventListener: (n, f) => listeners.set('doc:' + n, f), removeEventListener: n => listeners.delete('doc:' + n) };
  if (hasFocus !== undefined) doc.hasFocus = () => hasFocus;
  const env = { document: doc,
    addEventListener: (n, f) => listeners.set('win:' + n, f), removeEventListener: n => listeners.delete('win:' + n) };
  return { env, listeners };
}

test('visible initially-unfocused construction starts unfocused without a blur', () => {
  const { env, listeners } = lifecycleEnv({ hidden: false, hasFocus: false });
  const owner = new PlatformLifecycle(env);
  try {
    assert.equal(owner.state, 'ACTIVE');
    assert.equal(owner.focused, false);
    assert.equal(owner.metrics.blurs, 0);
    assert.equal(owner.snapshot().focused, false);
    listeners.get('win:focus')();
    assert.equal(owner.focused, true);
    assert.equal(owner.metrics.blurs, 0);
  } finally { owner.dispose(); }
});

test('visible initially-focused construction stays focused; unknown focus keeps history', () => {
  for (const hasFocus of [true, undefined]) {
    const { env } = lifecycleEnv({ hidden: false, hasFocus });
    const owner = new PlatformLifecycle(env);
    try { assert.equal(owner.focused, true); } finally { owner.dispose(); }
  }
});

test('hidden startup still suspends regardless of the focus sample', () => {
  const { env } = lifecycleEnv({ hidden: true, hasFocus: true });
  const owner = new PlatformLifecycle(env);
  try {
    assert.equal(owner.state, 'SUSPENDED');
    assert.equal(owner.focused, true);
  } finally { owner.dispose(); }
});
