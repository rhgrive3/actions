import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fetchWorkflow = fs.readFileSync(new URL('../../.github/workflows/fetch-inkwave.yml', import.meta.url), 'utf8');
const navigation = fs.readFileSync(new URL('../../inkwave-public/src/game/nav.js', import.meta.url), 'utf8');
const composition = fs.readFileSync(new URL('../../patches/local-quality/adapter.mjs', import.meta.url), 'utf8');

test('public-source fetch is a read-only candidate workflow, never a direct-source overwrite', () => {
  assert.match(fetchWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(fetchWorkflow, /candidate="\$\{RUNNER_TEMP\}\/inkwave-upstream-candidate"/);
  assert.match(fetchWorkflow, /review-inkwave-upstream\.mjs/);
  assert.match(fetchWorkflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(fetchWorkflow, /rm -rf inkwave-public/);
  assert.doesNotMatch(fetchWorkflow, /git (?:push|commit|add inkwave-public)/);
});

test('migrated A-star heuristic owner is the readable game source', () => {
  assert.match(navigation, /this\._h = new Float64Array\(N\)/);
  assert.match(navigation, /heap\.push\(e\.to, ng \+ heuristic\[e\.to\]\)/);
  assert.doesNotMatch(composition, /adaptNavHeuristic/);
});
