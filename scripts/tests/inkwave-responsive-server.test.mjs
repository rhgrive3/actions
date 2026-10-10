import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResponsiveAssetServer } from '../lib/inkwave-responsive-server.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(repo, 'inkwave-public');

function get(server, requestPath) {
  const { port } = server.address();
  let responseCount = 0;
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: requestPath }, (response) => {
      responseCount++;
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString(), responseCount }));
    });
    request.on('error', reject);
  });
}

test('responsive fixture server returns one 404 for missing, invalid, and traversal paths and keeps serving assets', async (t) => {
  assert.ok(fs.existsSync(path.join(source, 'src/ui/menus.js')));
  assert.ok(fs.existsSync(path.join(repo, 'README.md')), 'traversal target exists outside the static root');
  const server = createResponsiveAssetServer({ source, html: '<!doctype html><title>fixture</title>' });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  for (const requestPath of ['/missing-responsive-fixture.css', '/%E0%A4%A', '/%2e%2e%2fREADME.md']) {
    const response = await get(server, requestPath);
    assert.equal(response.responseCount, 1, `${requestPath}: exactly one HTTP response`);
    assert.equal(response.status, 404, `${requestPath}: invalid asset must not become a 200`);
    assert.equal(response.body, 'Missing');
  }

  assert.equal(server.listening, true, 'bad asset requests must not crash the HTTP server');
  const valid = await get(server, '/src/ui/menus.js');
  assert.equal(valid.responseCount, 1);
  assert.equal(valid.status, 200);
  assert.equal(valid.body, fs.readFileSync(path.join(source, 'src/ui/menus.js'), 'utf8'));
});
