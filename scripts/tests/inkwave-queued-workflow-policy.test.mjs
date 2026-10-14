import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Configuration contracts, not a simulation of GitHub's hosted scheduler.
// GitHub retains the running member when cancel-in-progress is false and
// replaces the older pending member of a group when a newer run arrives.
const workflows = [
  'validate-inkwave-native-stage5.yml',
  'validate-inkwave-ranked.yml',
  'inkwave-reopened-six.yml',
];
const expression = "${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || format('run-{0}', github.run_id) }}";
const read = name => fs.readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
function policy(source) {
  const blocks = [...source.matchAll(/^concurrency:\n((?:[ \t].*(?:\n|$))*)/gm)];
  assert.equal(blocks.length, 1, 'one workflow-level concurrency policy');
  const group = /^  group: (.+)$/m.exec(blocks[0][1])?.[1];
  const cancel = /^  cancel-in-progress: (true|false)$/m.exec(blocks[0][1])?.[1];
  assert.equal(group, expression, 'workflow + PR identity, unique non-PR fallback');
  assert.equal(cancel, 'false', 'running jobs and their evidence are retained');
  return { group, cancel };
}
// This resolver expresses the exact bounded expression checked above. It
// tests identity partitions; it does not claim a real hosted cancellation.
function groupFor(source, { workflow, event, pr, run }) {
  policy(source);
  return `${workflow}-${event === 'pull_request' ? `pr-${pr}` : `run-${run}`}`;
}
for (const name of workflows) {
  const source = read(name);
  test(`${name}: keeps only the latest pending slot of the same PR`, () => {
    const context = { workflow: name, event: 'pull_request', pr: 1324, run: 1 };
    assert.equal(groupFor(source, context), groupFor(source, { ...context, run: 2 }));
  });
  test(`${name}: distinct PRs and workflows cannot supersede each other`, () => {
    const context = { workflow: name, event: 'pull_request', pr: 1324, run: 1 };
    assert.notEqual(groupFor(source, context), groupFor(source, { ...context, pr: 1335 }));
    assert.notEqual(groupFor(source, context), groupFor(source, { ...context, workflow: 'another-workflow' }));
  });
  test(`${name}: main and manual diagnostics retain unique run groups`, () => {
    for (const event of ['push', 'workflow_dispatch']) {
      const context = { workflow: name, event, pr: null, run: 1 };
      assert.notEqual(groupFor(source, context), groupFor(source, { ...context, run: 2 }));
    }
  });
  test(`${name}: rejects missing, global, head-specific or running-cancel policies`, () => {
    for (const mutant of [
      source.replace(/^concurrency:\n(?:[ \t].*(?:\n|$))*/m, ''),
      source.replace(expression, 'all-inkwave'),
      source.replace(expression, '${{ github.sha }}'),
      source.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
    ]) assert.throws(() => policy(mutant));
  });
}
test('the policy contracts are wired into the existing General source gate', () => {
  const source = read('validate-inkwave-update.yml');
  assert.match(source, /run: node --test[^\n]*scripts\/tests\/inkwave-motion-gates\.test\.mjs[^\n]*scripts\/tests\/inkwave-integration-workflow\.test\.mjs[^\n]*scripts\/tests\/inkwave-runtime-evidence\.test\.mjs[^\n]*scripts\/tests\/inkwave-queued-workflow-policy\.test\.mjs/);
});
