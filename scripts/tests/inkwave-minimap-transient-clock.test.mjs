import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {readMinimapClockFixture,projectMinimapUpdateClock,restoreMinimapCompositeClock,admitMinimapClockEpoch,minimapClockReferenceFixture,minimapClockReferenceBinding} from '../lib/minimap-transient-clock-reference.mjs';
const fixture=minimapClockReferenceFixture(),binding=minimapClockReferenceBinding(),hash=b=>createHash('sha256').update(b).digest('hex');
const packed=fs.readFileSync(new URL('../fixtures/minimap-transient-clock-20261029.json.gz',import.meta.url));
const method=(source,name)=>{const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});for(const node of ast.body)if(node.type==='ClassDeclaration'&&node.id.name==='Minimap'){const m=node.body.body.find(m=>m.key.name===name);if(m)return source.slice(m.start,m.end);}throw Error(name);};
function clockFixture(source){
 const fxList=[],G={teamHex:['#a','#b'],game:{theme:'day'},projectiles:{bombs:[],clouds:[]}},draws=[];
 const ctx=new Proxy({drawImage(){}},{get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
 const environment={fxList,G,TAU:Math.PI*2,STORM_LINE_DASH:[4,4],SOLID_LINE_DASH:[]};
 const compile=name=>new Function(...Object.keys(environment),'return ({'+method(source,name)+'}).'+name)(...Object.values(environment));
 const compose=compile('_compose'),m={_built:true,_inkGen:0,time:0,timer:10,flashT:9,version:1,paint:{version:1},_teamKey:'#a#b',_theme:'day',_band:0,_composeAcc:0,_composeDirty:false,w:16,h:16,s:4,ctx,level:{spawnPads:[]},toCanvas(){},_drawInk(){}};
 m._compose=dt=>{compose.call(m,dt);draws.push(fxList.map(f=>f.t));};m.update=compile('update');m.tickHidden=compile('tickHidden');
 return{m,fxList,draws,birth(){fxList.push({kind:'boom',x:1,z:1,r:2,team:0,t:0,life:.7});}};
}
test('separate clock fixture seals both complete legacy owners and exact two-hunk inverse',()=>{
 assert.equal(hash(packed),binding.fixtureSha256);assert.equal(fixture.changes.length,2);
 for(const [owner,entry]of Object.entries(fixture.sources)){
  assert.equal(hash(entry.legacy),entry.legacySha256);
  const current=projectMinimapUpdateClock(entry.legacy,owner);assert.equal(hash(current),entry.currentSha256);
  assert.equal(restoreMinimapCompositeClock(current,owner),entry.legacy);
  const other=owner==='baseline'?'candidate':'baseline';assert.throws(()=>projectMinimapUpdateClock(fixture.sources[other].legacy,owner),/admission/);
  const partial=entry.legacy.replace(fixture.changes[0].before,fixture.changes[0].after);assert.throws(()=>projectMinimapUpdateClock(partial,owner),/admission/);assert.throws(()=>restoreMinimapCompositeClock(partial,owner),/admission/);
  for(const bad of [entry.legacy+'\n',entry.legacy.replace(fixture.changes[0].before,''),entry.legacy+fixture.changes[0].before])assert.throws(()=>projectMinimapUpdateClock(bad,owner),/admission/);
  assert.throws(()=>restoreMinimapCompositeClock(current+'\n',owner),/admission/);
 }
 for(const cut of [0,Math.floor(packed.length/2),packed.length-1]){const bad=Buffer.from(packed);bad[cut]^=1;assert.throws(()=>readMinimapClockFixture(bad),/seal/);}
});
test('clock admission binds the actual complete producer to its build input; legacy absence stays separate',()=>{
 const producer=binding.producer,manifest={files:{[producer.manifestKey]:producer.sha256}},source={[producer.path]:producer.sha256};
 assert.equal(admitMinimapClockEpoch(source,manifest),binding.epoch);
 assert.equal(admitMinimapClockEpoch({}, {files:{}}),'legacy-composite-credit');
 for(const bad of [{},{[producer.path]:'0'.repeat(64)}])assert.throws(()=>admitMinimapClockEpoch(bad,manifest),/producer input/);
 assert.throws(()=>admitMinimapClockEpoch(source,{files:{[producer.manifestKey]:'0'.repeat(64)}}),/producer input/);
 assert.throws(()=>admitMinimapClockEpoch(source,{files:{}}),/absent/);
 const actual=hash(fs.readFileSync(new URL('../../'+producer.path,import.meta.url)));assert.equal(actual,producer.sha256);
});
test('newborn FX cannot inherit pre-birth compose credit; frozen legacy counterexample still fails',()=>{
 for(const [owner,entry]of Object.entries(fixture.sources)){
  const legacy=clockFixture(entry.legacy),current=clockFixture(projectMinimapUpdateClock(entry.legacy,owner));
  for(const f of [legacy,current]){f.m.update(1/60);f.birth();f.m.update(1/60);}
  assert.equal(current.fxList[0].t,1/60);assert.equal(legacy.fxList[0].t,1/30);
  assert.throws(()=>assert.deepEqual(current.draws.at(-1),legacy.draws.at(-1)),assert.AssertionError);
 }
});
test('zero-time force never ages FX and slow/hidden updates conserve actual elapsed time',()=>{
 for(const [owner,entry]of Object.entries(fixture.sources)){
  const legacy=clockFixture(entry.legacy),current=clockFixture(projectMinimapUpdateClock(entry.legacy,owner));
  for(const f of [legacy,current]){f.m._composeAcc=.12;f.birth();f.m.update(0,true);}
  assert.equal(current.fxList[0].t,0);assert.equal(legacy.fxList[0].t,.12);
  assert.throws(()=>assert.deepEqual(current.draws.at(-1),legacy.draws.at(-1)),assert.AssertionError);
  const slow=clockFixture(projectMinimapUpdateClock(entry.legacy,owner));slow.birth();slow.m.update(.5);assert.equal(slow.fxList[0].t,.5);
  const stale=clockFixture(entry.legacy);stale.birth();stale.m.update(.5);assert.equal(stale.fxList[0].t,.12);
  assert.throws(()=>assert.deepEqual(slow.draws.at(-1),stale.draws.at(-1)),assert.AssertionError);
  slow.m.tickHidden(.1);assert.equal(slow.fxList[0].t,.6);slow.m.update(.1);assert.equal(slow.fxList.length,0);
 }
});
