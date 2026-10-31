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

// Scalar routing contracts only. Real visibility, viewport geometry and trusted
// title gestures remain mandatory in the existing Chromium/WebKit matrix.
const nativeTitleControl = '.iw-title.iw-launch button.iw-launch__start[data-title-start="1"]';
async function titleCapture({ published = true, count = 1, tag = 'BUTTON', disabled = false,
  geometryError = null, tapError = null, noTransition = false, audit = false, testTitleStart = !audit } = {}) {
  const savedDocument = globalThis.document, savedMenus = globalThis.menus;
  const events = [], next = new Error('next screen'), state = { current: null, setLoading() {} };
  globalThis.document = { querySelector: () => null }; globalThis.menus = state;
  const expected = published ? nativeTitleControl : '.iw-title__press';
  const page = {
    evaluate: async fn => fn(),
    waitForFunction: async fn => { assert.equal(fn(), true, 'unchanged title transition or screen retirement must complete'); events.push('wait:' + state.current); },
    locator: selector => ({
      count: async () => { events.push('count:' + selector); return selector === expected ? count : 0; },
      evaluate: async fn => fn({ tagName: tag, type: 'button', disabled }),
      evaluateAll: async fn => fn([]),
    }),
    screenshot: async () => events.push('screenshot:' + state.current),
  };
  let error;
  try {
    await checkCoreMenus({ page, entry: { name: 'phone-portrait', screens: {} }, engineName: 'chromium',
      evidence: '/unused', config: { viewport: { width: 390, height: 844 } },
      titlePresentationInstalled: published,
      show: async (_page, name) => { events.push('show:' + name); if (name === 'main') throw next; state.current = name; },
      settle: async () => {}, geometry: async (_page, selector, name) => {
        events.push('geometry:' + name + ':' + selector); assert.equal(selector, expected, 'measure the actual title control, never a fallback alias');
        if (geometryError) throw geometryError; return [];
      },
      tap: async (_page, selector) => {
        events.push('tap:' + selector); assert.equal(selector, published ? nativeTitleControl : '.iw-title__presstext');
        if (tapError) throw tapError; if (!noTransition) state.current = 'main';
      }, audit, testTitleStart, testContinuation: false });
  } catch (caught) { error = caught; }
  finally {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedMenus === undefined) delete globalThis.menus; else globalThis.menus = savedMenus;
  }
  return { error, next, events };
}

test('responsive title selection is bound to the installed production owner and preserves raw/baseline routes', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-responsive.mjs', import.meta.url), 'utf8');
  const expression = source.match(/^const titlePresentationInstalled = (.+);$/m)?.[1]; assert.ok(expression);
  const select = (manifest, baseline = null, exists = true) => new Function('baseline', 'fs', 'manifestPath', 'return ' + expression)(baseline,
    { existsSync: () => exists, readFileSync: () => JSON.stringify(manifest) }, '/site/inkwave-build.json');
  const current = { build: { quality: { 'title-presentation-adapter.mjs': 'a'.repeat(64) } } };
  assert.equal(select(current), true);
  assert.equal(select(current, '/frozen-raw-baseline'), false);
  assert.equal(select(current, null, false), false);
  assert.equal(select({ build: { quality: {} } }), false);
  assert.equal(select({}), false);
  assert.equal(source.match(/checkCoreMenus\(\{ touchCameraReset, titlePresentationInstalled, page/g)?.length, 2, 'both desktop and touch callers carry the same owner decision');
  assert.match(source, /result\.titlePresentationInstalled = titlePresentationInstalled/);
  assert.match(source, /audit: true, testTitleStart: !audit, testContinuation: !audit/, 'normal desktop click is required without making explicit audit mode interactive');
});

test('responsive current title measures its native button and retains the real tap then main-transition contract', async () => {
  const r = await titleCapture(); assert.equal(r.error, r.next);
  const count = r.events.indexOf('count:' + nativeTitleControl), geometry = r.events.indexOf('geometry:title:' + nativeTitleControl);
  const tap = r.events.indexOf('tap:' + nativeTitleControl), transition = r.events.indexOf('wait:main');
  assert(count >= 0 && count < geometry && geometry < tap && tap < transition);
  assert.equal(r.events.filter(e => e.startsWith('tap:')).length, 1);
});

test('responsive raw and explicitly frozen baseline titles retain the original press and text-input selectors', async () => {
  const r = await titleCapture({ published: false }); assert.equal(r.error, r.next);
  assert(r.events.includes('geometry:title:.iw-title__press'));
  assert(r.events.includes('tap:.iw-title__presstext'));
  assert.equal(r.events.some(e => e.includes('iw-launch')), false);
});

test('responsive published title rejects missing, duplicated, nonbutton or disabled controls before tapping', async () => {
  for (const options of [{ count: 0 }, { count: 2 }, { tag: 'SPAN' }, { disabled: true }]) {
    const r = await titleCapture(options); assert.notEqual(r.error, r.next); assert(r.error instanceof assert.AssertionError);
    assert.equal(r.events.some(e => e.startsWith('tap:')), false);
  }
});

test('responsive title preserves geometry/action error identity and does not accept a missing main transition', async () => {
  for (const kind of ['geometryError', 'tapError']) {
    const failure = new Error(kind), r = await titleCapture({ [kind]: failure }); assert.equal(r.error, failure);
    assert.equal(r.events.includes('wait:main'), false);
  }
  const r = await titleCapture({ noTransition: true }); assert.notEqual(r.error, r.next);
  assert.match(r.error.message, /title transition or screen retirement must complete/);
});

test('responsive explicit audit remains observational while ordinary desktop requires its real title click', async () => {
  const r = await titleCapture({ audit: true }); assert.equal(r.error, r.next);
  assert(r.events.includes('geometry:title:' + nativeTitleControl));
  assert.equal(r.events.some(e => e.startsWith('tap:')), false);
  const desktop = await titleCapture({ audit: true, testTitleStart: true });
  assert.equal(desktop.error, desktop.next);
  assert(desktop.events.includes('tap:' + nativeTitleControl));
  assert(desktop.events.includes('wait:main'));
});
