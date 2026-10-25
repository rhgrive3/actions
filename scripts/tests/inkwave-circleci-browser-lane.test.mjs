import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBrowserLane, SUITES } from '../ci/run-circleci-browser-lane.mjs';

const workflow = fs.readFileSync('.github/workflows/validate-inkwave-update.yml', 'utf8');

test('CircleCI consumes all seven native browser suites without omitting native acceptance steps', () => {
  const result = new Map(SUITES.map(suite => [suite, parseBrowserLane(workflow, suite)]));
  assert.equal(result.size, 7);
  for (const [suite, parsed] of result) {
    assert.match(parsed.sourceHash, /^[0-9a-f]{64}$/);
    assert(parsed.commands.length >= 2, 'suite ' + suite + ' must run real native checks and receipt');
    assert.equal(parsed.commands.at(-1).name, 'Bind passing browser evidence to the tested commit');
    assert.equal(new Set(parsed.commands.map(s => s.name)).size, parsed.commands.length);
    assert(parsed.commands.every(s => s.command && !s.command.includes('!unsafe')));
    assert.equal(Object.keys(parsed.coverage).length, 7);
  }
  assert(result.get('active').commands.length > 20, 'active suite cannot silently shrink');
  assert(result.get('network').commands.length > 8, 'network suite cannot silently shrink');
  assert(result.get('ui').commands.length > 8, 'UI suite cannot silently shrink');
  assert(result.get('startup').commands.some(s => s.command.includes('check-inkwave-startup-browser.mjs')));
  assert(result.get('range').commands.some(s => s.command.includes('check-inkwave-range.mjs')));
  assert(result.get('responsive').commands.some(s => s.command.includes('check-inkwave-responsive-isolated.mjs')));
  assert(result.get('catalog').commands.some(s => s.command.includes('check-inkwave-motion-catalog.mjs')));
});

test('CircleCI refuses unknown conditions instead of silently skipping added required checks', () => {
  const mutated = workflow.replace("if: matrix.suite == 'range'", "if: matrix.suite == 'range' && false");
  assert.notEqual(mutated, workflow);
  assert.throws(() => parseBrowserLane(mutated, 'range'), /Unrecognized native browser conditional/);
});

test('CircleCI refuses an omitted acceptance receipt', () => {
  const mutated = workflow.replace('Bind passing browser evidence to the tested commit',
                                    'Remove native acceptance receipt');
  assert.notEqual(mutated, workflow);
  assert.throws(() => parseBrowserLane(mutated, 'ui'), /unconditional native step/);
});

test('CircleCI rejects an unverified performance baseline migration', () => {
  assert.throws(() => parseBrowserLane(workflow, 'active', true), /Runtime-performance baseline/);
});

test('Native command edits update the browser acceptance source hash', () => {
  const before = parseBrowserLane(workflow, 'range');
  const after = parseBrowserLane(workflow.replace('node scripts/check-inkwave-range.mjs',
    'node scripts/check-inkwave-range-altered.mjs'), 'range');
  assert.notEqual(before.sourceHash, after.sourceHash);
  assert(after.commands.some(s => s.command.includes('range-altered')));
});
