// Source751 fixture adapted to the complete current production transform chain.
// Only the negative control removes the Boss admission call after composition.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../',import.meta.url));
const SRC = path.join(ROOT,'inkwave-public');
const compose=(rel,code)=>adaptRange(rel,adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))))));
export async function bossWorld(patched = true, { adapt = (_rel, code) => code } = {}) {
  const context=vm.createContext({ console, performance:{now:()=>1000} });
  const modules=new Map();
  function resolve(spec,from) {
    if(spec==='three') return path.join(SRC,'vendor/three/build/three.module.js');
    if(spec.startsWith('three/addons/')) return path.join(SRC,'vendor/three/jsm',spec.slice('three/addons/'.length));
    let file=path.resolve(path.dirname(from),spec);
    if(file.startsWith(path.join(SRC,'patches/'))) file=path.join(ROOT,path.relative(SRC,file));
    if(file.startsWith(path.join(ROOT,'src/'))) file=path.join(SRC,path.relative(ROOT,file));
    return file;
  }
  function load(file) {
    if(modules.has(file)) return modules.get(file);
    const rel=path.relative(file.startsWith(SRC+path.sep)?SRC:ROOT,file);
    let code=adapt(rel,compose(rel,fs.readFileSync(file,'utf8')));
    if(!patched && rel==='src/net/netmatch.js') {
      const guarded="case 'bhit': if (this.isHost && this._acceptBossHit(from, d)) this.match.boss.remoteHit(d); break;";
      if(!code.includes(guarded)) throw Error('Boss negative-control admission boundary changed');
      code=code.replace(guarded,"case 'bhit': if (this.isHost) this.match?.boss?.remoteHit(d); break;");
    }
    const module=new vm.SourceTextModule(code,{context,identifier:file});modules.set(file,module);return module;
  }
  const root=new vm.SourceTextModule(`export * from './inkwave-public/src/core/ctx.js';export { NetMatch } from './inkwave-public/src/net/netmatch.js';export { Boss } from './inkwave-public/src/boss/boss.js';`,{context,identifier:path.join(ROOT,'fixture.mjs')});
  await root.link((spec,from)=>load(resolve(spec,from.identifier)));await root.evaluate();
  const ctx=root, {NetMatch,Boss}=root.namespace;
  const G = ctx.namespace.G;
  const nm = new NetMatch({ myId: 'host', isHost: true, hostId: 'host' }, { id: 'match-a' });
  const boss = Object.assign(Object.create(Boss.prototype), { sim: true, hp: 10000, visible: true, dead: false, invuln: false,
    match: { state: 'playing' }, crabs: new Map(), log: { recv: 0, recvDmg: 0 }, flashN: 0, weakN: 0,
    model: { flash() {} }, brain: { noteDamage() {}, checkPhase() {} }, crabPop(c) { c.dead = true; },
  });
  nm.match = { boss };G.netm = nm;
  const actor = { nid: 1, owner: 'guest', remote: true, netLife: 2, net: { lastLife: 2 }, stats: { splats: 0 } };
  nm.byNid.set(actor.nid, actor);
  const hit = (extra = {}) => ({ k: 'bhit', a: 1, d: 30, weak: 0, w: 'shooter', c: -1, m: 'match-a', l: 2, q: 1, ...extra });
  return { G, NetMatch, Boss, nm, boss, actor, hit };
}
