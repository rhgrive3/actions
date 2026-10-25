import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const emitted = process.env.INKWAVE_TRANSPORT_SITE;

// Execute the whole production-composed module (or fresh minified build), with
// real imported admission/UTF8/receipt helpers and a deterministic platform.
async function fixture(search = '') {
  let now = 100, random = 0, serial = 0;
  const timers = new Map(), sockets = [];
  class Socket {
    readyState = 1; bufferedAmount = 0; sent = [];
    constructor() { sockets.push(this); }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  }
  const math = Object.create(Math); math.random = () => random;
  const schedule = (fn, ms, interval) => {
    const id = ++serial; timers.set(id, { fn, ms, at: now + ms, interval }); return id;
  };
  const context = vm.createContext({ console, TextEncoder, URLSearchParams, Math: math,
    location: { search, hostname: 'localhost' }, performance: { now: () => now }, WebSocket: Socket,
    setTimeout: (fn, ms) => schedule(fn, ms, false), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: id => timers.delete(id) });
  const base = emitted ? path.resolve(emitted) : root;
  const entry = path.join(base, 'src/net/transport.js');
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const source = filename === entry && !emitted
      ? adaptBuildSource('src/net/transport.js', fs.readFileSync(path.join(root, 'inkwave-public/src/net/transport.js'), 'utf8'))
      : fs.readFileSync(filename, 'utf8');
    const module = new vm.SourceTextModule(source, { context, identifier: filename });
    modules.set(filename, module); return module;
  }
  const module = load(entry);
  await module.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));
  await module.evaluate();
  const { Transport, PROTO, COMPAT } = module.namespace;
  return { Transport, timers, sockets,
    advance(ms) { now += ms; }, random(value) { random = value; },
    message(socket, data) { socket.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) }); },
    welcome(socket) { this.message(socket, { t: 'welcome', proto: PROTO, compat: COMPAT, id: 'me', host: 'me', members: [{ id: 'me', name: 'Player' }] }); },
    delivery() { return [...timers.entries()].find(([, t]) => !t.interval && t.ms !== 8000); },
    run(id) { const t = timers.get(id); assert.ok(t); now = Math.max(now, t.at); if (!t.interval) timers.delete(id); else t.at = now + t.ms; t.fn(); }
  };
}

for (const reuse of [false, true]) test(`cancelled jitter does not delay a ${reuse ? 'reused' : 'new'} connection`, async () => {
  const f = await fixture('?netlag=10&netjitter=1000');
  const old = new f.Transport();
  const cancelled = old.connect('BC234', 'Old', false).catch(e => e);
  f.random(.9); f.welcome(f.sockets[0]);
  assert.equal(f.delivery()[1].ms, 910);
  const stale = f.delivery()[1].fn;
  old.close(); assert.equal((await cancelled).name, 'AbortError');
  assert.equal(f.timers.size, 0);
  const next = reuse ? old : new f.Transport();
  const connected = next.connect('BC235', 'New', false);
  f.random(0); f.welcome(f.sockets[1]);
  assert.equal(f.delivery()[1].ms, 10, 'new TCP connection owns its delivery ordering');
  stale(); assert.equal(next.id, null);
  f.run(f.delivery()[0]); await connected;
  next.close(); assert.equal(f.timers.size, 0);
});

test('concurrent connections have independent jitter while each preserves packet order', async () => {
  const f = await fixture('?netlag=10&netjitter=1000');
  const a = new f.Transport(), b = new f.Transport();
  const pa = a.connect('BC234', 'A', false), pb = b.connect('BC235', 'B', false);
  f.random(.9); f.welcome(f.sockets[0]); const first = f.delivery()[0];
  f.random(0); f.welcome(f.sockets[1]);
  const deliveries = [...f.timers.entries()].filter(([, t]) => !t.interval && t.ms !== 8000);
  assert.equal(deliveries[1][1].ms, 10, 'one link cannot head-of-line block another');
  f.message(f.sockets[0], 'm|peer|{"n":1}');
  f.message(f.sockets[0], 'm|peer|{"n":2}');
  const packets = [...f.timers.entries()].filter(([id]) => id > deliveries[1][0]);
  assert.deepEqual(packets.map(([, t]) => t.ms), [910, 910]);
  const received = []; a.onMessage = (_, message) => received.push(message.n);
  f.run(deliveries[1][0]); await pb;
  f.run(first); await pa;
  for (const [id] of packets) f.run(id);
  assert.deepEqual(received, [1, 2]);
  a.close(); b.close(); assert.equal(f.timers.size, 0);
});

test('reconnecting the same Transport discards the previous room RTT sample', async () => {
  const f = await fixture(), tr = new f.Transport();
  let connected = tr.connect('BC234', 'Old', false); f.welcome(f.sockets[0]); await connected;
  f.advance(800); f.message(f.sockets[0], 'pong'); assert.equal(tr.rtt, 800);
  connected = tr.connect('BC235', 'New', false);
  assert.equal(tr.rtt, 0, 'old room sample must not be advertised in the new room');
  f.welcome(f.sockets[1]); await connected;
  f.advance(20); f.message(f.sockets[1], 'pong'); assert.equal(tr.rtt, 20);
  tr.close(); assert.equal(f.timers.size, 0);
});
