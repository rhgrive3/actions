import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
const job = (text, name) => {
  const marker = `  ${name}:\n`, start = text.indexOf(marker, text.indexOf('\njobs:\n'));
  assert.ok(start >= 0, `Missing ${name}`);
  const rest = text.slice(start + marker.length), end = rest.search(/^  [\w-]+:\n/m);
  return end < 0 ? rest : rest.slice(0, end);
};
const condition = (text, name) => job(text, name).match(/^    if: (.+)$/m)?.[1];
const guard = 'node --test scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs';
const source = 'node --experimental-vm-modules --test patches/splatoon3/tests/wall-render-gates.test.mjs patches/splatoon3/tests/wall-render-production-contract.test.mjs';
const emitted = 'INKWAVE_BUILT_SITE=.built-site/_site node --experimental-vm-modules --test patches/splatoon3/tests/wall-render-production-contract.test.mjs';
const verifier = 'node scripts/check-inkwave-wall-render.mjs --site .built-site/_site --evidence-dir "$CI_STORAGE/evidence/wall" --profile-dir "$CI_STORAGE/cache/wall" --exact-source';
function verify(text) {
  assert.match(text, /      wall_render_diagnostic:\n        description: [^\n]+\n        type: boolean\n        default: false\n/);
  assert.equal(condition(text, 'wall-render-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic == true");
  assert.equal(condition(text, 'render-diagnostic'), 'inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic != true');
  assert.equal(condition(text, 'network-opening-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true");
  for (const name of ['validate_core','patch_tests','browser','seven_claims','resource_paint_continuation']) assert.equal(condition(text,name), 'inputs.diagnostic_only != true');
  assert.equal(condition(text,'validate'), '${{ always() && inputs.diagnostic_only != true }}');
  assert.ok(text.includes("inputs.wall_render_diagnostic == true && '-wall-render-diagnostic' || ''"));
  assert.ok(text.includes('cancel-in-progress: ${{ !(inputs.diagnostic_only == true && (inputs.network_opening_diagnostic == true || inputs.wall_render_diagnostic == true)) }}'));
  const native = job(text,'wall-render-diagnostic');
  assert.match(native, /^    timeout-minutes: 30$/m);
  for (const literal of [
    'timeout-minutes: 30', 'runs-on: ubuntu-latest', 'WORKFLOW_SHA: ${{ github.workflow_sha }}',
    'ref: \${{ env.SOURCE_SHA }}', 'persist-credentials: false',
    '[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]', 'test "$WORKFLOW_SHA" = "$SOURCE_SHA"',
    'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"',
    'node scripts/build-inkwave.mjs inkwave-public .built-site/_site',
    'test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"',
    'esbuild@0.28.2 playwright@1.62.1', 'npx playwright install --with-deps chromium',
    guard, source, emitted, verifier,
    'uses: actions/upload-artifact@v4\n        if: always()',
    'path: ${{ env.CI_STORAGE }}/evidence/wall/',
    'name: inkwave-wall-render-diagnostic-\${{ env.SOURCE_SHA }}-${{ github.run_id }}-\${{ github.run_attempt }}'
  ]) assert.ok(native.includes(literal), `Missing ${literal}`);
  assert.ok(job(text,'validate_core').includes('scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs'));
  assert.ok(native.indexOf(source) < native.indexOf('node scripts/build-inkwave.mjs'));
  assert.ok(native.indexOf(emitted) > native.indexOf('node scripts/build-inkwave.mjs'));
  assert.ok(native.indexOf(verifier) > native.indexOf(emitted));
  assert.doesNotMatch(native, /continue-on-error|\|\| true|INKWAVE_DISABLE|--skip|--baseline|check-inkwave-(?:runtime-performance|combat-ceiling|motion|weapon)/);
  const checks = [...native.matchAll(/node (scripts\/check-[^\s]+)/g)].map(m=>m[1]);
  assert.deepEqual(checks, ['scripts/check-inkwave-wall-render.mjs']);
  return true;
}
function evaluate(expression, c) {
  return expression.split(' && ').every(term=> {
    if(term === "github.event_name == 'workflow_dispatch'") return c.event === 'workflow_dispatch';
    const match = term.match(/^inputs\.(diagnostic_only|network_opening_diagnostic|wall_render_diagnostic) (==|!=) true$/);
    assert.ok(match, `Unexpected predicate ${term}`);
    return match[2] === '==' ? c[match[1]] === true : c[match[1]] !== true;
  });
}
test('wall-only route retains exact-head, real build, full verifier and always evidence', ()=>verify(workflow));
test('all event and flag combinations isolate wall from full, network and broad render jobs', ()=> {
  for(const event of ['workflow_dispatch','push','pull_request']) for(const diagnostic_only of [false,true]) for(const network_opening_diagnostic of [false,true]) for(const wall_render_diagnostic of [false,true]) {
    const c={event,diagnostic_only,network_opening_diagnostic,wall_render_diagnostic};
    const wall=evaluate(condition(workflow,'wall-render-diagnostic'),c);
    assert.equal(wall,event==='workflow_dispatch' && diagnostic_only && !network_opening_diagnostic && wall_render_diagnostic);
    if(wall) for(const name of ['validate_core','patch_tests','browser','network-opening-diagnostic','render-diagnostic','seven_claims','resource_paint_continuation']) assert.equal(evaluate(condition(workflow,name),c),false,name);
  }
});
test('missing identity, real build, source/emitted contracts or full verifier fail closed', ()=> {
  for(const literal of ['test "$WORKFLOW_SHA" = "$SOURCE_SHA"','test "$(git rev-parse HEAD)" = "$SOURCE_SHA"','test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"','node scripts/build-inkwave.mjs inkwave-public .built-site/_site',source,emitted,verifier,guard]) {
    const changed=workflow.replaceAll(literal,'true # removed'); assert.notEqual(changed,workflow); assert.throws(()=>verify(changed));
  }
});
test('scope, timeout, evidence, failure suppression and concurrency mutations are rejected',()=> {
  for(const [before,after] of [["inputs.wall_render_diagnostic == true && '-wall-render-diagnostic'", "inputs.wall_render_diagnostic == true && '-full'"],['inputs.wall_render_diagnostic != true\n    runs-on:', 'inputs.wall_render_diagnostic == true\n    runs-on:'],['timeout-minutes: 30','timeout-minutes: 300'],['if: always()','if: success()'],['  wall-render-diagnostic:\n','  wall-render-diagnostic:\n    continue-on-error: true\n'],['default: false\n      deep_lifecycle:', 'default: true\n      deep_lifecycle:'],['cancel-in-progress: ${{ !(inputs.diagnostic_only == true && (inputs.network_opening_diagnostic == true || inputs.wall_render_diagnostic == true)) }}','cancel-in-progress: true']]) {
    const changed=workflow.replaceAll(before,after); assert.notEqual(changed,workflow); assert.throws(()=>verify(changed));
  }
});

// Reviewed integration adds source/clock/animation acceptance guards only.
// The later 31-PR source epoch adds its independent immutable-pair guard.
// Existing jobs, failures, thresholds and immutable builds remain required.
// Shared immutable build, additive acceptance guards,
// exact-head startup clock evidence, and complete sparse diagnostic checkouts.
const acceptedJobHashes = {
  "validate_core": "80f5bcdbcf39f3f616c231c0cbad3eea93849fed3fb19c20e22f7c063ab47a39",
  "patch_tests": "f4aed2dfb7766fc1497498fc2d6d7689ec90441f0747b854b07a4e631109c5b1",
  "validate": "54ac81f9c3cfa0e1eaed643dc62b644e9658abef0b53faced3a7d47888b790f9",
  "browser": "2d925a6bece5c03d5f5a2fefa550a622d1589e8e3ab41ac517d6d624cd93bb9c",
  "network-opening-diagnostic": "f205a8473b3bfc0f86819f43bbe4121e4c590dda71490e363f3908db658ca767",
  "seven_claims": "34ef0c57320a741be38b42f6e0e9eb62e8d7f0b9bbb55b6b9a091c26a828c3cd",
  "resource_paint_continuation": "78e0d3ebf1290c9250339e8dcef35c9b60077c82fd5a99ff51da01b3c50a442b"
};
// A reviewed repair moves the orphaned artifact name out of Bash and into an
// actual upload action. Restore only that exact edit when comparing the original
// job pins; every pre-existing test command, failure gate and hash stays fixed.
const legacyCoreEvidenceTail = '            _site-launch-packets.json\n          retention-days: 14\n';
const repairedCoreEvidenceTail = `      - name: Retain exact emitted launch packet evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: inkwave-launch-packets-\${{ env.SOURCE_SHA }}-\${{ github.run_attempt }}
          path: _site-launch-packets.json
          if-no-files-found: error
          retention-days: 14
`;
function canonicalCoreEvidence(body) {
  assert.equal(body.split(repairedCoreEvidenceTail).length, 2, 'exact reviewed upload repair required');
  assert.ok(body.includes('            patches/network-replication/tests/tower-mine-paint-admission.test.mjs\n' + repairedCoreEvidenceTail), 'all fidelity tests must run before upload');
  assert.ok(!body.includes(legacyCoreEvidenceTail), 'artifact names cannot execute as shell commands');
  return body.replace(repairedCoreEvidenceTail, legacyCoreEvidenceTail);
}
// c1c0 adds only these two approved QA regressions to the motion command in
// 55399a7466c744e53b6205dfb80c9d78d2e3daeb. Require their exact location and
// uniqueness, then remove only those arguments to recover the original pin.
// The new digest binds the additive body; the old digest still proves that no
// pre-existing command, failure gate, workload or unrelated job was changed.
const approvedMotionTests = [
  'scripts/tests/inkwave-frozen-hud-capture.test.mjs',
  'scripts/tests/inkwave-ui-visual-probe-errors.test.mjs'
];
const approvedMotionArguments = ' ' + approvedMotionTests.join(' ');
const approvedCoreHash = 'd91e7883718efdacc8b6af8431557419a747beeddc229252a23a2e012f5e0d5f';
function canonicalCoreMotionTests(body) {
  const marker = '      - name: Verify motion verifier regressions\n';
  assert.equal(body.split(marker).length, 2, 'exact motion regression step required');
  const start = body.indexOf(marker) + marker.length, end = body.indexOf('\n', start);
  assert.ok(end >= 0, 'motion regression command must end with a newline');
  const command = body.slice(start, end);
  assert.ok(command.startsWith('        run: node --test '), 'motion regressions must remain a real test command');
  assert.ok(command.endsWith(' scripts/tests/inkwave-responsive-progress-summary.test.mjs' + approvedMotionArguments), 'exact approved QA arguments must be appended to the motion command');
  for (const file of approvedMotionTests) assert.equal(body.split(file).length, 2, file + ' must run exactly once');
  return body.slice(0, end - approvedMotionArguments.length) + body.slice(end);
}
// The queue changes source routing and fetch preparation. Reverse only its
// exact composed hunks before applying the unchanged seven historical pins
// and the mandatory HUD-coverage inverse and mutation controls below.
function canonicalQueueCoreBody(body) {
  { const from="      - name: Verify deterministic network replication\n        run: node scripts/run-inkwave-source-remainder.mjs network\n      - name: Verify remote combat provenance and equipped hit ceilings\n", to="      - name: Verify deterministic network replication\n        run: node --experimental-vm-modules --test patches/network-replication/tests/*.test.mjs\n      - name: Verify remote combat provenance and equipped hit ceilings\n";
    assert.equal(body.split(from).length,2,"queue core hunk 1 must occur exactly once");body=body.replace(from,to); }
  { const from="      - name: Verify local quality regressions\n        run: node scripts/run-inkwave-source-remainder.mjs quality\n      - name: Verify migrated direct game source ownership\n", to="      - name: Verify local quality regressions\n        run: node --experimental-vm-modules --test patches/local-quality/tests/*.test.mjs scripts/tests/inkwave-idle-resources-gates.test.mjs\n      - name: Verify migrated direct game source ownership\n";
    assert.equal(body.split(from).length,2,"queue core hunk 2 must occur exactly once");body=body.replace(from,to); }
  { const from="      - name: Verify motion verifier regressions\n        run: node --test scripts/tests/inkwave-source-remainder.test.mjs scripts/tests/inkwave-quality-shallow-history.test.mjs scripts/tests/inkwave-optimization-workflows.test.mjs scripts/tests/inkwave-test-shards.test.mjs scripts/tests/inkwave-accepted-default-probe.test.mjs scripts/tests/inkwave-motion-gates.test.mjs scripts/tests/inkwave-integration-workflow.test.mjs scripts/tests/inkwave-runtime-evidence.test.mjs scripts/tests/inkwave-queued-workflow-policy.test.mjs scripts/tests/inkwave-ci-queue-relief.test.mjs scripts/tests/inkwave-added-ci-contracts.test.mjs scripts/tests/inkwave-ci-source-admission.test.mjs scripts/tests/inkwave-main9fe-paint-admission.test.mjs scripts/tests/inkwave-maine1f-paint-admission.test.mjs scripts/tests/inkwave-pad-map-evidence.test.mjs scripts/tests/inkwave-range-pause-readiness.test.mjs scripts/tests/inkwave-range-profile-receipt.test.mjs scripts/tests/inkwave-range-menu-entry.test.mjs scripts/tests/inkwave-range-trusted-entry.test.mjs scripts/tests/inkwave-responsive-fixture.test.mjs scripts/tests/inkwave-responsive-diagnostics.test.mjs scripts/tests/inkwave-ballpoint-evidence.test.mjs scripts/tests/inkwave-streamed-music-diagnostics.test.mjs scripts/tests/inkwave-active-media-diagnostics.test.mjs scripts/tests/inkwave-context-raf-diagnostics.test.mjs scripts/tests/inkwave-static-menu-gpu-budget.test.mjs scripts/tests/inkwave-selected-prop-pack-contracts.test.mjs scripts/tests/inkwave-roller-blob-worker-binding.test.mjs scripts/tests/inkwave-exact-checkout-head.test.mjs scripts/tests/inkwave-responsive-progress-summary.test.mjs scripts/tests/inkwave-frozen-hud-capture.test.mjs scripts/tests/inkwave-ui-visual-probe-errors.test.mjs\n      - name: Verify aggregate QA acceptance guards\n", to="      - name: Verify motion verifier regressions\n        run: node --test scripts/tests/inkwave-test-shards.test.mjs scripts/tests/inkwave-accepted-default-probe.test.mjs scripts/tests/inkwave-motion-gates.test.mjs scripts/tests/inkwave-integration-workflow.test.mjs scripts/tests/inkwave-runtime-evidence.test.mjs scripts/tests/inkwave-queued-workflow-policy.test.mjs scripts/tests/inkwave-ci-queue-relief.test.mjs scripts/tests/inkwave-added-ci-contracts.test.mjs scripts/tests/inkwave-ci-source-admission.test.mjs scripts/tests/inkwave-main9fe-paint-admission.test.mjs scripts/tests/inkwave-maine1f-paint-admission.test.mjs scripts/tests/inkwave-pad-map-evidence.test.mjs scripts/tests/inkwave-range-pause-readiness.test.mjs scripts/tests/inkwave-range-profile-receipt.test.mjs scripts/tests/inkwave-range-menu-entry.test.mjs scripts/tests/inkwave-range-trusted-entry.test.mjs scripts/tests/inkwave-responsive-fixture.test.mjs scripts/tests/inkwave-responsive-diagnostics.test.mjs scripts/tests/inkwave-ballpoint-evidence.test.mjs scripts/tests/inkwave-streamed-music-diagnostics.test.mjs scripts/tests/inkwave-active-media-diagnostics.test.mjs scripts/tests/inkwave-context-raf-diagnostics.test.mjs scripts/tests/inkwave-static-menu-gpu-budget.test.mjs scripts/tests/inkwave-selected-prop-pack-contracts.test.mjs scripts/tests/inkwave-roller-blob-worker-binding.test.mjs scripts/tests/inkwave-exact-checkout-head.test.mjs scripts/tests/inkwave-responsive-progress-summary.test.mjs scripts/tests/inkwave-frozen-hud-capture.test.mjs scripts/tests/inkwave-ui-visual-probe-errors.test.mjs\n      - name: Verify aggregate QA acceptance guards\n";
    assert.equal(body.split(from).length,2,"queue core hunk 3 must occur exactly once");body=body.replace(from,to); }
  { const from="          node --max-old-space-size=128 --test --test-concurrency=1 scripts/tests/continuous-browser-video.test.mjs\n      - name: Verify pinned-fetch deduplication and dedicated QA routing\n        run: |\n          python3 -m unittest discover -s scripts/tests -p test_fetch_inkwave_pinned_references.py -v\n          node --test scripts/tests/inkwave-optimization-workflows.test.mjs\n      - name: Verify pinned primary numerical sources\n", to="          node --max-old-space-size=128 --test --test-concurrency=1 scripts/tests/continuous-browser-video.test.mjs\n      - name: Verify pinned primary numerical sources\n";
    assert.equal(body.split(from).length,2,"queue core hunk 4 must occur exactly once");body=body.replace(from,to); }
  { const from="        run: |\n          python3 scripts/fetch-inkwave-pinned-references.py\n          INKWAVE_WEIGHT_PARAMS=.reference-data/data/parameter/1130/misc/params.json node --experimental-vm-modules --test patches/splatoon3/tests/weapon-weight-gear.test.mjs\n", to="        run: |\n          python3 - <<'PY'\n          import hashlib, json, pathlib, urllib.request\n          fetched={}\n          def reference_bytes(url):\n            if url not in fetched:\n              with urllib.request.urlopen(url,timeout=30) as response: fetched[url]=response.read()\n            return fetched[url]\n          reference=json.loads(pathlib.Path('patches/splatoon3/reference/curated-numbers.json').read_text())\n          for source in reference['sources']:\n            target=pathlib.Path('.reference-data')/source['id']\n            target.parent.mkdir(parents=True,exist_ok=True)\n            target.write_bytes(reference_bytes(source['url']))\n          weapons=json.loads(pathlib.Path('patches/splatoon3/reference/weapons-fidelity-reference.json').read_text())\n          for source in weapons['sources']:\n            if not source.get('expectedFileSha256'): continue\n            target=pathlib.Path('.reference-data/weapons')/source['url'].rsplit('/',1)[-1]\n            target.parent.mkdir(parents=True,exist_ok=True)\n            data=reference_bytes(source['url'])\n            assert hashlib.sha256(data).hexdigest()==source['expectedFileSha256'], source['url']\n            target.write_bytes(data)\n          PY\n          INKWAVE_WEIGHT_PARAMS=.reference-data/data/parameter/1130/misc/params.json node --experimental-vm-modules --test patches/splatoon3/tests/weapon-weight-gear.test.mjs\n";
    assert.equal(body.split(from).length,2,"queue core hunk 5 must occur exactly once");body=body.replace(from,to); }
  { const from="          INKWAVE_WEIGHT_PARAMS=.reference-data/data/parameter/1130/misc/params.json node --experimental-vm-modules --test patches/splatoon3/tests/weapon-weight-gear.test.mjs\n          INKWAVE_OBJECT_DAMAGE_REFERENCE=.reference-data/object-damage.json node --experimental-vm-modules --test patches/splatoon3/tests/object-shredder-1130.test.mjs patches/splatoon3/tests/native-sprinkler-damage.test.mjs\n", to="          INKWAVE_WEIGHT_PARAMS=.reference-data/data/parameter/1130/misc/params.json node --experimental-vm-modules --test patches/splatoon3/tests/weapon-weight-gear.test.mjs\n          python3 - <<'PYOBJ'\n          import json, pathlib, urllib.request\n          receipt=json.loads(pathlib.Path('patches/splatoon3/reference/object-shredder-1130.json').read_text())['receipt']\n          url='https://raw.githubusercontent.com/Leanny/splat3/'+receipt['commit']+'/'+receipt['path']\n          with urllib.request.urlopen(url,timeout=30) as response:\n            pathlib.Path('.reference-data/object-damage.json').write_bytes(response.read())\n          PYOBJ\n          INKWAVE_OBJECT_DAMAGE_REFERENCE=.reference-data/object-damage.json node --experimental-vm-modules --test patches/splatoon3/tests/object-shredder-1130.test.mjs patches/splatoon3/tests/native-sprinkler-damage.test.mjs\n";
    assert.equal(body.split(from).length,2,"queue core hunk 6 must occur exactly once");body=body.replace(from,to); }
  { const from="        run: |\n          INKWAVE_MAIN_WEAPON_REFERENCE=.reference-data/catalog node --test patches/splatoon3/tests/main-weapon-catalog-data.test.mjs\n", to="        run: |\n          node --input-type=module - <<'JS'\n          import fs from 'node:fs';\n          import { MAIN_WEAPON_CATALOG as catalog } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';\n          fs.writeFileSync('.reference-catalog-index.json',JSON.stringify({commit:catalog.sourceCommit,paths:catalog.records.map(r=>r.sourcePath)}));\n          JS\n          python3 - <<'PY'\n          import concurrent.futures, json, pathlib, urllib.request\n          index=json.loads(pathlib.Path('.reference-catalog-index.json').read_text())\n          paths=set(index['paths']) | {'data/mush/1130/WeaponInfoMain.json','data/language/USen.json','data/language/JPja.json'}\n          def fetch_source(relative):\n            target=pathlib.Path('.reference-data/catalog')/relative\n            target.parent.mkdir(parents=True,exist_ok=True)\n            url='https://raw.githubusercontent.com/Leanny/splat3/'+index['commit']+'/'+relative\n            with urllib.request.urlopen(url,timeout=30) as response: target.write_bytes(response.read())\n          with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:\n            list(pool.map(fetch_source,sorted(paths)))\n          PY\n          INKWAVE_MAIN_WEAPON_REFERENCE=.reference-data/catalog node --test patches/splatoon3/tests/main-weapon-catalog-data.test.mjs\n";
    assert.equal(body.split(from).length,2,"queue core hunk 7 must occur exactly once");body=body.replace(from,to); }
  { const from="        run: INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test patches/splatoon3/tests/charger-native-grip-reach.test.mjs patches/splatoon3/tests/charger-protected-trajectory.test.mjs\n      - name: Verify emitted opposing-spawn body exclusion and allied exits\n        run: INKWAVE_BUILT_SITE=_site INKWAVE_CONTROLS_SITE=_site node --experimental-vm-modules --test patches/splatoon3/tests/spawn-exclusion.test.mjs patches/splatoon3/tests/spawn-exclusion-fallback.test.mjs patches/reliability/tests/special-spawn-barrier.test.mjs patches/splatoon3/tests/respawn-lifecycle.test.mjs\n      - name: Verify emitted Boss positive-proof admission and PvP zero knockback\n", to="        run: INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test patches/splatoon3/tests/charger-native-grip-reach.test.mjs patches/splatoon3/tests/charger-protected-trajectory.test.mjs\n      - name: Verify emitted Boss positive-proof admission and PvP zero knockback\n";
    assert.equal(body.split(from).length,2,"queue core hunk 8 must occur exactly once");body=body.replace(from,to); }
  return body;
}
const originalCoreBrowserInstall = '      - name: Install pinned source regression and build tool\n        run: npm install --no-save --no-package-lock --silent esbuild@0.28.2\n';
const reviewedCoreBrowserInstall = '      - name: Install pinned source regression and build tool\n        run: |\n          npm install --no-save --no-package-lock --silent esbuild@0.28.2 playwright@1.62.1\n          npx --no-install playwright install --with-deps chromium\n';
function canonicalCoreBrowserInstall(body) {
  const next = '      - name: Prepare persistent worker regression fixtures\n';
  assert.equal(body.split(reviewedCoreBrowserInstall + next).length, 2, 'exact reviewed browser setup and placement required');
  assert.equal(body.split('playwright@1.62.1').length, 2, 'core browser dependency must occur once');
  assert.equal(body.split('npx --no-install playwright install --with-deps chromium').length, 2, 'core browser installation must occur once');
  assert.ok(body.indexOf(reviewedCoreBrowserInstall) < body.indexOf('      - name: Run requested focused source regressions\n'));
  assert.ok(body.indexOf(reviewedCoreBrowserInstall) < body.indexOf('        run: node scripts/run-inkwave-source-remainder.mjs quality\n'));
  return body.replace(reviewedCoreBrowserInstall, originalCoreBrowserInstall);
}
function verifyAcceptedJobs(text) {
  for(const [name, expected] of Object.entries(acceptedJobHashes)) {
    let body = job(text,name).replace(' scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs','')
      .replaceAll('          sudo python3 scripts/prepare-inkwave-ci-apt.py\n          npx playwright install --with-deps', '          npx playwright install --with-deps');
    if (name === 'validate_core') {
      body = canonicalCoreBrowserInstall(body);
      body = canonicalQueueCoreBody(body);
      body = canonicalCoreEvidence(body);
      const additiveBody = body;
      body = canonicalCoreMotionTests(body);
      assert.equal(createHash('sha256').update(additiveBody).digest('hex'), approvedCoreHash, 'reviewed additive core body');
    }
    assert.equal(createHash('sha256').update(body).digest('hex'),expected,name);
  }
}
test('accepted Turf and network job bodies retain their original pins after exact artifact repair and additive QA coverage',()=>verifyAcceptedJobs(workflow));
test('the previously pinned broken artifact command is rejected despite its original digest',()=> {
  const broken=workflow.replace(repairedCoreEvidenceTail,legacyCoreEvidenceTail);
  assert.notEqual(broken,workflow);
  assert.throws(()=>verifyAcceptedJobs(broken),/exact reviewed upload repair required/);
});
test('artifact repair cannot waive tests, paths, identity, upload errors or unrelated job edits',()=> {
  for(const [before,after] of [
    ['patches/splatoon3/tests/active-special-gauge.test.mjs',''],
    ['patches/network-replication/tests/tower-mine-paint-admission.test.mjs','patches/network-replication/tests/not-a-real-test.mjs'],
    ['      - name: Retain exact emitted launch packet evidence\n        if: always()', '      - name: Retain exact emitted launch packet evidence\n        if: false'],
    ['path: _site-launch-packets.json','path: another-report.json'],
    ['if-no-files-found: error\n          retention-days: 14\n  # The test-file set','if-no-files-found: warn\n          retention-days: 14\n  # The test-file set'],
    ['name: inkwave-launch-packets-${{ env.SOURCE_SHA }}-${{ github.run_attempt }}','name: inkwave-launch-packets-unbound'],
    ['      - name: Retain exact emitted launch packet evidence','            true # extra shell command\n      - name: Retain exact emitted launch packet evidence'],
    ['test "$CORE_RESULT" = success','true # no core requirement']
  ]) {
    const changed=workflow.replace(before,after);
    assert.notEqual(changed,workflow,before);
    assert.throws(()=>verifyAcceptedJobs(changed),before);
  }
});

test('approved motion coverage rejects omission, duplication, relocation and unrelated command edits',()=> {
  const tail = ' scripts/tests/inkwave-responsive-progress-summary.test.mjs' + approvedMotionArguments + '\n';
  for (const [before,after] of [
    ...approvedMotionTests.map(file=>[' ' + file, '']),
    [approvedMotionArguments, ''],
    [approvedMotionArguments, approvedMotionArguments + approvedMotionArguments],
    [approvedMotionArguments, ' ' + [...approvedMotionTests].reverse().join(' ')],
    [tail, ' scripts/tests/inkwave-responsive-progress-summary.test.mjs\n      - name: Relocated QA regressions\n        run: node --test' + approvedMotionArguments + '\n'],
    [tail, tail.trimEnd() + ' scripts/tests/unreviewed.test.mjs\n'],
    ['scripts/tests/inkwave-responsive-progress-summary.test.mjs', 'scripts/tests/unreviewed.test.mjs'],
    ['      - name: Verify motion verifier regressions\n        run: node --test ', '      - name: Verify motion verifier regressions\n        run: echo ']
  ]) {
    const changed = workflow.replace(before,after);
    assert.notEqual(changed,workflow,before);
    assert.throws(()=>verifyAcceptedJobs(changed),before);
  }
});
test('additive QA coverage cannot authorize changes to any previously pinned job',()=> {
  for (const name of Object.keys(acceptedJobHashes)) {
    const marker = `  ${name}:\n`;
    const changed = workflow.replace(marker,marker + '    continue-on-error: true\n');
    assert.notEqual(changed,workflow,name);
    assert.throws(()=>verifyAcceptedJobs(changed),name);
  }
});

test('reviewed core browser provisioning rejects missing, altered, relocated and suppressed setup',()=>{
 const edits=[
  [reviewedCoreBrowserInstall,originalCoreBrowserInstall],
  ['playwright@1.62.1','playwright@1.62.0'],
  ['npx --no-install playwright install --with-deps chromium','npx --no-install playwright install --with-deps webkit'],
  ['npx --no-install playwright install --with-deps chromium','true # browser omitted'],
  [reviewedCoreBrowserInstall,reviewedCoreBrowserInstall+reviewedCoreBrowserInstall],
  [reviewedCoreBrowserInstall,reviewedCoreBrowserInstall.replace('        run: |','        if: false\n        run: |')],
  [reviewedCoreBrowserInstall,reviewedCoreBrowserInstall.replace('        run: |','        continue-on-error: true\n        run: |')],
  [reviewedCoreBrowserInstall,reviewedCoreBrowserInstall.replace('--with-deps chromium','--with-deps chromium || true')],
  [reviewedCoreBrowserInstall,reviewedCoreBrowserInstall.replace('          npm install --no-save --no-package-lock --silent esbuild@0.28.2 playwright@1.62.1\n          npx --no-install playwright install --with-deps chromium\n','          npx --no-install playwright install --with-deps chromium\n          npm install --no-save --no-package-lock --silent esbuild@0.28.2 playwright@1.62.1\n')]
 ];
 for(const [before,after] of edits){const changed=workflow.replace(before,after);assert.notEqual(changed,workflow);assert.throws(()=>verifyAcceptedJobs(changed));}
 const relocated=workflow.replace(reviewedCoreBrowserInstall,'').replace('      - name: Verify local quality regressions\n',reviewedCoreBrowserInstall+'      - name: Verify local quality regressions\n');
 assert.notEqual(relocated,workflow);assert.throws(()=>verifyAcceptedJobs(relocated));
});
