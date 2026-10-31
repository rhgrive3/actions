import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseValidateWorkflow} from '../ci/inkwave-validate-contract.mjs';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const ownTest = 'scripts/tests/inkwave-queue-ci-20261031.test.mjs';
const inkVolumeInputs = [
  'inkwave-public/src/fx/fx.js',
  'inkwave-public/src/main.js',
  'inkwave-public/src/game/weapons.js',
];
// These are directly executed inputs identified from the browser/test import
// graphs. Exact paths keep unrelated changes out of the expensive QA lanes.
const contracts = [
  {workflow:'inkwave-ink-volumes.yml', events:['pull_request'], inputs:inkVolumeInputs},
  {workflow:'inkwave-composed-cpu.yml', events:['pull_request'], inputs:[
    'scripts/lib/inkwave-sandbox-browser.mjs', 'inkwave-public/src/main.js',
    'inkwave-public/src/game/actor.js', 'inkwave-public/src/game/physics.js',
    'inkwave-public/src/game/character.js', ownTest,
  ]},
  {workflow:'inkwave-gameplay-resources.yml', events:['pull_request','push'], inputs:[
    'inkwave-public/src/main.js', 'inkwave-public/src/core/renderer.js', ownTest,
  ]},
  {workflow:'inkwave-headgear-visual-qa.yml', events:['pull_request','push'], inputs:[
    ...['geo','mats','hair','lod','style','outfit','face'].map(part => `inkwave-public/src/game/character-${part}.js`),
    'inkwave-public/src/game/character.js', ownTest,
  ]},
  {workflow:'inkwave-roller-support-source-pin.yml', events:['pull_request'], inputs:[
    'patches/splatoon3/runtime/rolling-floor.mjs', 'patches/splatoon3/runtime/install.mjs',
    'patches/splatoon3/profile.json', 'scripts/lib/inkwave-31pr-paint-source-pair.mjs',
    'scripts/fixtures/inkwave-31pr-paint-source-pair.json.gz',
    'inkwave-public/src/world/level.js', 'inkwave-public/src/net/netmatch.js', ownTest,
  ]},
  {workflow:'inkwave-swim-film.yml', events:['pull_request'], inputs:[
    'patches/local-quality/adapter.mjs', 'inkwave-public/src/game/actor.js',
    'inkwave-public/src/game/character.js', 'patches/splatoon3/runtime/swim-stealth.mjs', ownTest,
  ]},
  {workflow:'inkwave-ink-micro-surface.yml', events:['pull_request'], inputs:[
    'patches/local-quality/adapter.mjs', ownTest,
  ]},
  {workflow:'inkwave-touch-frame-pacing.yml', events:['pull_request'], inputs:[
    'inkwave-public/src/main.js', 'scripts/inkwave-source-composition.mjs',
    'patches/splatoon3/adapter.mjs', 'scripts/inkwave-range-profile-acceptance.mjs', ownTest,
  ]},
];
test('ink-volume source-only diffs match narrow glob routes and every removed owner is detected', () => {
  const parsed = parseValidateWorkflow(read('.github/workflows/inkwave-ink-volumes.yml'));
  const routes = (parsed.on || parsed.true).pull_request.paths;
  // Use the native glob engine for the exact paths and *, ** syntax present
  // in this workflow, then apply ordered positive/negative path-list rules.
  // This is a local route contract, not a claim that a hosted run was started.
  const admits = (files, patterns = routes) => files.some(file => {
    let matched = false;
    for (const pattern of patterns) {
      const negative = pattern.startsWith('!');
      if (path.matchesGlob(file, negative ? pattern.slice(1) : pattern)) matched = !negative;
    }
    return matched;
  });
  for (const file of inkVolumeInputs) {
    assert.equal(admits([file]), true, `source-only change: ${file}`);
    assert.equal(admits([file], routes.filter(pattern => pattern !== file)), false,
      `a missing owner route must not be hidden by a broad pattern: ${file}`);
  }
  for (const file of [
    'patches/local-quality/ink-volume-adapter.mjs',
    'scripts/build-inkwave.mjs',
    '.github/workflows/inkwave-ink-volumes.yml',
    'scripts/check-inkwave-volumes.mjs',
    'patches/local-quality/ink-volume/pack.mjs',
  ]) assert.equal(admits([file]), true, `existing positive: ${file}`);
  for (const file of [
    'docs/unrelated-guide.md', 'README.md', 'inkwave-public/src/ui/hud.js',
    'inkwave-public/src/fx/unrelated.js', 'inkwave-public/src/main.js.map',
  ]) assert.equal(admits([file]), false, `unrelated source: ${file}`);
  assert.equal(admits(['docs/unrelated-guide.md', inkVolumeInputs[0]]), true);
  assert.equal(admits(['docs/unrelated-guide.md', 'inkwave-public/src/ui/hud.js']), false);
  assert.equal(parsed.jobs.volume['timeout-minutes'], 30);
  assert.equal(parsed.permissions.contents, 'read');
});

