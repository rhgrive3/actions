import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fixture} from './source-fixture.mjs';
import {adaptSource} from '../adapter.mjs';
import {adaptIssue482Net} from '../issue-482-adapter.mjs';
import {adaptNetworkSource} from '../../network-replication/adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
const ROOT=new URL('../../../',import.meta.url).pathname;
const rel='src/net/netmatch.js';
const raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const modern=adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw)));

test('default and caller-provided extra exports both boot the real source fixture',async()=>{
 const defaults=await fixture();assert.equal(typeof defaults.Actor,'function');
 const extra=await fixture({extraExports:'export const EXTRA_EXPORT_PROBE = 23;'});
 assert.equal(extra.EXTRA_EXPORT_PROBE,23);assert.equal(typeof extra.NetMatch,'function');
});

test('old fixture signature reaches the undefined extraExports negative',async()=>{
 const fn=fixture.toString();const anchor=", extraExports = ''";
 assert.equal(fn.split(anchor).length,2);
 const original=Function('vm','path','adaptSource','ROOT','UPSTREAM',`return (${fn.replace(anchor,'')})`)(vm,path,adaptSource,ROOT,ROOT+'inkwave-public');
 await assert.rejects(original(),/extraExports is not defined/);
});

function respawn(source){
 const at=source.indexOf('  _remoteRespawn(a) {'),end=source.indexOf('\n  }',at)+4;
 assert.ok(at>=0&&end>at);
 return vm.runInNewContext(`(class {${source.slice(at,end)}}).prototype._remoteRespawn`,{PLAYER:{hp:100,spawnInvuln:2}});
}
for(const order of ['482-before-network','network-before-482'])test(`${order} preserves actual Super Jump, Storm proof and attacker retirement`,()=>{
 const composed=order==='482-before-network'?adaptNetworkSource(rel,adaptIssue482Net(modern)):adaptIssue482Net(adaptNetworkSource(rel,modern));
 const actor={alive:false,hp:0,invuln:0,respawnTimer:3,superJumpGround:{x:1},lastAttacker:{name:'old'},lastAttackerHitAge:0,net:{spawnPending:false,_stormBirthAuth:{used:false}}};
 respawn(composed).call({},actor);
 assert.equal(actor.alive,true);assert.equal(actor.hp,100);assert.equal(actor.invuln,2);assert.equal(actor.respawnTimer,0);
 assert.equal(actor.superJumpGround,null);assert.equal(actor.net._stormBirthAuth,null);assert.equal(actor.net.spawnPending,true);
 assert.equal(actor.lastAttacker,null);assert.equal(actor.lastAttackerHitAge,99);
 assert.ok(composed.includes('e._stormSnapshot = null;'));assert.ok(composed.includes('auth.used = true;'));
});

test('old whole-method cannot match modern respawn; new tail remains fail-closed',()=>{
 const old='  _remoteRespawn(a) {\n    a.alive = true; a.hp = PLAYER.hp; a.invuln = PLAYER.spawnInvuln;\n    a.respawnTimer = 0;\n    a.net.spawnPending = true;\n  }';
 assert.equal(modern.includes(old),false);
 assert.throws(()=>adaptIssue482Net(modern.replace('    a.net.spawnPending = true;','    a.net.spawnPending = false;')),/remote respawn attacker clear/);
 assert.throws(()=>adaptIssue482Net(modern+'\n    a.net.spawnPending = true;\n  }'),/remote respawn attacker clear/);
 assert.throws(()=>adaptIssue482Net(adaptIssue482Net(modern)),/conflict/);
});
