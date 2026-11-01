import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { clientScriptPolicy, protectGameHtml, embeddedGameCsp } from '../../scripts/lib/inkwave-client-csp.mjs';
import { mintGameGateCookie, verifyGameGateCookie, serveGameWithBotGate } from '../worker/bot-gate.js';

const host = 'game.example';
const origin = 'https://' + host;
const env = () => ({
  BOT_GATE_ENABLED: 'true',
  BOT_GATE_HMAC_KEY: 'test-only-key-not-used-in-production',
  TURNSTILE_SECRET_KEY: 'test-only-turnstile-secret',
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  ASSETS: { fetch: async () => new Response('protected-game', { status: 200 }) },
});

test('CSP hashes allowed inline boot code but not untrusted inline scripts', () => {
  const source = '<!doctype html><head><base href="./_versions/hash/">' +
    '<script type="importmap">{"imports":{"three":"./three.js"}}</script>' +
    '<script>const trusted = 1;</script>' +
    '<script src="./game.js"></script>' +
    '</head><body></body>';
  const policy = clientScriptPolicy(source);
  const digest = value => "'sha256-" + createHash('sha256').update(value).digest('base64') + "'";
  assert.ok(policy.includes(digest('const trusted = 1;')));
  assert.ok(policy.includes(digest('{"imports":{"three":"./three.js"}}')));
  assert.ok(policy.includes("script-src 'self'"));
  assert.ok(policy.includes("script-src-attr 'none'"));
  assert.ok(policy.includes("worker-src 'self' blob:"));
  assert.ok(!policy.includes("'unsafe-inline'"));
  assert.ok(!policy.includes("'strict-dynamic'"));
  assert.ok(!policy.includes('https://cdn.jsdelivr.net'));
  const protectedHtml = protectGameHtml(source);
  assert.equal(embeddedGameCsp(protectedHtml.html), protectedHtml.policy);
  assert.equal(protectedHtml.policy, clientScriptPolicy(protectedHtml.html));
  for (const match of protectedHtml.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
    assert.ok(protectedHtml.policy.includes(digest(match[2])), 'every emitted inline body is CSP-authorized');
    if (!/\btype\s*=\s*["']importmap/.test(match[1]))
      assert.doesNotThrow(() => new Function(match[2]), 'inline JavaScript remains syntactically intact');
  }
  assert.ok(protectedHtml.html.indexOf('http-equiv="Content-Security-Policy"') < protectedHtml.html.indexOf('<base'));
  assert.throws(() => protectGameHtml(protectedHtml.html), /already installed/);
  assert.ok(!policy.includes(digest('eruda.init()')));
});

test('CSP source HTML remains compatible with original scripts and importmap', () => {
  const source = readFileSync(new URL('../../inkwave-public/index.html', import.meta.url), 'utf8');
  const secured = protectGameHtml(source);
  assert.match(Buffer.from(secured.html, 'utf8').subarray(0, 1024).toString('utf8'), /<meta charset="utf-8">/,
    'HTML encoding remains discoverable before injected guards');
  assert.match(secured.policy, /sha256-/);
  assert.match(secured.html, /type="importmap"/);
  assert.match(secured.html, /src="\.\/src\/main\.js"/);
  assert.match(secured.html, /event\.key==='F12'/);
});

test('versioned production HTML keeps charset before guards and CSP before base', () => {
  const source = readFileSync(new URL('../../inkwave-public/index.html', import.meta.url), 'utf8');
  const build = readFileSync(new URL('../../scripts/build-inkwave.mjs', import.meta.url), 'utf8');
  // Execute the actual build's HTML finalization without rebuilding its assets.
  // This catches ordering differences absent from unversioned HTML fixtures.
  const finalization = build.match(/\/\/ Place base[\s\S]*?(?=^fs\.writeFileSync\(path\.join\(BUILD,'index\.html'\))/m)?.[0];
  assert.ok(finalization, 'production HTML finalization is covered');
  const finalize = new Function('protectGameHtml', 'loadingHTML', 'revision', finalization + '\nreturn securedHtml;');
  const revision = 'a'.repeat(64);
  const secured = finalize(protectGameHtml, source, revision);
  assert.match(Buffer.from(secured.html, 'utf8').subarray(0, 1024).toString('utf8'), /<meta charset="utf-8">/);
  const base = `<base href="./_versions/${revision}/">`;
  assert.equal(secured.html.split(base).length - 1, 1);
  assert.ok(secured.html.indexOf('http-equiv="Content-Security-Policy"') < secured.html.indexOf(base));
  assert.ok(secured.html.indexOf(base) < secured.html.indexOf('<script type="importmap">'));
  assert.equal(secured.policy, clientScriptPolicy(secured.html));
  assert.throws(() => finalize(protectGameHtml, source.replace('<meta charset="utf-8">', ''), revision),
    /missing leading UTF-8 declaration/);
});

test('gate HMAC cannot be forged, replayed on another host or used after expiry', async () => {
  const now = 1793430000000;
  const cookie = await mintGameGateCookie(host, env().BOT_GATE_HMAC_KEY, now);
  assert.equal(await verifyGameGateCookie(cookie, host, env().BOT_GATE_HMAC_KEY, now + 1000), true);
  assert.equal(await verifyGameGateCookie(cookie, 'other.example', env().BOT_GATE_HMAC_KEY, now + 1000), false);
  assert.equal(await verifyGameGateCookie(cookie, host, env().BOT_GATE_HMAC_KEY, now + 12 * 60 * 60 * 1000), false);
  const fields = cookie.split('.');
  const forgedMac = (fields[2][0] === 'A' ? 'B' : 'A') + fields[2].slice(1);
  assert.equal(await verifyGameGateCookie(fields[0] + '.' + fields[1] + '.' + forgedMac,
    host, env().BOT_GATE_HMAC_KEY, now + 1000), false);
});

test('disabled gate serves game files unchanged', async () => {
  const settings = env(); settings.BOT_GATE_ENABLED = 'false';
  const response = await serveGameWithBotGate(new Request(origin + '/_versions/hash/src/main.js'), settings);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'protected-game');
});

test('enabled gate denies direct JS downloads and serves isolated Turnstile challenge', async () => {
  const settings = env();
  const home = await serveGameWithBotGate(new Request(origin + '/'), settings);
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/__inkwave-access');
  const blocked = await serveGameWithBotGate(new Request(origin + '/_versions/hash/src/main.js'), settings);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('Cache-Control'), 'no-store');
  const challenge = await serveGameWithBotGate(new Request(origin + '/__inkwave-access'), settings);
  assert.equal(challenge.status, 200);
  assert.match(await challenge.text(), /data-action="inkwave_access"/);
  assert.match(challenge.headers.get('Content-Security-Policy'), /challenges\.cloudflare\.com/);
  const incomplete = env(); incomplete.BOT_GATE_HMAC_KEY = '';
  assert.equal((await serveGameWithBotGate(new Request(origin + '/'), incomplete)).status, 503);
});

test('Turnstile form body is bounded and duplicate tokens cannot pass', async () => {
  const settings = env();
  const base = origin + '/__inkwave-access/verify';
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  const oversized = await serveGameWithBotGate(new Request(base, {
    method: 'POST', headers, body: 'cf-turnstile-response=' + 'x'.repeat(5000),
  }), settings);
  assert.equal(oversized.status, 413);
  const duplicated = await serveGameWithBotGate(new Request(base, {
    method: 'POST', headers, body: 'cf-turnstile-response=x&cf-turnstile-response=y',
  }), settings);
  assert.equal(duplicated.status, 403);
  const crossOrigin = await serveGameWithBotGate(new Request(base, {
    method: 'POST', headers: { ...headers, Origin: 'https://other.example' },
    body: 'cf-turnstile-response=test-token',
  }), settings);
  assert.equal(crossOrigin.status, 403);
});

test('server-side Turnstile proof issues a signed session and unlocks assets', async () => {
  const settings = env();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(options.body.get('secret'), settings.TURNSTILE_SECRET_KEY);
      assert.equal(options.body.get('response'), 'test-token');
      return new Response(JSON.stringify({ success: true, hostname: host, action: 'inkwave_access' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    };
    const request = new Request(origin + '/__inkwave-access/verify', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'cf-turnstile-response=test-token',
    });
    const verified = await serveGameWithBotGate(request, settings);
    assert.equal(verified.status, 303);
    assert.equal(verified.headers.get('Location'), '/');
    assert.equal(calls, 1);
    const cookie = verified.headers.get('Set-Cookie');
    assert.match(cookie, /Secure; HttpOnly; SameSite=Lax/);
    const protectedRequest = new Request(origin + '/_versions/revision/src/main.js', {
      headers: { Cookie: cookie.split(';')[0] },
    });
    const allowed = await serveGameWithBotGate(protectedRequest, settings);
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), 'protected-game');

    globalThis.fetch = async () => new Response(JSON.stringify({
      success: true, hostname: 'wrong-host.example', action: 'inkwave_access'
    }), { status: 200 });
    const rejected = await serveGameWithBotGate(new Request(origin + '/__inkwave-access/verify', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'cf-turnstile-response=test-token',
    }), settings);
    assert.equal(rejected.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