test('ink-volume actual sparse checkout retains all three production adapter entrypoints', () => {
  const parsed = parseValidateWorkflow(read('.github/workflows/inkwave-ink-volumes.yml'));
  const checkout = parsed.jobs.volume.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.event.pull_request.head.sha || github.sha }}');
  assert.equal(checkout.with['sparse-checkout-cone-mode'], false);
  const kept = [...inkVolumeInputs, 'patches/local-quality/ink-volume-adapter.mjs',
    'reports/ink-volume/source/rollerink1.vtf'];
  const removed = ['tools/inkwave-modeler/blender/large.blend', 'tools/inkwave-modeler/docs/reference.png'];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'iw-volume-inputs-'));
  const git = args => execFileSync('git', args, {cwd:temporary, stdio:['pipe','pipe','pipe']});
  try {
    git(['init', '-b', 'fixture']);
    for (const file of [...kept, ...removed]) {
      fs.mkdirSync(path.dirname(path.join(temporary, file)), {recursive:true});
      fs.writeFileSync(path.join(temporary, file), file);
    }
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'ink-volume inputs']);
    execFileSync('git', ['sparse-checkout', 'set', '--no-cone', '--stdin'], {
      cwd:temporary, input:checkout.with['sparse-checkout'], stdio:['pipe','pipe','pipe'],
    });
    for (const file of kept) assert.ok(fs.existsSync(path.join(temporary, file)), `required input: ${file}`);
    for (const file of removed) assert.equal(fs.existsSync(path.join(temporary, file)), false, `existing exclusion: ${file}`);
  } finally {
    fs.rmSync(temporary, {recursive:true, force:true});
  }
});
function validateRoutes(workflow, contract) {
  const events = workflow.on || workflow.true;
  for (const event of contract.events) {
    const patterns = events[event]?.paths;
    assert.ok(Array.isArray(patterns), `${contract.workflow}/${event} has bounded routes`);
    for (const file of contract.inputs)
      assert.equal(patterns.filter(pattern => pattern === file).length, 1, `${contract.workflow}/${event}: ${file}`);
    for (const unrelated of ['**', 'inkwave-public/**', 'inkwave-public/src/**', '*.js', 'docs/**', 'README.md'])
      assert.equal(patterns.includes(unrelated), false, `${contract.workflow}: no broad route ${unrelated}`);
  }
  if (contract.events.length === 1) assert.equal(events.push, undefined, 'PR-only lane stays PR-only');
  else assert.deepEqual(events.push.paths, events.pull_request.paths, 'push and PR cover the same direct inputs');
  assert.equal(workflow.permissions.contents, 'read');
}
for (const contract of contracts) test(`${contract.workflow} admits every single-input change and rejects missing routes`, () => {
  const parsed = parseValidateWorkflow(read('.github/workflows/' + contract.workflow));
  validateRoutes(parsed, contract);
  for (const event of contract.events) for (const input of contract.inputs) {
    assert.ok(fs.existsSync(new URL(input, root)), `tracked direct input exists: ${input}`);
    const faulty = structuredClone(parsed), events = faulty.on || faulty.true;
    events[event].paths = events[event].paths.filter(pattern => pattern !== input);
    assert.throws(() => validateRoutes(faulty, contract), undefined, `${event} without ${input} must fail`);
  }
  if (contract.workflow === 'inkwave-composed-cpu.yml') {
    assert.equal(parsed.jobs['source-and-emitted'].if, 'github.event.pull_request.draft == false');
    assert.match(read('scripts/lib/inkwave-sandbox-browser.mjs'), /chromiumSandbox:\s*true/);
  }
});

