import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptNetworkSource } from '../adapter.mjs';
import { fixture } from './robustness-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const rawBoss = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/boss/boss.js'), 'utf8');
const adaptedBoss = adaptNetworkSource('src/boss/boss.js', rawBoss);

function methodBody(source, signature) {
  const at = source.indexOf(signature);
  assert.ok(at >= 0, `missing method ${signature}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated method ${signature}`);
}

test('bhit dispatch preserves the authenticated sender identity', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2']]));
  f.bind(nm, []);
  let got = null;
  nm.match.boss = { remoteHit(d, from) { got = [d, from]; } };
  const packet = { k:'bhit', a:17, d:100, weak:0, c:-1 };
  nm.onMessage('p2', packet);
  assert.deepEqual(got, [packet, 'p2']);
});

test('Boss remoteHit rejects non-positive, non-number and wrong-owner damage before mutation', () => {
  const body = methodBody(adaptedBoss, 'remoteHit(d, from)');
  const remoteHit = new Function('G', 'd', 'from', body);
  const attacker = { nid:17, owner:'p2', remote:true, alive:true };
  const G = { netm: { byNid: new Map([[17, attacker]]) } };
  const applied = [], crabbed = [];
  const boss = {
    sim:true, log:{ recv:0, recvDmg:0 }, crabs:new Map([[4,{ id:4, hp:50, dead:false }]]),
    applyDamage(atk, dmg, weak) { applied.push([atk, dmg, weak]); },
    _hitCrab(atk, crab, dmg, fromNet) { crabbed.push([atk, crab, dmg, fromNet]); },
  };

  for (const damage of [-100, 0, '-Infinity', '100', Infinity, NaN])
    remoteHit.call(boss, G, { a:17, d:damage, weak:0, c:-1 }, 'p2');
  remoteHit.call(boss, G, { a:17, d:100, weak:0, c:-1 }, 'p3');
  assert.equal(applied.length, 0);
  assert.equal(crabbed.length, 0);
  assert.deepEqual(boss.log, { recv:0, recvDmg:0 });

  remoteHit.call(boss, G, { a:17, d:100, weak:0, c:-1 }, 'p2');
  assert.equal(applied.length, 1);
  assert.equal(applied[0][1], 100);
  assert.equal(boss.log.recvDmg, 100);

  remoteHit.call(boss, G, { a:17, d:20, weak:0, c:4 }, 'p2');
  assert.equal(crabbed.length, 1);
  assert.equal(crabbed[0][2], 20);
  assert.equal(crabbed[0][3], true);
});

test('Boss and crablet damage entry points reject invalid arithmetic as defense in depth', () => {
  assert.match(adaptedBoss, /!Number\.isFinite\(d\) \|\| d <= 0/);
  assert.match(adaptedBoss, /!Number\.isFinite\(dmg\) \|\| dmg <= 0/);

  const body = methodBody(adaptedBoss, 'applyDamage(attacker, d, weak, point)');
  const applyDamage = new Function('emit', 'clamp', 'attacker', 'd', 'weak', 'point', body);
  const boss = {
    dead:false, invuln:false, visible:true, match:{state:'playing'}, hp:1000,
    flashN:0, weakN:0, hurt:0, brain:null,
    model:{ flash(){} }, _defeat(){ throw new Error('invalid damage defeated boss'); },
  };
  const emit=()=>{}, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  for (const damage of [-100, 0, Infinity, -Infinity, NaN]) {
    const before=boss.hp;
    const result=applyDamage.call(boss, emit, clamp, {}, damage, false, null);
    assert.equal(result, 0);
    assert.equal(boss.hp, before);
    assert.ok(Number.isFinite(boss.hp));
  }
});
