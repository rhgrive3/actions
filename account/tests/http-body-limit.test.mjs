import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, MAX_BODY_BYTES } from '../worker/http.js';

const request = body => new Request('https://account.test/api/account/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
});
const oversized = error => error.status === 413 && error.code === 'payload_too_large';

test('JSON limit measures UTF-8 bytes, including multibyte player data', async () => {
  const body = JSON.stringify({ text: 'イ'.repeat(3000) });
  assert.ok(body.length < MAX_BODY_BYTES);
  assert.ok(new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES);
  await assert.rejects(readJson(request(body)), oversized);
});

test('JSON accepts the exact byte limit and rejects the next byte', async () => {
  const body = JSON.stringify({ text: 'a'.repeat(MAX_BODY_BYTES - 11) });
  assert.equal(new TextEncoder().encode(body).byteLength, MAX_BODY_BYTES);
  assert.equal((await readJson(request(body))).text.length, MAX_BODY_BYTES - 11);
  await assert.rejects(readJson(request(body + ' ')), oversized);
});

test('chunked JSON stops and cancels as soon as its byte budget is exceeded', async () => {
  let pulls = 0, cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      pulls++;
      if (pulls <= 3) controller.enqueue(new Uint8Array(MAX_BODY_BYTES / 2).fill(32));
      else { controller.enqueue(new TextEncoder().encode('{}')); controller.close(); }
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(readJson(request(body)), oversized);
  assert.equal(pulls, 3, 'do not consume the rest of an already rejected upload');
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('streaming JSON decoding preserves multibyte characters split between chunks', async () => {
  const expected = { text: 'イカ🦑' };
  const bytes = new TextEncoder().encode(JSON.stringify(expected));
  let at = 0;
  const body = new ReadableStream({
    pull(controller) { if (at < bytes.length) controller.enqueue(bytes.slice(at, ++at)); else controller.close(); },
  });
  assert.deepEqual(await readJson(request(body)), expected);
});