test('Non-Drive sparse checkout retains source dependencies and original volume inputs while excluding historical reports', () => {
  const parsed = parseValidateWorkflow(read('.github/workflows/inkwave-nondrive-queue.yml'));
  const job = parsed.jobs['nondrive-regression'];
  const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.filter, 'blob:none');
  assert.equal(checkout.with['sparse-checkout-cone-mode'], false);
  const syntax = job.steps.find(step => step.name === 'Syntax check changed hotpaths').run;
  const inputs = [...syntax.matchAll(/^\s+((?:inkwave-public|patches)\/[^\s]+\.(?:js|mjs))\s*\\?$/gm)].map(match => match[1]);
  assert.equal(inputs.length, 19, 'all pre-existing syntax inputs remain selected');
  const kept = [...inputs, 'scripts/tests/inkwave-queue-native-compact.test.mjs',
    'patches/native-stages/runtime/source-catalog.mjs', 'patches/native-stages/runtime/source-placement.mjs',
    'reports/ink-volume/source/original.vtf'];
  const removed = ['reports/old-proof.json', 'reports/archive/history.png', 'reports/ink-volume/result.json',
    'tools/inkwave-modeler/blender/large.blend', 'tools/inkwave-modeler/docs/reference.png'];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'iw-nondrive-sparse-'));
  const git = args => execFileSync('git', args, {cwd:temporary, stdio:['pipe','pipe','pipe']});
  try {
    git(['init', '-b', 'fixture']);
    for (const file of [...kept,...removed]) {
      fs.mkdirSync(path.dirname(path.join(temporary,file)), {recursive:true});
      fs.writeFileSync(path.join(temporary,file), file);
    }
    git(['add','.']);
    git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','source inputs']);
    execFileSync('git', ['sparse-checkout','set','--no-cone','--stdin'], {
      cwd:temporary, input:checkout.with['sparse-checkout'], stdio:['pipe','pipe','pipe'],
    });
    for (const file of kept) assert.ok(fs.existsSync(path.join(temporary,file)), `required input: ${file}`);
    for (const file of removed) assert.equal(fs.existsSync(path.join(temporary,file)), false, `excluded input: ${file}`);
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
  assert.equal(job.steps.find(step => step.name === 'Compare native parser byte equivalence and malformed-input safety').run,
    'node --test scripts/tests/inkwave-queue-native-compact.test.mjs');
});

test('CI route contract is registered in the mandatory runner suite', () => {
  const suites = JSON.parse(read('scripts/ci/inkwave-test-suites.json'));
  assert.equal(suites['runner-contracts'].steps.flatMap(step => step.args).filter(value => value === ownTest).length, 1);
});

test('source/build sparse lanes keep the global JavaScript inventory and every calibration original', () => {
  const cases = [
    ['inkwave-reopened-six.yml','reopened-six'],
    ['inkwave-runtime-frame-parity.yml','frame-parity'],
    ['inkwave-small-tank.yml','browser'],
    ...['contracts','placement-worker','source-geometry'].map(job => ['validate-inkwave-native-stage5.yml',job]),
  ];
  for (const [workflow, jobName] of cases) {
    const parsed = parseValidateWorkflow(read('.github/workflows/' + workflow));
    const job = parsed.jobs[jobName];
    const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.filter, 'blob:none');
    assert.equal(checkout.with['sparse-checkout-cone-mode'], false);
    assert.equal(checkout.with.ref, '${{ github.event.pull_request.head.sha || github.sha }}');
    const patterns = checkout.with['sparse-checkout'].trim().split('\n');
    for (const required of ['/*','!/reports/*','/reports/ink-volume/','!/reports/ink-volume/*',
      '/reports/ink-volume/source/','*.js','*.mjs','*.cjs']) assert.ok(patterns.includes(required), `${workflow}/${jobName}: ${required}`);
    assert.equal(job['continue-on-error'], undefined);
  }
});

test('native browser lanes install the default headless browser used by their unchanged harnesses', () => {
  const native = parseValidateWorkflow(read('.github/workflows/validate-inkwave-native-stage5.yml'));
  for (const jobName of ['placement-worker','source-geometry']) {
    const steps = native.jobs[jobName].steps;
    assert.equal(steps.filter(step => step.run === 'npx playwright install --with-deps --only-shell chromium').length, 1);
    assert.equal(steps.some(step => step.run === 'npx playwright install --with-deps chromium'), false);
    assert.ok(steps.some(step => step.run?.includes('scripts/check-inkwave-terrain-browser.mjs')));
  }
  for (const file of ['scripts/check-inkwave-source-placement-browser.mjs','scripts/check-inkwave-terrain-browser.mjs']) {
    const source = read(file);
    assert.match(source, /chromium\.launch\(\{[^\n]*headless:true/);
    assert.doesNotMatch(source, /channel:\s*['"](?:chrome|chromium)/);
  }
});

test('manual waveform research retains the tool and complete reference audio directory only', () => {
  const parsed = parseValidateWorkflow(read('.github/workflows/inkwave-charger-video-waveform.yml'));
  const events = parsed.on || parsed.true;
  assert.deepEqual(Object.keys(events), ['workflow_dispatch']);
  const checkout = parsed.jobs.capture.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.filter, 'blob:none');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.deepEqual(checkout.with['sparse-checkout'].trim().split('\n'), [
    'tools/audio','patches/splatoon3/runtime/audio/s3-real',
  ]);
  const source = read('.github/workflows/inkwave-charger-video-waveform.yml');
  const loop = source.match(/for name in (Wp_[^;]+); do/);
  assert.ok(loop, 'explicit original reference list');
  const references = loop[1].trim().split(/\s+/).map(name => `patches/splatoon3/runtime/audio/s3-real/${name}.mp3`);
  assert.equal(new Set(references).size, 5, 'all five original MP3 reference inputs remain');
  for (const file of references) assert.ok(fs.existsSync(new URL(file, root)), file);
});
