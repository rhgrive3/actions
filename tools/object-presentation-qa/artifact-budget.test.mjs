import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifactInventory, assertArtifactBudget, writeBoundedArtifact, ARTIFACT_LIMIT } from './artifact-budget.mjs';
const fixture = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'object-budget-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; };
test('all PNG, hidden receipt and nested failure diagnostic bytes count with ZIP headroom', t => {
  const root = fixture(t);
  writeBoundedArtifact(root, 'frame.png', Buffer.alloc(24), 64);
  writeBoundedArtifact(root, '.receipt.json', Buffer.alloc(15), 64);
  writeBoundedArtifact(root, 'diagnostics/failed.png', Buffer.alloc(24), 64);
  assert.equal(assertArtifactBudget(root, 64).totalBytes, 63);
  assert.equal(artifactInventory(root).files.length, 3);
  assert.throws(() => writeBoundedArtifact(root, 'overflow.json', Buffer.alloc(1), 64), /exceed/);
  assert.equal(artifactInventory(root).totalBytes, 63, 'over-limit output was never written');
  assert.throws(() => assertArtifactBudget(root, 63), /all suite artifacts/);
  assert(512 * 1024 * 1024 - ARTIFACT_LIMIT >= 16 * 1024 * 1024);
});
test('receipt replacement counts actual replacement size and rejects escaped paths', t => {
  const root = fixture(t);
  writeBoundedArtifact(root, 'result.json', Buffer.alloc(24), 64);
  writeBoundedArtifact(root, 'result.json', Buffer.alloc(63), 64);
  assert.equal(assertArtifactBudget(root, 64).totalBytes, 63);
  assert.throws(() => writeBoundedArtifact(root, 'result.json', Buffer.alloc(64), 64), /exceed/);
  assert.equal(fs.statSync(path.join(root, 'result.json')).size, 63);
  assert.throws(() => writeBoundedArtifact(root, '../escape', 'x', 64), /contained/);
});

test('pre-upload inventory rejects unbounded failure logs and all workflow uploads require eligibility', t => {
  const root = fixture(t);
  writeBoundedArtifact(root, 'result.json', Buffer.alloc(32), 64);
  // CPU diagnostics are produced outside the bounded PNG writer. The final
  // upload check must count them even when an earlier build/capture failed.
  fs.writeFileSync(path.join(root, 'failed-cpu.log'), Buffer.alloc(32));
  assert.throws(() => assertArtifactBudget(root, 64), /all suite artifacts/);
  const workflow = fs.readFileSync(new URL('../../.github/workflows/inkwave-object-presentation-qa.yml', import.meta.url), 'utf8');
  assert.match(workflow, /id: artifact-budgets\n        if: always\(\)/);
  for (const suite of ['spawner', 'rainmaker', 'clam']) assert(workflow.includes("if: always() && steps.artifact-budgets.outputs." + suite + " == 'true'"), suite + ' upload is gated by complete inventory');
});

test('actual final-upload script isolates small, oversized and absent suite directories', t => {
  const root = fixture(t), helper = path.join(root, 'tools/object-presentation-qa');
  fs.mkdirSync(helper, { recursive: true });
  fs.copyFileSync(new URL('./artifact-budget.mjs', import.meta.url), path.join(helper, 'artifact-budget.mjs'));
  fs.mkdirSync(path.join(root, '.qa-evidence/spawner'), { recursive: true });
  fs.writeFileSync(path.join(root, '.qa-evidence/spawner/failed.json'), 'oops');
  fs.mkdirSync(path.join(root, '.qa-evidence/rainmaker'), { recursive: true });
  const oversized = path.join(root, '.qa-evidence/rainmaker/failed-cpu.log');
  fs.writeFileSync(oversized, ''); fs.truncateSync(oversized, ARTIFACT_LIMIT);
  const workflow = fs.readFileSync(new URL('../../.github/workflows/inkwave-object-presentation-qa.yml', import.meta.url), 'utf8');
  const inventoryStep = workflow.slice(workflow.indexOf('        id: artifact-budgets'));
  const match = /node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/.exec(inventoryStep);
  assert(match, 'final-inventory command exists');
  const script = match[1].split('\n').map(line => line.slice(10)).join('\n');
  const output = path.join(root, 'outputs.txt');
  const result = spawnSync(process.execPath, ['--input-type=module'], { cwd: root, input: script, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
  assert.equal(result.status, 1, 'oversized diagnostics fail the step');
  assert.equal(fs.readFileSync(output, 'utf8'), 'spawner=true\nrainmaker=false\nclam=false\n', 'small failure evidence survives independently; oversized and absent artifacts cannot upload');
  assert.match(result.stderr, /rainmaker:.*all suite artifacts/);
  fs.rmSync(path.join(root, '.qa-evidence'), { recursive: true, force: true }); fs.writeFileSync(output, '');
  const absent = spawnSync(process.execPath, ['--input-type=module'], { cwd: root, input: script, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
  assert.equal(absent.status, 0);
  assert.equal(fs.readFileSync(output, 'utf8'), 'spawner=false\nrainmaker=false\nclam=false\n', 'no build/capture directories means no eligible artifact');
});


test('nested air comparison cannot evade the shared Rainmaker artifact cap',t=>{
 const root=fixture(t),air=path.join(root,'air');fs.mkdirSync(air);
 writeBoundedArtifact(root,'result.json',Buffer.alloc(32),64);
 writeBoundedArtifact(air,'result.json',Buffer.alloc(31),64);
 assert.equal(assertArtifactBudget(root,64).totalBytes,63);
 assert.equal(assertArtifactBudget(air,64).totalBytes,31);
 assert.throws(()=>writeBoundedArtifact(root,'air/extra.png',Buffer.alloc(1),64),/exceed/);
 fs.writeFileSync(path.join(air,'failed.log'),'!');
 assert.throws(()=>assertArtifactBudget(root,64),/all suite artifacts/,'final recursive upload check includes nested failure evidence');
});
