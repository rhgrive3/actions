import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { serveProjectileCaptureFile } from '../lib/inkwave-projectile-http-file.mjs';

test('local capture HTTP media semantics without browser or gameplay', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectile-http-test-'));
  fs.writeFileSync(path.join(dir, 'music.mp3'), '0123456789');
  fs.writeFileSync(path.join(dir, 'empty.mp3'), '');
  fs.writeFileSync(path.join(dir, 'module.js'), 'export {};');
  const server = http.createServer((req, res) => {
    const file = path.join(dir, req.url === '/empty' ? 'empty.mp3' : req.url === '/js' ? 'module.js' : 'music.mp3');
    serveProjectileCaptureFile(req, res, file, { '.js': 'text/javascript; charset=utf-8' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true }); });
  function request({ range, method = 'GET', url = '/' } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method,
        headers: range === undefined ? {} : { Range: range } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
        res.on('error', reject);
      }); req.on('error', reject); req.end();
    });
  }
  await t.test('ordinary GET retains full bytes and no-store, with correct audio MIME/length', async () => {
    const r = await request(); assert.equal(r.status, 200); assert.equal(r.body, '0123456789');
    assert.equal(r.headers['content-type'], 'audio/mp3'); assert.equal(r.headers['content-length'], '10');
    assert.equal(r.headers['accept-ranges'], 'bytes'); assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['transfer-encoding'], undefined);
  });
  for (const [range, body, contentRange] of [
    ['bytes=0-', '0123456789', 'bytes 0-9/10'], ['bytes=4-', '456789', 'bytes 4-9/10'],
    ['bytes=2-4', '234', 'bytes 2-4/10'], ['bytes=8-99', '89', 'bytes 8-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=-99', '0123456789', 'bytes 0-9/10'],
    ['bytes=0-0', '0', 'bytes 0-0/10'],
  ]) await t.test(range, async () => {
    const r = await request({ range }); assert.equal(r.status, 206); assert.equal(r.body, body);
    assert.equal(r.headers['content-range'], contentRange); assert.equal(Number(r.headers['content-length']), Buffer.byteLength(body));
    assert.equal(r.headers['content-type'], 'audio/mp3');
  });
  for (const range of ['bytes=10-', 'bytes=8-3', 'bytes=-0', 'bytes=-', 'bytes=foo-bar', 'bytes=0-1,3-4', 'bytes=9007199254740992-']) {
    await t.test(`reject invalid/unsupported single range ${range}`, async () => {
      const r = await request({ range }); assert.equal(r.status, 416); assert.equal(r.body, '');
      assert.equal(r.headers['content-range'], 'bytes */10'); assert.equal(r.headers['content-length'], '0');
    });
  }
  await t.test('HEAD returns full metadata, no body, ignores Range', async () => {
    for (const range of [undefined, 'bytes=2-3']) {
      const r = await request({ method: 'HEAD', range }); assert.equal(r.status, 200); assert.equal(r.body, '');
      assert.equal(r.headers['content-length'], '10'); assert.equal(r.headers['content-range'], undefined);
    }
  });
  await t.test('empty asset and range beyond empty representation', async () => {
    assert.equal((await request({ url: '/empty' })).status, 200);
    const r = await request({ url: '/empty', range: 'bytes=0-' }); assert.equal(r.status, 416);
    assert.equal(r.headers['content-range'], 'bytes */0');
  });
  await t.test('existing non-audio MIME stays unchanged', async () => {
    const r = await request({ url: '/js' }); assert.equal(r.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.equal(r.body, 'export {};');
  });
  await t.test('asynchronous file-read error terminates response without an uncaught error', async t => {
    t.mock.method(fs, 'createReadStream', () => {
      const source = new PassThrough();
      process.nextTick(() => source.destroy(new Error('injected asynchronous read failure')));
      return source;
    });
    await assert.rejects(request(), /socket hang up|aborted|ECONNRESET/);
  });
  await t.test('client disconnect destroys the unfinished file stream', async t => {
    const source = new PassThrough();
    const closed = new Promise(resolve => source.once('close', resolve));
    t.mock.method(fs, 'createReadStream', () => {
      process.nextTick(() => source.write('0'));
      return source;
    });
    await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path: '/' }, res => {
        res.once('data', () => { res.destroy(); resolve(); });
        res.on('error', () => {});
      });
      req.on('error', reject);
    });
    await closed;
    assert.equal(source.destroyed, true);
  });
});
