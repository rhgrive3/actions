import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptNet } from '../net-adapter.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
export const readSource = (rel) => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
export const outcome = (promise) => promise.then(value => ({ value }), error => ({ error }));
export const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Real transformed session/transport; only the socket/timer platform and unrelated game dependencies are fixtures.
export async function fixture({ search = '', adapt = true } = {}) {
  const sockets = [], timers = new Map();
  let serial = 0, failConstructor = false, now = 100;
  class Socket {
    constructor(url) {
      if (failConstructor) throw new Error('fixture construction failure');
      this.url = url; this.readyState = 1; this.sent = []; this.closed = [];
      sockets.push(this);
    }
    send(data) { this.sent.push(data); }
    close(code, reason) { this.closed.push({ code, reason }); this.readyState = 3; this.onclose?.({ reason }); }
  }
  const addTimer = (fn, ms, interval) => { const id = ++serial; timers.set(id, { fn, ms, interval }); return id; };
  const context = vm.createContext({
    console, URLSearchParams, location: { search, hostname: 'localhost' },
    performance: { now: () => now }, WebSocket: Socket,
    setTimeout: (fn, ms) => addTimer(fn, ms, false), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => addTimer(fn, ms, true), clearInterval: id => timers.delete(id),
  });
  const module = source => new vm.SourceTextModule(source, { context });
  const core = module('export const G={}; export const emit=()=>{};');
  const config = module(`
    export const MAPS=[{id:'map'}],WEAPONS={shooter:{}},WEAPON_ORDER=['shooter'],MATCH={defaultDuration:180},BOT_NAMES=[],TEAM_PALETTES=[];
    export const mapNoBots=()=>false,mapBossOk=()=>true,bossFallbackMap=()=>null,noBotsStartBlock=()=>null;
  `);
  const style = module('export const randomStyle=()=>({});');
  const match = module('export class NetMatch { constructor(net,cfg) {this.net=net;this.cfg=cfg;this.disposed=false;this.launched=false;} dispose(){this.disposed=true;} go(){this.launched=true;} }');
  const load = rel => module(adapt ? adaptNet(rel, readSource(rel)) : readSource(rel));
  const transport = load('src/net/transport.js');
  const session = load('src/net/session.js');
  await session.link(spec => ({ '../core/ctx.js': core, '../config.js': config, '../game/character-style.js': style, './transport.js': transport, './netmatch.js': match })[spec]);
  await session.evaluate();
  const G = core.namespace.G;
  G.game = { netMatchGo() {} };
  const net = new session.namespace.NetSession();
  return {
    net, G, sockets, timers, Transport: transport.namespace.Transport,
    constructionFails: () => { failConstructor = true; },
    message(socket, data) { socket.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); },
    welcome(socket, { id = 'me', host = 'me', members = [{ id: 'me', name: 'Player' }] } = {}) {
      socket.onmessage?.({ data: JSON.stringify({ t: 'welcome', id, host, members }) });
    },
    run(id) { const item = timers.get(id); if (!item) throw new Error('Missing fixture timer'); if (!item.interval) timers.delete(id); now += item.ms; item.fn(); },
    timer(ms) { return [...timers].find(([, item]) => item.ms === ms)?.[0]; },
  };
}
