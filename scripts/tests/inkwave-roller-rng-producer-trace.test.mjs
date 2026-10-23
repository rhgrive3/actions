import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installDeterministicRollerRandom} from '../lib/inkwave-roller-qa-random.mjs';
import {installTracedRollerRandom,installRollerProducerTrace} from '../lib/inkwave-roller-rng-producer-trace.mjs';
import {installRollerAudioKeyClockTrace} from '../lib/inkwave-roller-audio-key-clock-trace.mjs';
const rig=fn=>{const c=vm.createContext({});vm.runInContext('('+fn.toString()+')()',c);return c;};
const json=(c,s)=>JSON.parse(vm.runInContext('JSON.stringify('+s+')',c));
test('traced pre-module closure preserves all original LCG results, cached identity and reset behavior',()=>{
 const original=rig(installDeterministicRollerRandom),traced=rig(installTracedRollerRandom);
 const setup=`globalThis.cached=Math.random;globalThis.G={fx:{stats:()=>({}),dN:0}};`;
 vm.runInContext(setup,original);vm.runInContext(setup,traced);
 vm.runInContext('__rollerQaRandom.startCase({},G);__rollerQaRandom.beginTick(35)',traced);
 for(const context of [original,traced])vm.runInContext('globalThis.values=Array.from({length:2048},()=>cached())',context);
 assert.deepEqual(json(traced,'values'),json(original,'values'));
 assert.deepEqual(json(traced,'__rollerQaRandom.snapshot()'),json(original,'__rollerQaRandom.snapshot()'));
 vm.runInContext('globalThis.trace=__rollerQaRandom.finish()',traced);
 const trace=json(traced,'trace');assert.equal(trace.calls.length,2048);assert.equal(trace.stacks.length,1);
 for(const c of trace.calls)assert.equal((Math.imul(c.before,1664525)+1013904223)>>>0,c.after);
 for(const c of [original,traced]){vm.runInContext('__rollerQaRandom.reset();globalThis.first=cached()',c);assert.equal(vm.runInContext('Math.random===cached',c),true);}
 assert.equal(vm.runInContext('first',traced),vm.runInContext('first',original));
});
test('producer wrappers preserve this, return value, shared default-seed draw and native phase across clear',()=>{
 const c=rig(installTracedRollerRandom);vm.runInContext('('+installRollerProducerTrace.toString()+')()',c);
 vm.runInContext(`globalThis.G={paint:{speck(p,r,t,seed=Math.random()){return seed;}}};
 G.fx={dN:0,dP:new Float32Array(0),dV:new Float32Array(0),dA:new Float32Array(0),dK:new Float32Array(0),dC:new Float32Array(0),_iwCosmeticPhase:2,stats:()=>({}),
 clear(){this.dN=0;},onSpeck(){return G.paint.speck(null,1,0);},_updateDrops(){return this.onSpeck();},update(){this._iwCosmeticPhase=(this._iwCosmeticPhase+1)%3;return this._updateDrops();}};
 __rollerInstallProducerTrace(G);__rollerQaRandom.startCase({},G);__rollerQaRandom.reset();G.fx.clear();globalThis.phaseAfterClear=G.fx._iwCosmeticPhase;
 __rollerQaRandom.beginTick(35);__rollerQaRandom.stage('fx');globalThis.result=G.fx.update(1/60);__rollerQaRandom.endTick();globalThis.trace=__rollerQaRandom.finish();`,c);
 const trace=json(c,'trace');assert.equal(vm.runInContext('result',c),1218640798/4294967296);
 assert.equal(vm.runInContext('phaseAfterClear',c),2);assert.equal(trace.finalFx.phase,0);
 assert.equal(trace.calls.length,1);assert.deepEqual(trace.calls[0].producer,['FX.update','FX._updateDrops','FX.onSpeck','Paint.speck']);
 assert.equal(trace.calls[0].before,123);assert.equal(trace.calls[0].after,1218640798);
 assert.equal(trace.events.filter(e=>e.name==='Paint.speck').length,1);
});
test('keyed audio observer reads the actual last map while preserving native reject/accept, options, phase and RNG',()=>{
 const c=rig(installTracedRollerRandom);vm.runInContext('('+installRollerAudioKeyClockTrace.toString()+')()',c);
 vm.runInContext(`globalThis.options={pos:{x:0,y:1,z:4.88}};globalThis.G={fx:{_iwCosmeticPhase:2,dN:0,stats:()=>({})},audio:{ctx:{currentTime:1.02},last:new Map([['splat_small:cell:0:0:2',1]]),counts:{played:0,dropped:0},
 play(name,o){if(this!==G.audio||o!==options)throw Error('observer changed invocation');const key=name+':cell:0:0:2';if(this.ctx.currentTime-this.last.get(key)<.03){this.counts.dropped++;return null;}this.last.set(key,this.ctx.currentTime);this.counts.played++;return {seed:Math.random()};}}};
 __rollerInstallAudioClockTrace(G);__rollerQaRandom.startCase({},G);__rollerQaRandom.reset();__rollerQaRandom.beginTick(35);__rollerQaRandom.stage('projectiles');
 globalThis.rejected=G.audio.play('splat_small',options);G.audio.ctx.currentTime=1.04;globalThis.accepted=G.audio.play('splat_small',options);__rollerQaRandom.endTick();globalThis.trace=__rollerQaRandom.finish();`,c);
 assert.equal(vm.runInContext('rejected',c),null);assert.equal(vm.runInContext('accepted.seed',c),1218640798/4294967296);
 const events=json(c,'__rollerAudioClockEvents');assert.equal(events.length,2);assert.equal(events[0].before.key,'splat_small:cell:0:0:2');assert.equal(events[0].before.last,1);assert.equal(events[0].after.last,1);assert.equal(events[1].after.last,1.04);
 assert.equal(events[0].after.rng.draws-events[0].before.rng.draws,0);assert.equal(events[1].after.rng.draws-events[1].before.rng.draws,1);
 assert.equal(vm.runInContext('G.fx._iwCosmeticPhase',c),2);assert.equal(json(c,'trace').calls.length,1);
});
