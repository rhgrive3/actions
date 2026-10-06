import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
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

test('default, legacy-string and object extra exports both boot the real source fixture',async()=>{
 const defaults=await fixture();assert.equal(typeof defaults.Actor,'function');
 const legacy=await fixture('export const LEGACY_EXPORT_PROBE = 19;');assert.equal(legacy.LEGACY_EXPORT_PROBE,19);
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

// Minimal already-adapted native-module fixture, not a production build.
test('BUILT mode reads already-adapted native modules once for default/string/object callers',()=>{
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-758-fixture-'));
 const mirror=(from,to)=>{fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){const src=path.join(from,e.name),dst=path.join(to,e.name);if(e.isDirectory())mirror(src,dst);else fs.symlinkSync(src,dst);}};
 try{
  mirror(path.join(ROOT,'inkwave-public/src'),path.join(site,'src'));
  fs.symlinkSync(path.join(ROOT,'inkwave-public/vendor'),path.join(site,'vendor'),'dir');
  fs.symlinkSync(path.join(ROOT,'patches'),path.join(site,'patches'),'dir');
  for(const rel of ['src/config.js','src/game/actor.js']){
   const target=path.join(site,rel),source=fs.readFileSync(target,'utf8');fs.unlinkSync(target);fs.writeFileSync(target,adaptSource(rel,source));
  }
  const script=`import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
   import {fixture} from ${JSON.stringify(new URL('./source-fixture.mjs',import.meta.url).href)};
   import {adaptSource} from ${JSON.stringify(new URL('../adapter.mjs',import.meta.url).href)};
   assert.equal(typeof (await fixture()).Actor,'function');
   assert.equal((await fixture('export const BUILT_STRING=31')).BUILT_STRING,31);
   assert.equal((await fixture({extraExports:'export const BUILT_OBJECT=37',adapt(){throw Error('native adaptation repeated')}})).BUILT_OBJECT,37);
   const source=fixture.toString();assert.equal(source.split('!BUILT && file.startsWith').length,2);
   const legacy=Function('vm','path','fs','adaptSource','ROOT','UPSTREAM','BUILT','return ('+source.replace('!BUILT && file.startsWith','file.startsWith')+')')(vm,path,fs,adaptSource,${JSON.stringify(ROOT)},process.env.INKWAVE_BUILT_SITE,true);
   await assert.rejects(legacy(),/charger surface: independent post-shot swim gate/);`;
  execFileSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{env:{...process.env,INKWAVE_BUILT_SITE:site},stdio:'pipe'});
 }finally{fs.rmSync(site,{recursive:true,force:true});}
});

test('old object-only entry silently drops a legacy string export',async()=>{
 const source=fixture.toString(),anchor="typeof options === 'string' ? { extraExports: options } : options";
 assert.equal(source.split(anchor).length,2);
 const legacy=Function('vm','path','fs','adaptSource','ROOT','UPSTREAM','BUILT',`return (${source.replace(anchor,'options')})`)(vm,path,fs,adaptSource,ROOT,path.join(ROOT,'inkwave-public'),false);
 assert.equal((await legacy('export const LOST_EXPORT=41')).LOST_EXPORT,undefined);
 assert.equal((await fixture('export const LOST_EXPORT=41')).LOST_EXPORT,41);
});
