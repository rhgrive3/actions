import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { confirmResponsiveMockHostTeams } from '../inkwave-responsive-fixture.mjs';
import { checkCoreMenus } from '../check-inkwave-responsive-core.mjs';

test('responsive menu fixture installs the published runtime before constructing native Menus', () => {
  // Fixture-generation contract only; real DOM/storage remains a browser gate.
  const source = fs.readFileSync(new URL('../check-inkwave-responsive.mjs', import.meta.url), 'utf8');
  const installer = source.match(/const runtimeInstaller = patchStyles \? `([\s\S]*?)` : '';/)?.[1];
  const module = source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(installer && module, 'published-runtime fixture fragments must exist');
  assert.match(installer, /import \{ install \} from '\/patches\/splatoon3\/runtime\/install\.mjs'/);
  const composed = module.replace('${runtimeInstaller}', installer);
  assert.ok(composed.indexOf('install(tuning);') < composed.indexOf('new Menus('));
  assert.match(source, /type="importmap"/);
  assert.match(source, /\.\.\.runtimeFiles/);
  assert.match(source, /Missing installed UI input/);
  const parsed = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: composed, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const core = fs.readFileSync(new URL('../check-inkwave-responsive-core.mjs', import.meta.url), 'utf8');
  const cleanup = core.slice(core.indexOf("selectOption('none')"), core.indexOf("const card = page.locator('.iw-loadout .iw-wcard')"));
  assert.match(cleanup, /await tap\(page, '\.s3-gear summary'\)/);
  assert.match(cleanup, /gear panel closes before returning to weapon selection/);
  assert.doesNotMatch(cleanup, /force\s*:\s*true/);
});

test('responsive host confirmation is explicit, recorded, and confined to the offline guest fixture', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-responsive.mjs', import.meta.url), 'utf8');
  assert.match(source, /files\?\.\['patch\/lobby-host-team-adapter\.mjs'\]/);
  assert.match(source, /hostTeamAdapterPresent && await page\.evaluate\(\(\) => typeof G\.net\.confirmTeams === 'function'\)/);
  assert.match(source, /entry\.hostTeamConfirmationSupported = hostTeamConfirmation/);
  const block = source.slice(source.indexOf('        if (hostTeamConfirmation) {'), source.indexOf("        await page.evaluate(() => G.net.leave());", source.indexOf('        if (hostTeamConfirmation) {')));
  assert.ok(block.indexOf('guest Ready stays blocked') < block.indexOf('page.evaluate(confirmResponsiveMockHostTeams)'));
  assert.ok(block.indexOf('page.evaluate(confirmResponsiveMockHostTeams)') < block.indexOf('page.waitForFunction'));
  assert.match(source, /'inkwave-responsive-fixture\.mjs'\].map/);
  for (const fields of [{isMock:false}, {isHost:true}, {state:'offline'}, {lobby:{mode:'boss',players:[]}}]) {
    const net = {isMock:true,isHost:false,state:'lobby',lobby:{players:[{team:0,ready:false}]}, ...fields};
    assert.throws(() => confirmResponsiveMockHostTeams(net), /Expected a guest MockNet/);
    assert.equal(net.lobby.teamsConfirmed, undefined);
  }
});

// Exercise the real capture callback with an outgoing screen retained after
// its animation. The production menu removes that owner on a later timer.
async function panelCapture({ overflow = false, neverRetire = false } = {}) {
  const savedDocument = globalThis.document, savedWidth = globalThis.innerWidth;
  let leaving = true;
  const events = [], next = new Error('next screen');
  globalThis.innerWidth = 390;
  globalThis.document = { querySelector: () => leaving ? {} : null };
  const rect = (left, right) => ({ getBoundingClientRect: () => ({ left, right }) });
  const page = {
    evaluate: async () => {},
    waitForFunction: async predicate => {
      events.push('retirement');
      assert.equal(predicate(), false, 'the outgoing owner is initially present');
      if (neverRetire) throw new Error('outgoing screen did not retire');
      leaving = false;
      assert.equal(predicate(), true, 'the owner has now been removed');
    },
    locator: () => ({ evaluateAll: async predicate => {
      events.push('bounds');
      return predicate([...(leaving ? [rect(-32, 358)] : []), rect(overflow ? -1.01 : 0, 390)]);
    } }),
    screenshot: async () => events.push('screenshot'),
  };
  let error;
  try {
    await checkCoreMenus({ page, entry: { name: 'phone-portrait', screens: {} },
      engineName: 'webkit', evidence: '/unused', config: { viewport: { width: 390, height: 844 } },
      show: async (_page, name) => { if (name !== 'loading') throw next; },
      settle: async () => {}, geometry: async () => [], tap: async () => {},
      audit: false, testContinuation: false });
  } catch (caught) { error = caught; }
  finally {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedWidth === undefined) delete globalThis.innerWidth; else globalThis.innerWidth = savedWidth;
  }
  return { error, next, events };
}

test('responsive capture waits for outgoing DOM retirement before measuring all content panels', async () => {
  const result = await panelCapture();
  assert.equal(result.error, result.next);
  assert.deepEqual(result.events, ['retirement', 'bounds', 'screenshot']);
});

test('responsive capture still rejects a current panel outside the unchanged one-pixel boundary', async () => {
  const result = await panelCapture({ overflow: true });
  assert.match(result.error?.message || '', /content panels must fit the viewport/);
  assert.deepEqual(result.events, ['retirement', 'bounds']);
});

test('responsive capture fails when the outgoing owner never retires', async () => {
  const result = await panelCapture({ neverRetire: true });
  assert.equal(result.error?.message, 'outgoing screen did not retire');
  assert.deepEqual(result.events, ['retirement']);
});
