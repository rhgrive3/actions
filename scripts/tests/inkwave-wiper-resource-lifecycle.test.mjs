import test from 'node:test';import assert from 'node:assert/strict';
import {createWiperResourceLifecycle} from '../lib/inkwave-wiper-resource-lifecycle.mjs';
const scene=objects=>({traverse:fn=>objects.forEach(fn)});
const fixture=()=>{const geo={},texture={isTexture:true};const owner={mode:null,_warmState:'done',scene:scene([{geometry:geo,material:{map:texture}}])};return {G:{renderer:{info:{memory:{geometries:283,textures:48}}},scene:scene([{geometry:geo,material:{map:texture}}])},game:{showcase:owner}};};
test('read-only owner inventory preserves shared identity and raw memory',()=>{const {G,game}=fixture(),p=createWiperResourceLifecycle(G,game);const r=p.snapshot('test');assert.deepEqual(r.owners.main,r.owners.showcase);assert.deepEqual(r.memory,G.renderer.info.memory);assert.equal(game.showcase._warmState,'done');});
test('settle waits for already-existing warm and lobby completions, not a fixed delay',async()=>{const {G,game}=fixture(),o=game.showcase;o._warmState='busy';o._warmChar={};o.lob={ready:false,failed:false,scene:scene([])};const p=createWiperResourceLifecycle(G,game);let ticks=0;await p.settle('warm',{now:()=>ticks,yieldTurn:async()=>{ticks++;o._warmState='done';o._warmChar=null;o.lob.ready=true;}});assert.equal(ticks,1);assert.deepEqual(G.renderer.info.memory,{geometries:283,textures:48});});
test('already settled resources require no delay',async()=>{const {G,game}=fixture();await createWiperResourceLifecycle(G,game).settle('ready',{yieldTurn:()=>{throw Error('unexpected wait');}});});
test('pending owner times out instead of normalizing resources',async()=>{const {G,game}=fixture();game.showcase._warmState='busy';let n=0;await assert.rejects(createWiperResourceLifecycle(G,game).settle('warm',{timeoutMs:2,now:()=>n++,yieldTurn:async()=>{}}),/timeout/);assert.equal(G.renderer.info.memory.geometries,283);});
test('failed lobby and changed showcase remain fatal',async()=>{const {G,game}=fixture();const p=createWiperResourceLifecycle(G,game);game.showcase.lob={failed:true};await assert.rejects(p.settle('fail'),/failed/);game.showcase={};assert.throws(()=>p.snapshot('change'),/owner changed/);});
import fs from 'node:fs';
test('fixed runner gates existing owners before warm and first native step without weakening pair equality',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-wiper-plane-native.mjs',import.meta.url),'utf8');
 assert(s.indexOf("settle('range-ready')")<s.indexOf('for(let i=0;i<60;i++)'));
 assert(s.indexOf("settle('after-native-warm')")>s.indexOf('for(let i=0;i<60;i++)'));
 assert(s.indexOf("settle('pre-tick-zero')")<s.indexOf('aim();g.debug.fire(tick<'));
 assert(s.includes("records:setup.resourceLifecycle"));assert(s.includes("records:row.resourceLifecycle"));
 assert(!s.includes('info.memory ='));assert(!s.includes('info.memory.geometries ='));
});
for(const replacement of [null,{ready:true}])test('pending lobby cannot vanish or be replaced during settle: '+JSON.stringify(replacement),async()=>{
 const {G,game}=fixture();const original={ready:false,failed:false};game.showcase.lob=original;
 await assert.rejects(createWiperResourceLifecycle(G,game).settle('lobby',{yieldTurn:async()=>{game.showcase.lob=replacement;}}),/lobby owner changed/);
 assert.equal(original.ready,false);
});
for(const replacement of [null,{}])test('busy warm owner cannot vanish or be replaced: '+JSON.stringify(replacement),async()=>{
 const {G,game}=fixture();game.showcase._warmState='busy';game.showcase._warmChar={};
 await assert.rejects(createWiperResourceLifecycle(G,game).settle('warm',{yieldTurn:async()=>{game.showcase._warmChar=replacement;}}),/warm owner changed/);
});
test('warm replacement cannot masquerade as done',async()=>{
 const {G,game}=fixture();game.showcase._warmState='busy';game.showcase._warmChar={};
 await assert.rejects(createWiperResourceLifecycle(G,game).settle('warm',{yieldTurn:async()=>{game.showcase._warmChar={};game.showcase._warmState='done';}}),/warm owner changed/);
});
import {isWiperResourceLifecycleWarning} from '../lib/inkwave-wiper-resource-lifecycle.mjs';
test('actual showcase compile warning labels remain failures despite done state',()=>{
 for(const s of ['[showcase] warm-up Error: rejected','[showcase] lobby set warm-up Error: rejected'])assert.equal(isWiperResourceLifecycleWarning(s),true);
 for(const s of ['[showcase] warm-upper','[showcase] unrelated','unrelated warning',null])assert.equal(isWiperResourceLifecycleWarning(s),false);
 const runner=fs.readFileSync(new URL('../check-inkwave-wiper-plane-native.mjs',import.meta.url),'utf8');
 assert(runner.includes("m.type()==='warning'&&isWiperResourceLifecycleWarning(m.text())"));
 assert(runner.includes('assert.deepEqual(errors,[])'));
});
test('late renderer allocation is visible without inventing scene attribution',()=>{
 const {G,game}=fixture();G.renderer.info.render={frame:1559};const p=createWiperResourceLifecycle(G,game);p.snapshot('pre-tick-zero:settled');const owners=p.records[0].owners;
 G.renderer.info.memory.geometries+=4;G.renderer.info.memory.textures+=5;G.renderer.info.render.frame+=2;
 const row=p.observeBoundary('native:2:before');assert.deepEqual(row.memoryDeltaSincePrevious,{geometries:4,textures:5});assert.equal(row.rendererFrame,1561);assert.deepEqual(row.owners,owners);assert.match(row.attribution,/Unattributed/);
});
test('boundary observation is passive and keeps existing frames, memory and owners',()=>{
 const {G,game}=fixture();G.renderer.info.render={frame:1561};G.renderer.render=()=>{throw Error('must not render');};G.renderer.dispose=()=>{throw Error('must not dispose');};const p=createWiperResourceLifecycle(G,game);const memory=G.renderer.info.memory,render=G.renderer.info.render,owner=game.showcase;
 const before=JSON.stringify({memory,render});p.observeBoundary('inspection:2:front:before');p.observeBoundary('inspection:2:front:after');assert.equal(JSON.stringify({memory,render}),before);assert.equal(game.showcase,owner);assert.equal(G.renderer.info.memory,memory);assert.equal(G.renderer.info.render,render);assert.deepEqual(p.records[1].memoryDeltaSincePrevious,{geometries:0,textures:0});
});
test('native and inspection boundaries preserve capture order and original timestamps',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-wiper-plane-native.mjs',import.meta.url),'utf8');
 const before=s.indexOf("observeBoundary('native:2:before')"),step=s.indexOf('g._frame(1/60);const frameCpuMs'),after=s.indexOf("observeBoundary('native:2:after')");assert(before>=0&&step>=0&&after>=0,'All native observation/step anchors must exist');assert(before<step&&step<after);
 assert(s.includes("if(tick===2)window.__wiperResources.observeBoundary('native:2:before');"));
 assert(s.includes("if(tick===2)window.__wiperResources.observeBoundary('native:2:after');"));
 assert(s.includes("observeBoundary('inspection:'+tick+':'+view+':before');const renderStart=performance.now();r.render(G.scene,camera);const submitEnd=performance.now();window.__wiperResources.observeBoundary('inspection:'+tick+':'+view+':after');"));
 assert(s.indexOf("observeBoundary('inspection:'+tick+':'+view+':after')")<s.indexOf('gl.readPixels(0,0,'));
 assert(s.includes('window.__wiperResources.records.slice(resourceRecordStart)'));assert(s.includes("throw Error('Inspection render changed gameplay camera/physics/aim/clock/RNG')"));
});
