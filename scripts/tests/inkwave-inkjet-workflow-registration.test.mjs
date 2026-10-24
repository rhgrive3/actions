import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = fs.readFileSync(path.join(root, '.github/workflows/inkwave-specials-1130.yml'), 'utf8');
const owner = 'patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs';
const checker = 'scripts/check-inkwave-inkjet-presentation-browser.mjs';
const contract = 'scripts/tests/inkwave-inkjet-workflow-registration.test.mjs';
const triggers = [owner, checker, contract, 'patches/splatoon3/tests/source-fixture.mjs'];
const names = {
  qa: 'Verify Inkjet nozzle CI registration',
  source: 'Reviewed Inkjet nozzle owner source regressions',
  emitted: 'Reviewed Inkjet nozzle owner emitted-site regressions',
  browser: 'Inspect rendered Inkjet nozzle attachment and lifecycle',
};
const scripts = {
  qa: 'node --test ' + contract,
  source: 'node --experimental-vm-modules --test --test-concurrency=1 ' + owner,
  emitted: 'INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test --test-concurrency=1 ' + owner,
  browser: `set -euo pipefail
browser_executable="$(node --input-type=module -e 'import {chromium} from "playwright"; process.stdout.write(chromium.executablePath())')"
node ${checker} --site _site --browser-executable "$browser_executable" --evidence-dir .ci-scratch/splashdown-browser/inkjet-nozzles`,
};

function step(text, name) {
  const marker = '      - name: ' + name + '\n';
  assert.equal(text.split(marker).length, 2, name + ' exactly once');
  return text.split(marker)[1].split(/\n      - /)[0].trimEnd();
}
function script(text, name) {
  const body = step(text, name);
  if (body.startsWith('        run: |\n')) {
    return body.slice('        run: |\n'.length).split('\n').map(line => {
      assert.ok(line.startsWith('          '), 'literal shell indentation');
      return line.slice(10);
    }).join('\n');
  }
  assert.ok(body.startsWith('        run: '), 'unconditional executable step');
  assert.equal(body.split('\n').length, 1, 'no continue-on-error or conditional fields');
  return body.slice('        run: '.length);
}
function job(text, name) {
  const marker = '  ' + name + ':\n';
  assert.equal(text.split(marker).length, 2, name + ' job once');
  return text.split(marker)[1].split(/\n  [a-z][a-z0-9-]*:\n/)[0];
}
function verify(text) {
  for (const input of triggers) {
    assert.equal(text.split("      - '" + input + "'\n").length, 2, input + ' explicit trigger');
    assert.ok(fs.existsSync(path.join(root, input)), input + ' sparse input exists');
  }
  for (const [key, name] of Object.entries(names)) assert.equal(script(text, name), scripts[key], key + ' exact fail-closed command');
  const source = job(text, 'special-fidelity'), built = job(text, 'catalogue-browser');
  for (const name of [names.qa, names.source]) assert.ok(source.includes('      - name: ' + name + '\n'));
  for (const name of [names.emitted, names.browser]) assert.ok(built.includes('      - name: ' + name + '\n'));
  for (const body of [source, built]) {
    for (const directory of ['inkwave-public', 'patches', 'scripts']) assert.ok(body.includes('            ' + directory + '\n'), directory + ' sparse directory');
    assert.ok(body.includes('node-version: 22'));
    assert.ok(body.includes('test "$actual_source_sha" = "$EXPECTED_SOURCE_SHA"'), 'immutable checkout gate');
  }
  assert.ok(source.includes('            .github/workflows\n'), 'registration contract workflow sparse input');
  assert.ok(!/\bcontinue-on-error\s*:/.test(source + built), 'CI must not mask a checked command or job failure');
  const build = built.indexOf('      - name: Build actual production composition\n');
  assert.ok(build >= 0);
  for (const name of [names.emitted, names.browser]) assert.ok(built.indexOf('      - name: ' + name + '\n') > build, 'build precedes ' + name);
  assert.ok(built.includes('playwright@1.62.1'));
  assert.ok(built.includes('npx playwright install --with-deps chromium'));
  assert.ok(built.includes('if: always()\n        with:\n          name: inkwave-catalogue-splashdown-lifecycle\n          path: .ci-scratch/splashdown-browser/\n          if-no-files-found: error'), 'failure evidence is uploaded');
}

