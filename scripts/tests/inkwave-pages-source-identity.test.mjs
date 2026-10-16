import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/pages-inkwave.yml', import.meta.url), 'utf8');

test('Pages publishes the exact workflow revision, never a moving main branch', () => {
  assert.ok(workflow.includes('          ref: ${{ github.sha }}'), 'checkout must use the triggering SHA');
  assert.ok(!workflow.includes('          ref: main'), 'moving main is not an immutable build input');
  assert.ok(workflow.includes('Deploy to GitHub Pages'));
});

test('every published gameplay patch group can trigger Pages', () => {
  for (const glob of [
    'inkwave-public/**',
    'patches/splatoon3/**',
    'patches/network-replication/**',
    'patches/movement-physics/**',
    'patches/native-stages/**',
    'patches/local-quality/**',
    'patches/loading-cache/**',
    'patches/reliability/**',
    'patches/touch-layout/**',
    'patches/practice-range/**',
    'scripts/lib/**',
    'server/src/**',
  ]) {
    assert.ok(workflow.includes('      - "' + glob + '"'), 'missing Pages push trigger ' + glob);
  }
});
