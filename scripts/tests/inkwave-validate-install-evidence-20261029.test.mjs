import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const workflow=fs.readFileSync(path.join(repo,'.github/workflows/validate-inkwave-update.yml'),'utf8');
function job(name,next) {
  const start=workflow.indexOf(`  ${name}:`),end=workflow.indexOf(`  ${next}:`,start+1);
  assert.ok(start>=0 && end>start,`job boundaries ${name}`);
  return workflow.slice(start,end);
}

test('affected validation jobs install the locked tree and create scratch before npm',()=>{
  const patch=job('patch_tests','circleci_offload_gate'),browser=job('browser','seven_claims');
  const patchStart=patch.indexOf('name: Install pinned patch test dependencies');
  const patchEnd=patch.indexOf('name: Prepare persistent worker regression fixtures',patchStart);
  assert.ok(patchStart>=0 && patchEnd>patchStart);
  assert.match(patch.slice(patchStart,patchEnd),/run: npm ci --no-audit --no-fund/);
  const verify=browser.slice(browser.indexOf('name: Verify immutable site for this browser shard'),browser.indexOf('name: Cache pinned browser executables'));
  const scratch=verify.indexOf('mkdir -p .built-site .ci-scratch'),install=verify.indexOf('npm ci --no-audit --no-fund');
  assert.ok(scratch>=0 && install>scratch,'npm sees an existing TMPDIR');
  assert.ok(verify.includes('tar -xf .built-site/immutable-site.tar -C .built-site'));
  assert.ok(verify.includes('test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"'));
  assert.ok(verify.includes('check-inkwave-startup-budget.mjs'));
});

test('early failure packaging does not depend on CI_STORAGE provisioning',()=>{
  const browser=job('browser','seven_claims');
  const command='node scripts/ci/package-inkwave-evidence.mjs --browser-failure "$CI_STORAGE/evidence" "$RUNNER_TEMP/inkwave-browser-failure-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${BROWSER_SUITE}" .built-site/_site/inkwave-build.json';
  assert.ok(browser.includes(`run: ${command}`));
  assert.ok(browser.includes('if: always() && (failure() || cancelled())\n        id: browser_failure_evidence'));
  const runner=fs.readFileSync(path.join(repo,'scripts/ci/run-circleci-browser-lane.mjs'),'utf8');
  assert.ok(runner.includes(command),'CircleCI admits only the reviewed command');
});

test('bounded failure package records no evidence when persistent storage was never writable',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-early-evidence-'));
  const locked=path.join(root,'locked'),temp=path.join(root,'runner-temp');
  fs.mkdirSync(locked); fs.mkdirSync(temp); fs.chmodSync(locked,0o555);
  const input=path.join(locked,'missing','evidence'),oldOutput=path.join(locked,'missing','failure-evidence');
  const freshOutput=path.join(temp,'inkwave-browser-failure-1-1-active');
  const script=path.join(repo,'scripts/ci/package-inkwave-evidence.mjs'),output=path.join(temp,'github-output');
  const run=dest=>spawnSync(process.execPath,[script,'--browser-failure',input,dest],{encoding:'utf8',env:{...process.env,GITHUB_OUTPUT:output}});
  try {
    const old=run(oldOutput);
    assert.equal(old.status,1); assert.match(old.stderr,/EACCES/,'old path reproduces unprepared storage denial');
    const fixed=run(freshOutput);
    assert.equal(fixed.status,1,'missing evidence cannot turn the failed job green');
    assert.equal(fixed.stderr,'');
    const result=JSON.parse(fixed.stdout); assert.equal(result.eligible,true); assert.equal(result.failed,true);
    const manifest=JSON.parse(fs.readFileSync(path.join(freshOutput,'EVIDENCE_MANIFEST.json'),'utf8'));
    assert.equal(manifest.status,'no-evidence'); assert.equal(manifest.originalBytes,0);
    assert.match(fs.readFileSync(output,'utf8'),/eligible=true\npath=/);
  } finally {fs.chmodSync(locked,0o755);fs.rmSync(root,{recursive:true,force:true});}
});
