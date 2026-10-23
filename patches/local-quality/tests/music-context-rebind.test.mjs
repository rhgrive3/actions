import test from 'node:test';
import assert from 'node:assert/strict';
import {idleFixture,audioFixture} from './idle-fixture.mjs';
import {adaptInputLensQueue} from '../input-lens-queue-adapter.mjs';
test('same music context/bus is idempotent; replacement disposes old players and connects the new bus',async()=>{
  const first=audioFixture(),second=audioFixture();
  const api=await idleFixture({globals:first.globals,transform:adaptInputLensQueue});
  const m=new api.MusicEngine(),bus1=first.ctx.createGain(),bus2=second.ctx.createGain();
  m._init(first.ctx,bus1,{offline:true});const oldOut=m.out;
  m._init(first.ctx,bus1,{offline:true});assert.equal(m.out,oldOut);
  let disposed=0;const oldPlayer={dispose(){disposed++;},pump(){}};m.players.push(oldPlayer);m.current=oldPlayer;
  m._init(second.ctx,bus2,{offline:true});assert.equal(disposed,1);assert.equal(m.ctx,second.ctx);assert.notEqual(m.out,oldOut);
  assert.equal(m.players.length,0);assert.equal(m.current,null);assert.equal(m._musicDest,bus2);
  const out2=m.out;m._init(second.ctx,bus2,{offline:true});assert.equal(m.out,out2);
  m.dispose();assert.equal(m.ctx,null);assert.equal(disposed,1);
});
test('repeated closed-context replacements leave only the current graph and dispose each retired player once',async()=>{
  const f=audioFixture(),api=await idleFixture({globals:f.globals,transform:adaptInputLensQueue}),m=new api.MusicEngine();
  let disposed=0;
  for(let i=0;i<10;i++){
    const next=audioFixture();m._init(next.ctx,next.ctx.createGain(),{offline:true});
    assert.equal(m.players.length,0);m.players.push({dispose(){disposed++;}});m.ctx.state='closed';
  }
  m.dispose();assert.equal(disposed,10);assert.equal(m.players.length,0);
});
