import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {installAudioLoopDedupe} from '../../local-quality/platform-audio.mjs';
import {installRankedLiveAudioReader} from '../../../scripts/lib/ranked-live-audio.mjs';

// Actual composed request/live ownership methods; WebAudio nodes are a platform
// fixture. This proves handle identity, not audible or browser acceptance.
const raw = fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js', import.meta.url),'utf8');
const source = adaptBuildSource('src/audio/audio.js',raw);
const ast = parse(source,{ecmaVersion:'latest',sourceType:'module'});
const cls = ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name==='AudioEngine');
const names = ['loop','_requestSfxLoop','_activateSfxReq','_loopLive','_sfxSilent','_suspendSfxReqs','_resumeSfxReqs'];
const methods = names.map(name=>{const m=cls.body.body.find(n=>n.key.name===name);assert.ok(m,name);return source.slice(m.start,m.end);});
const Engine = new Function('NOOP_HANDLE','MAX_LOOPS','taper',`return class {${methods.join('\n')}}`)
  (Object.freeze({playing:false,set(){},stop(){}}),32,x=>x);
installAudioLoopDedupe(Engine);
function fixture() {
  const engine = new Engine(), state={audio:[]};
  const param=()=>({setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  Object.assign(engine,{ctx:{currentTime:0,state:'running'},vol:{master:1,sfx:1},loops:new Set(),_sfxReq:new Set(),counts:{played:0,dropped:0},
    _def:()=>({gain:1,loop(){return {pitch(){}};}}),_setPos(){},
    _voice(){return {v:{dead:false,dispose(){this.dead=true;},kill(){this.dead=true;}},out:{gain:param()},fade:{gain:param()}};}});
  const context=vm.createContext({RG:{audio:engine},__rankedReplication:state});
  vm.runInContext('('+installRankedLiveAudioReader.toString()+')()',context);
  const add=(nid=1)=>{const options={actor:{nid,remote:true},volume:0},handle=engine.loop('real-recorded-roll',options);
    const record={nid,name:'real-recorded-roll',options,handle,volume:0,stops:0};state.audio.push(record);return record;};
  const read=(nid=1)=>JSON.parse(JSON.stringify(state.readAudio(nid)));
  return {engine,state,add,read};
}
test('composed public request is not in loops; its exact live voice still proves registration',()=>{
  const f=fixture(),r=f.add();assert.equal(r.handle.playing,true);
  assert.equal(f.engine.loops.has(r.handle),false,'original browser predicate necessarily rejects the wrapper');
  assert.equal(f.engine.loops.size,1);
  assert.equal(f.read()[0].playing,true);assert.equal(f.read()[0].registered,true);
  r.handle.set({volume:.45});r.volume=.45;assert.equal(f.read()[0].volume,.45);
  r.handle.stop(.05);assert.equal(f.engine.loops.size,0);assert.equal(f.engine._sfxReq.size,0);
  assert.equal(f.read()[0].playing,false);assert.equal(f.read()[0].registered,false);
});
test('muted, parked and resumed requests require a live registered voice',()=>{
  const f=fixture();f.engine.vol.sfx=0;f.add();assert.equal(f.read()[0].registered,false);
  f.engine.vol.sfx=1;f.engine._resumeSfxReqs();assert.equal(f.read()[0].playing,true);
  f.engine._suspendSfxReqs();assert.equal(f.read()[0].registered,false);
  f.engine._resumeSfxReqs();assert.equal(f.read()[0].registered,true);
});
test('same-named voices cannot be borrowed from another actor or request object',()=>{
  const f=fixture(),a=f.add(1),b=f.add(2);assert.equal(f.read(1).length,1);assert.equal(f.read(2)[0].playing,true);
  a.options={...b.options};assert.equal(f.read(1)[0].registered,false);
  a.options=b.options;assert.equal(f.read(1)[0].registered,false);
  assert.equal(f.read(2)[0].registered,true);
});
test('pending and unregistered handles do not qualify even when playing is claimed',()=>{
  const f=fixture(),r=f.add();f.engine.loops.clear();assert.equal(f.read()[0].playing,false);
  f.state.audio.push({nid:3,name:r.name,handle:{playing:true},options:{actor:{nid:3}},volume:1,stops:0});
  assert.equal(f.read(3)[0].registered,false);
});
test('direct native handles remain admissible and missing observer state fails closed',()=>{
  const f=fixture(),r=f.add(),live=[...f.engine.loops][0];r.handle=live;
  assert.equal(f.read()[0].registered,true);
  const context=vm.createContext({RG:{audio:f.engine}});
  assert.throws(()=>vm.runInContext('('+installRankedLiveAudioReader.toString()+')()',context),/unavailable/);
});
test('ranked browser installs the live reader before its unchanged real-audio gates',()=>{
  const c=fs.readFileSync(new URL('../../../scripts/check-inkwave-ranked-browser.mjs',import.meta.url),'utf8');
  assert.match(c,/record=\{nid:options\.actor\.nid,name,options,handle:h/);
  assert.match(c,/realRollLoops:state\.readAudio\(nid\)/);
  const install=c.indexOf('p.evaluate(installRankedLiveAudioReader)'),gate=c.indexOf('await guest.waitForFunction(nid=>{const s=__rankedReplication.read(nid);return s?.held');
  assert.ok(install>0&&gate>install);
  assert.match(c,/s\.realRollLoops\.some\(h=>h\.playing&&h\.registered\)/);
  const clock=fs.readFileSync(new URL('../../../scripts/lib/ranked-roller-audio.mjs',import.meta.url),'utf8');
  assert.match(clock,/h\.playing&&h\.registered&&h\.volume>0/);
  assert.equal(c.split('await proveRankedRollAudio(host,guest,').length,3);
  assert.match(c,/G\.audio\.loop=s\.loop;for\(const r of s\.audio\)r\.handle\.stop\(\.05\)/);
  assert.match(c,/const timeout=\{timeout:30000\}/);
});