test('Inkjet owner source/emitted and rendered-nozzle browser routes are explicitly registered', () => verify(workflow));

test('missing route, trigger, built-site selection, browser resolver, VM/serial flag or sparse input rejects', () => {
  const mutations = [
    ...triggers.map(input => text => text.replace("      - '" + input + "'\n", '')),
    ...Object.values(names).map(name => text => text.replace('      - name: ' + name + '\n', '')),
    text => text.replace(scripts.source, scripts.source.replace('--experimental-vm-modules ', '')),
    text => text.replace(scripts.emitted, scripts.emitted.replace('INKWAVE_BUILT_SITE=_site ', '')),
    text => text.replace(scripts.emitted, scripts.emitted.replace('--test-concurrency=1', '--test-concurrency=2')),
    text => text.replace('--browser-executable "$browser_executable"', ''),
    text => text.replace('--site _site --browser-executable', '--site wrong-site --browser-executable'),
    text => text.replace('chromium.executablePath()', '"/usr/bin/chromium"'),
    text => text.replace('set -euo pipefail', 'set +e'),
    text => text.replace(scripts.source, scripts.source + ' || true'),
    text => text.replace('        run: ' + scripts.emitted, '        continue-on-error: true\n        run: ' + scripts.emitted),
    text => text.replace('      - name: Build actual production composition\n', ''),
    text => text.replace('  catalogue-browser:\n', '  catalogue-browser:\n    continue-on-error: true\n'),
    text => text.replace('playwright@1.62.1', 'playwright@latest'),
    text => text.replace('npx playwright install --with-deps chromium', ''),
    text => text.replace('          path: .ci-scratch/splashdown-browser/', '          path: unrelated/'),
    ...['.github/workflows', 'inkwave-public', 'patches', 'scripts'].map(directory => text => text.replaceAll('            ' + directory + '\n', '')),
  ];
  for (const mutate of mutations) {
    const changed = mutate(workflow); assert.notEqual(changed, workflow, 'mutation applied');
    assert.throws(() => verify(changed));
  }
});

// Execute the exact workflow shells against a recording node binary. These are
// routing/failure-propagation tests, not source, emitted-runtime, or GPU proofs.
function shellRoute(key, failure = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkjet-ci-route-'));
  try {
    const node = path.join(dir, 'node'), log = path.join(dir, 'calls.log');
    fs.writeFileSync(node, `#!/bin/sh
printf 'SITE=%s\\t%s\\n' "\${INKWAVE_BUILT_SITE-}" "$*" >> "$INKJET_ROUTE_LOG"
if [ "$1" = "--input-type=module" ]; then
  printf '%s' '/fixture/playwright/installed-chromium'
  exit "\${INKJET_RESOLVER_EXIT:-0}"
fi
case "$*" in
  *inkjet-nozzle-owner.test.mjs*) exit "\${INKJET_OWNER_EXIT:-0}" ;;
  *check-inkwave-inkjet-presentation-browser.mjs*) exit "\${INKJET_BROWSER_EXIT:-0}" ;;
esac
exit 0
`, {mode: 0o755});
    const env = {...process.env, PATH: dir + path.delimiter + process.env.PATH, INKJET_ROUTE_LOG: log, ...failure};
    delete env.INKWAVE_BUILT_SITE;
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script(workflow, names[key])], {cwd: root, env, encoding: 'utf8', timeout: 10000});
    assert.ifError(result.error);
    return {status: result.status, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [], stderr: result.stderr};
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
}

