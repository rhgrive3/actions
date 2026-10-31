// Run after installing account/ dependencies: npm run test:assets.
// Uses the same workerd asset router as local Wrangler, not an emulated HTTP server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { writeWorkersAssetPolicy } from '../dev/vite-plugins.mjs';

test('Workers assets emit reuse policy and exclude development files without breaking caching', { timeout: 30_000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zevant-assets-'));
  const put = (name, bytes) => {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  };
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  put('index.html', '<!doctype html><title>asset policy fixture</title>');
  put('sw.js', '// service worker fixture');
  put('_versions/rev/game.js', 'export const value = 42;');
  put('native-prebuilt/packs/stage.bin', 'stage fixture');
  put('inkwave-build.json', '{"revision":"fixture"}');
  const excluded = ['game.js.map', '_versions/rev/game.js.map', '.env', '.env.local',
    '_versions/rev/.env.production', '.git/config', '_versions/rev/.git/config', '.nojekyll'];
  for (const name of excluded) put(name, 'must not be served');
  writeWorkersAssetPolicy(directory);

  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'zevant-policy-test',
    modules: true,
    script: `export default { fetch(request, env) {
      if (new URL(request.url).pathname.startsWith('/api/')) return new Response('api fixture');
      return env.ASSETS.fetch(request);
    } };`,
    compatibilityDate: '2026-09-01',
    assets: { directory, binding: 'ASSETS', run_worker_first: ['/api/*'],
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: 'none' } },
  }));
  t.after(() => mf.dispose());
  for (const name of ['/', '/index.html', '/sw.js', '/_versions/rev/game.js', '/native-prebuilt/packs/stage.bin', '/inkwave-build.json']) {
    const response = await mf.dispatchFetch('https://game.example' + name);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin', name);
    assert.equal(response.headers.get('X-Frame-Options'), 'SAMEORIGIN', name);
    assert.equal(response.headers.get('Content-Security-Policy'), "frame-ancestors 'self'", name);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null, name);
    if (name.startsWith('/_versions/') || name.startsWith('/native-prebuilt/packs/')) {
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable', name);
    } else if (['/', '/index.html', '/sw.js'].includes(name)) {
      assert.equal(response.headers.get('Cache-Control'), 'no-cache', name);
    }
    await response.arrayBuffer();
  }
  for (const name of excluded) {
    const response = await mf.dispatchFetch('https://game.example/' + name);
    assert.equal(response.status, 404, name);
    await response.arrayBuffer();
  }
  const head = await mf.dispatchFetch('https://game.example/_versions/rev/game.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(await head.text(), '');
  const api = await mf.dispatchFetch('https://game.example/api/health');
  assert.equal(await api.text(), 'api fixture');
  assert.equal(api.headers.get('Content-Security-Policy'), null, 'static policy must not replace API policy');
});
