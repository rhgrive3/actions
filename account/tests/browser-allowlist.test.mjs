import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInkwaveBrowser, inkwaveBrowserPermitted,
  inkwaveBrowserGuardScript
} from '../../scripts/lib/inkwave-browser-policy.mjs';
import { protectGameHtml } from '../../scripts/lib/inkwave-client-csp.mjs';
import { serveGameWithBotGate } from '../worker/bot-gate.js';

const ua = {
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/132.0.0.0 Mobile/15E148 Safari/604.1',
  ipadChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/132.0.0.0 Version/11.1.1 Safari/605.1.15',
  pwaAndroid: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
  pwaIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  pwaIpad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0',
  edgeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 EdgiOS/132.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36 OPR/100.0',
  samsung: 'Mozilla/5.0 (Linux; Android 16; SM-X700) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36 SamsungBrowser/28.0',
  inApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram/320.0',
  androidWebview: 'Mozilla/5.0 (Linux; Android 16; Pixel 9; wv) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36',
  headlessCi: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/132.0.0.0 Safari/537.36',
};

test('allow Safari and Chrome on desktop, iOS, Android, and installed Chrome PWA', () => {
  for (const key of ['macSafari','iosSafari','ipadSafari','winChrome','macChrome',
    'androidChrome','iosChrome','ipadChrome','pwaAndroid','headlessCi']) {
    assert.ok(['safari','chrome'].includes(classifyInkwaveBrowser(ua[key])), key);
    assert.equal(inkwaveBrowserPermitted(ua[key]), true, key);
  }
});

test('iOS home screen PWA is allowed, but ordinary embedded WKWebView is not', () => {
  for (const key of ['pwaIos','pwaIpad']) {
    assert.equal(classifyInkwaveBrowser(ua[key]), 'ios-webapp-candidate', key);
    assert.equal(inkwaveBrowserPermitted(ua[key]), false, key);
    assert.equal(inkwaveBrowserPermitted(ua[key], true), true, key);
  }
});

test('reject distinct alternative browser brands and malformed or empty UAs', () => {
  for (const key of ['edge','edgeIos','firefox','firefoxIos','opera','samsung','inApp','androidWebview']) {
    assert.equal(classifyInkwaveBrowser(ua[key]), 'blocked', key);
    assert.equal(inkwaveBrowserPermitted(ua[key], true), false, key);
  }
  for (const bad of ['', 'curl/8.0', 'Mozilla/5.0', null, 'Chrome/12', 'x'.repeat(4097)]) {
    assert.equal(classifyInkwaveBrowser(bad), 'blocked', String(bad).slice(0,24));
  }
});

test('edge allowlist blocks static assets before Turnstile and still permits allowed browsers', async () => {
  let assetFetches = 0;
  const env = {
    BROWSER_ALLOWLIST_ENABLED: 'true',
    BOT_GATE_ENABLED: 'false',
    ASSETS: { fetch: async () => { assetFetches++; return new Response('game-ok'); } }
  };
  const request = (path, userAgent) => new Request('https://game.example' + path,
    { headers: { 'User-Agent': userAgent } });
  assert.equal((await serveGameWithBotGate(request('/_versions/rev/src/main.js', ua.winChrome), env)).status, 200);
  assert.equal((await serveGameWithBotGate(request('/_versions/rev/src/main.js', ua.iosSafari), env)).status, 200);
  assert.equal((await serveGameWithBotGate(request('/_versions/rev/src/main.js', ua.pwaIos), env)).status, 200);
  assert.equal(assetFetches, 3);
  const forbidden = await serveGameWithBotGate(request('/_versions/rev/src/main.js', ua.firefox), env);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('Cache-Control'), 'no-store');
  const errorPage = await serveGameWithBotGate(request('/', ua.edge), env);
  assert.equal(errorPage.status, 403);
  assert.match(await errorPage.text(), /Safari.*Chrome/);
  assert.equal(assetFetches, 3);
  const disabled = { ...env, BROWSER_ALLOWLIST_ENABLED: 'false' };
  assert.equal((await serveGameWithBotGate(request('/_versions/rev/src/main.js', ua.edge), disabled)).status, 200);
});

test('browser allowlist also filters Turnstile challenge routes before verification', async () => {
  const env = {
    BROWSER_ALLOWLIST_ENABLED: 'true',
    BOT_GATE_ENABLED: 'true',
    TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    TURNSTILE_SECRET_KEY: 'dummy-secret',
    BOT_GATE_HMAC_KEY: 'a-very-long-key-used-only-in-this-test-suite',
    ASSETS: { fetch: async () => new Response('game-ok') },
  };
  const request = (path, userAgent) => new Request('https://game.example' + path,
    { headers: { 'User-Agent': userAgent } });
  assert.equal((await serveGameWithBotGate(request('/', ua.firefox), env)).status, 403);
  assert.equal((await serveGameWithBotGate(request('/__inkwave-access', ua.firefox), env)).status, 403);
  assert.equal((await serveGameWithBotGate(request('/', ua.winChrome), env)).status, 302);
  assert.equal((await serveGameWithBotGate(request('/__inkwave-access', ua.iosSafari), env)).status, 200);
});

test('startup guard runs before import map and blocks non-standalone WKWebViews', () => {
  const html = protectGameHtml(
    '<!doctype html><html><head><script type="importmap">{"imports":{}}</script>' +
    '</head><body><script type="module" src="./game.js"></script></body></html>'
  ).html;
  const start = html.indexOf('const mode=classify(');
  assert.ok(start >= 0);
  assert.ok(start < html.indexOf('type="importmap"'));
  assert.ok(html.indexOf('Content-Security-Policy') < start);
  const run = new Function('navigator', 'document', 'window', 'matchMedia', inkwaveBrowserGuardScript());
  function simulate(userAgent, standalone) {
    const writes = [];
    let stopped = 0;
    const document = {
      open() { writes.push('open'); },
      write(html) { writes.push(html); },
      close() { writes.push('close'); }
    };
    const window = { stop() { stopped++; } };
    run({ userAgent, standalone }, document, window,
      () => ({ matches: standalone }));
    return { writes, stopped };
  }
  assert.deepEqual(simulate(ua.macSafari, false), { writes: [], stopped: 0 });
  assert.deepEqual(simulate(ua.winChrome, false), { writes: [], stopped: 0 });
  assert.deepEqual(simulate(ua.pwaIos, true), { writes: [], stopped: 0 });
  for (const key of ['firefox','edge','inApp','pwaIos']) {
    const { writes, stopped } = simulate(ua[key], false);
    assert.equal(writes.length, 3, key);
    assert.equal(stopped, 1, key);
    assert.match(writes[1], /このブラウザでは起動できません/);
  }
});