test('actual workflow shells select source, mandatory emitted site, installed browser and captured artifacts', () => {
  const source = shellRoute('source'); assert.equal(source.status, 0); assert.equal(source.calls.length, 1); assert.ok(source.calls[0].startsWith('SITE=\t'));
  const emitted = shellRoute('emitted'); assert.equal(emitted.status, 0); assert.equal(emitted.calls.length, 1); assert.ok(emitted.calls[0].startsWith('SITE=_site\t'));
  const browser = shellRoute('browser'); assert.equal(browser.status, 0); assert.equal(browser.calls.length, 2);
  assert.ok(browser.calls[1].includes('--browser-executable /fixture/playwright/installed-chromium'));
  assert.ok(browser.calls[1].endsWith('--evidence-dir .ci-scratch/splashdown-browser/inkjet-nozzles'));
});

test('source, emitted, browser and browser-discovery failures preserve nonzero status', () => {
  assert.equal(shellRoute('source', {INKJET_OWNER_EXIT: '23'}).status, 23);
  assert.equal(shellRoute('emitted', {INKJET_OWNER_EXIT: '29'}).status, 29);
  assert.equal(shellRoute('browser', {INKJET_BROWSER_EXIT: '31'}).status, 31);
  const discovery = shellRoute('browser', {INKJET_RESOLVER_EXIT: '37'});
  assert.equal(discovery.status, 37); assert.equal(discovery.calls.length, 1, 'failed browser discovery cannot fall through');
});

// Exercise the unmodified checker itself with a synthetic Playwright protocol.
// No real browser launches and page.evaluate's native simulation is not run.
// This proves its existing assertion/cleanup failures reach the process status.
test('unmodified browser checker propagates attachment, director, page and launch failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkjet-checker-status-'));
  try {
    const site = path.join(dir, 'site'); fs.mkdirSync(site);
    const contentHash = createHash('sha256').update('{}').digest('hex');
    fs.writeFileSync(path.join(site, 'inkwave-build.json'), JSON.stringify({artifacts: {}, contentHash, build: {revision: 'protocol-fixture'}}));
    const loader = path.join(dir, 'loader.mjs');
    fs.writeFileSync(loader, `export async function resolve(specifier,context,nextResolve){if(specifier==='playwright')return{url:new URL('./playwright.mjs',import.meta.url).href,shortCircuit:true};return nextResolve(specifier,context);}`);
    fs.writeFileSync(path.join(dir, 'playwright.mjs'), `
const mode=process.env.INKJET_CHECKER_FAILURE;
export const chromium={launch:async()=>{
 if(mode==='launch')throw Error('forced protocol launch failure');
 return {version:()=> 'synthetic protocol only',close:async()=>{},newPage:async()=>({
  on:(event,fn)=>{if(event==='pageerror'&&mode==='page')fn(Error('forced protocol page failure'));},
  exposeFunction:async()=>{},goto:async()=>{},evaluate:async()=>({cases:[],events:[],shots:[],failures:mode==='attachment'?[{label:'forced nozzle attachment failure'}]:[],directorErrors:mode==='director'?1:0}),
 })};
}};
`);
    for (const mode of ['none', 'attachment', 'director', 'page', 'launch']) {
      const out = path.join(dir, mode);
      const result = spawnSync(process.execPath, ['--experimental-loader', loader, path.join(root, checker), '--site', site, '--browser-executable', '/fixture/installed-chromium', '--evidence-dir', out], {env: {...process.env, INKJET_CHECKER_FAILURE: mode}, encoding: 'utf8', timeout: 10000});
      assert.ifError(result.error);
      assert.equal(result.status, mode === 'none' ? 0 : 1, mode + ' process status');
      if (mode !== 'launch') {
        const saved = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
        assert.equal(saved.contentHash, contentHash); assert.equal(saved.browser, 'synthetic protocol only');
      }
    }
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});
