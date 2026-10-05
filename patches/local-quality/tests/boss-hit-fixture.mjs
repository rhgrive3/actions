import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
const SRC = new URL('../../../inkwave-public/', import.meta.url);
export async function bossWorld(patched = true) {
  const context = vm.createContext({ console, performance: { now: () => 1000 } });
  const ctx = new vm.SourceTextModule(fs.readFileSync(new URL('src/core/ctx.js', SRC), 'utf8'), { context });
  await ctx.link(() => { throw Error('unexpected ctx dependency'); });await ctx.evaluate();
  const stub = values => new vm.SyntheticModule(Object.keys(values), function() { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }, { context });
  const mods = { three: stub(THREE), '../core/ctx.js': ctx,
    '../config.js': stub({ PLAYER: {}, WEAPONS: {}, mapNoBots: () => false }),
    '../game/bots.js': stub({ BotBrain: class {} }),
    './bossModel.js': stub({ BossModel: class {} }), './bossBrain.js': stub({ BossBrain: class {} }),
    './bossNav.js': stub({ BossNav: class {}, FLOOR_BODY: 0 }),
    './bossHazards.js': stub({ BossHazards: class {}, movePhaseAt() {}, moveTimes() {}, beamAngle() {}, HZ: {} }),
  };
  async function native(rel) {
    let code = fs.readFileSync(new URL(rel, SRC), 'utf8');
    code = adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code)));
    if (patched) code = adaptQualitySource(rel, code);
    const module = new vm.SourceTextModule(code, { context, identifier: fileURLToPath(new URL(rel, SRC)) });
    await module.link(name => { if (!mods[name]) throw Error('unexpected dependency '+name);return mods[name]; });
    await module.evaluate();return module.namespace;
  }
  const { NetMatch } = await native('src/net/netmatch.js');const { Boss } = await native('src/boss/boss.js');
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
