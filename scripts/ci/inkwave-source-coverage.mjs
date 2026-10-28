import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {discoverSourceTestFiles, BROWSER_SOURCE_TESTS} from '../lib/inkwave-test-shards.mjs';
import {planTestSuite, expandTestSuiteSteps} from './run-inkwave-test-suite.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SOURCE_SUITES = {
  network: {directory: 'patches/network-replication/tests'},
  quality: {directory: 'patches/local-quality/tests'},
};

export function planSourceTests(suite, root = ROOT) {
  if (!Object.hasOwn(SOURCE_SUITES, suite)) throw Error('Unknown source suite: ' + suite);
  const directory = SOURCE_SUITES[suite].directory;
  const all = fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.test.mjs')).sort().map(file => directory + '/' + file);
  const commands = planTestSuite('source-' + suite, {root});
  if (commands.length !== 1 || commands[0].program !== 'node'
      || commands[0].args.slice(0, 3).join(' ') !== '--experimental-vm-modules --test --test-concurrency=2')
    throw Error('Source tests require the full canonical Node test command');
  const tests = commands[0].args.slice(3);
  if (!all.length || all.some(file => !tests.includes(file)) || tests.some(file => !file.endsWith('.test.mjs')))
    throw Error('Incomplete source test coverage: ' + suite);
  return {all, tests};
}

// Source files run once in their owning suite. Emitted environments, pinned
// references and browser checks are different workloads and remain independent.
export function assertSourceSuiteCoverage(workflow, suite, root = ROOT) {
  const config = SOURCE_SUITES[suite];
  if (!config) throw Error('Unknown source suite: ' + suite);
  const core = workflow.match(/^  validate_core:\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/m)?.[1];
  if (!core) throw Error('Missing validate_core job');
  const patch = workflow.match(/^  patch_tests:\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/m)?.[1];
  const command = '        run: node --experimental-vm-modules scripts/check-inkwave-patches.mjs\n';
  const patchSteps = patch?.split(/^      - /m).slice(1) || [];
  const owners = patchSteps.filter(step => step.includes(command));
  if (owners.length !== 1 || /^        (?:if|env|continue-on-error):/m.test(owners[0])
      || !patch.includes("INKWAVE_TEST_SHARD_COUNT: '8'") || !patch.includes("INKWAVE_TEST_CONCURRENCY: '2'")
      || !workflow.includes('needs: [build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]'))
    throw Error('Missing mandatory complete CPU source shards');
  const browserRun = '        run: node scripts/ci/run-inkwave-test-suite.mjs source-browser\n';
  const browserOwners = core.split(/^      - /m).filter(step => step.startsWith('name: Verify browser-backed source regressions\n'));
  if (browserOwners.length !== 1 || !(browserOwners[0].includes(browserRun) || browserOwners[0].includes(expandTestSuiteSteps(browserRun)))
      || /^        (?:if|continue-on-error):/m.test(browserOwners[0])
      || !browserOwners[0].includes("        env:\n          INKWAVE_REQUIRE_BROWSER_TESTS: '1'\n")
      || /          INKWAVE_(?:BUILT|CONTROLS|IDLE)_SITE:/.test(browserOwners[0]))
    throw Error('Missing mandatory browser-backed source tests');
  for (const step of core.split(/^      - /m)) {
    if (step === browserOwners[0] || /^        env:/m.test(step)) continue;
    if (step.includes('run-inkwave-test-suite.mjs source-' + suite)) throw Error('Duplicate source suite in core');
    for (const line of step.matchAll(/^\s*(?:run:\s*)?node [^\n]+$/gm))
      if (line[0].includes(config.directory + '/') && line[0].includes('.test.mjs'))
        throw Error('Duplicate source test outside its owning suite: ' + suite);
  }
  const cpu = discoverSourceTestFiles(root);
  const browser = planTestSuite('source-browser', {root})[0].args.filter(file => file.endsWith('.test.mjs'));
  if (JSON.stringify([...browser].sort()) !== JSON.stringify([...BROWSER_SOURCE_TESTS].sort()))
    throw Error('Browser source inventory differs from its owner');
  const plan = planSourceTests(suite, root);
  for (const file of plan.tests)
    if ([...cpu, ...browser].filter(candidate => candidate === file).length !== 1)
      throw Error('Missing or duplicated source coverage: ' + file);
  return plan;
}
