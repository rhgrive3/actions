import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/pages-inkwave.yml', import.meta.url), 'utf8');

test('Pages publishes the exact workflow revision, never a moving main branch', () => {
  assert.ok(workflow.includes('          ref: ${{ github.sha }}'), 'checkout must use the triggering SHA');
  assert.ok(!workflow.includes('          ref: main'), 'moving main is not an immutable build input');
  assert.ok(workflow.includes('Deploy to GitHub Pages'));
  assert.ok(workflow.includes('            tools/squid-heading-qa'), 'published local-quality tests import the heading QA helper');
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

test('Pages stays deployable while mandatory Validate still owns the full regression matrix', () => {
  const gate = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
  const deploymentBuild = workflow.slice(workflow.indexOf('      - name: Build optimized site'), workflow.indexOf('      - name: Upload INKWAVE site'));
  assert.match(deploymentBuild, /node --test scripts\/tests\/inkwave-pages-source-identity\.test\.mjs scripts\/tests\/inkwave-ranked-pages-sequencing\.test\.mjs/);
  assert.match(deploymentBuild, /node scripts\/check-inkwave-patches\.mjs --quick/);
  assert.match(deploymentBuild, /node scripts\/build-inkwave\.mjs inkwave-public _site/);
  assert.match(deploymentBuild, /node scripts\/check-inkwave-startup-budget\.mjs _site/);
  assert.doesNotMatch(deploymentBuild, /--test patches\/local-quality\/tests\/\*\.test\.mjs/);
  const full = gate.slice(gate.indexOf('  patch_tests:'),gate.indexOf('  circleci_offload_gate:'));
  assert.match(full, /INKWAVE_TEST_SHARD_COUNT: '8'/);
  assert.match(full, /run: node --experimental-vm-modules scripts\/check-inkwave-patches\.mjs/);
  const final = gate.slice(gate.indexOf('  validate:'),gate.indexOf('  browser:'));
  assert.match(final, /test "\$PATCH_RESULT" = success/);
});
