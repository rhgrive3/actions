import test from 'node:test';
import assert from 'node:assert/strict';
import {idleFixture,audioFixture} from './idle-fixture.mjs';
import {adaptInputLensQueue} from '../input-lens-queue-adapter.mjs';
import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

function fixture(rate) {
  const f = audioFixture(), nodes = [], buffers = [];
  f.ctx.sampleRate = rate;
  for (const method of ['createGain','createBiquadFilter','createDynamicsCompressor','createDelay','createStereoPanner','createConvolver']) {
    const make = f.ctx[method];
    f.ctx[method] = (...args) => {
      const n = make(...args), row = {method,args,edges:[],node:n};
      // Non-filter nodes have no type. Avoid the generic audio double creating
      // a fresh callable AudioParam proxy when the graph observer reads it.
      n.type = undefined;
      nodes.push(row);
      n.connect = other => row.edges.push(nodes.findIndex(x=>x.node===other));
      if (method === 'createConvolver') Object.defineProperty(n,'buffer',{get:()=>buffers.at(-1),set:value=>buffers.push(value),configurable:true});
      return n;
    };
  }
  return {...f,nodes,buffers};
}
function graph(f) {
  return f.nodes.map(({method,args,edges,node})=>({method,args,edges,
    type:typeof node.type === 'string' ? node.type : null, gain:node.gain.value, frequency:node.frequency.value,Q:node.Q.value,
    pan:node.pan.value,delay:node.delayTime.value, threshold:node.threshold.value,
    knee:node.knee.value,ratio:node.ratio.value,attack:node.attack.value,release:node.release.value}));
}
test('actual lazy music FX preserves node topology, parameters and every deterministic IR sample',async()=>{
  for (const rate of [44100,48000,96000]) {
    const old = fixture(rate), next = fixture(rate);
    const a = await idleFixture({globals:old.globals}), b = await idleFixture({globals:next.globals,transform:adaptInputLensQueue});
    const before = new a.MusicEngine(), after = new b.MusicEngine();
    before._init(old.ctx,{}, {offline:true}); after._init(next.ctx,{}, {offline:true});
    assert.equal(next.buffers.length,0); assert.equal(after.dlyIn,null); assert.equal(next.nodes.length,4);
    after._ensureProceduralFx(); assert.deepEqual(graph(next),graph(old));
    const actualGain = next.nodes[0].node.gain.value;
    next.nodes[0].node.gain.value = actualGain + .01;
    assert.notDeepEqual(graph(next), graph(old), 'a changed real graph parameter must still fail the oracle');
    next.nodes[0].node.gain.value = actualGain;
    assert.equal(after._nodes.length,before._nodes.length);
    for(let channel=0;channel<2;channel++) assert.deepEqual(next.buffers[0].getChannelData(channel),old.buffers[0].getChannelData(channel));
    const count=next.nodes.length;after._ensureProceduralFx();assert.equal(next.nodes.length,count);
    before.dispose(); after.dispose(); assert.equal(after.dlyIn,null);
  }
});
test('procedural play builds sends before Player, and replacement context owns a fresh lazy graph',async()=>{
  const f=fixture(8000),api=await idleFixture({globals:f.globals,transform:adaptInputLensQueue}),m=new api.MusicEngine();
  m._init(f.ctx,{}, {offline:true});m.play('opening',{seed:14});
  assert.ok(m.dlyIn);assert.ok(m.revIn);assert.equal(m.players.length,1);assert.equal(f.buffers.length,1);
  const g=fixture(8000);m._init(g.ctx,{}, {offline:true});assert.equal(m.players.length,0);assert.equal(m.dlyIn,null);assert.equal(g.buffers.length,0);
  m.play('opening',{seed:14});assert.ok(m.dlyIn);assert.equal(g.buffers.length,1);m.dispose();
});
test('online init and recorded-only requests never create a procedural Worker',async()=>{
  const f=fixture(8000);
  class Audio {
    addEventListener(){} removeEventListener(){} play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}removeAttribute(){}load(){}
  }
  const api=await idleFixture({globals:{...f.globals,Audio,window:{}},transform:adaptInputLensQueue}),m=new api.MusicEngine();
  m._init(f.ctx,{});assert.equal(f.workers.size,0);m.play('battle');
  assert.equal(f.workers.size,0);assert.equal(f.intervals.size,0);assert.equal(f.buffers.length,0);assert.equal(m.dlyIn,null);
  m.dispose();assert.equal(f.workers.size,0);
});
test('full composition transfers the existing prepared IR into lazy FX and releases the pending owner',async()=>{
  const f=fixture(8000),code=adaptBuildSource('src/audio/music.js',fs.readFileSync(new URL('../../../inkwave-public/src/audio/music.js',import.meta.url),'utf8'));
  const api=await idleFixture({globals:f.globals,transform:(rel,text)=>rel==='src/audio/music.js'?code:text}),m=new api.MusicEngine();
  const impulse=f.ctx.createBuffer(2,64,8000);m._init(f.ctx,{}, {offline:true,impulse});
  assert.equal(m._preparedMusicImpulse,impulse);assert.equal(f.buffers.length,0);
  m.play('opening',{seed:14});assert.equal(f.buffers.length,1);assert.equal(f.buffers[0],impulse);assert.equal(m._preparedMusicImpulse,null);
  m.dispose();const next=fixture(8000);m._init(next.ctx,{}, {offline:true,impulse});
  assert.equal(m._preparedMusicImpulse,impulse);m.dispose();assert.equal(m._preparedMusicImpulse,null);
});
