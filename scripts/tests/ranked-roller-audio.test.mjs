import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {proveRankedRollAudio} from '../lib/ranked-roller-audio.mjs';

// Clock/transport fixtures exercise the exact serialized callbacks. Real
// gameplay, relay and WebAudio are covered separately by the browser checker.
function fixture({positiveAfter=6,delta={},drop=false,replaceSession=false,initialFrozen=false,tickFrames=3}={}) {
  let frames=0,guestFrames=0,keys=[],released=0;
  const actors=[false,true].map(remote=>({nid:7,remote,alive:true,owner:'owner',netLife:1,_adoptionSequence:0,
    pos:{toArray:()=>[frames/60,0,0]},net:{_adoptionSeq:0}}));
  const contexts=actors.map((a,index)=>{
    const G={time:0,match:{local:a},netm:{byNid:new Map([[7,a]]),s:{}},game:{frozen:initialFrozen}};
    G.game.debug={freeze:()=>G.game.frozen=true,unfreeze:()=>G.game.frozen=false};
    G.game._frame=()=>{
      assert.equal(G.game.frozen,true,'async waiting cannot run an unbounded native clock');
      if(index===0){assert(keys.includes('KeyS'));frames++;G.time+=1/60;
        if(frames%tickFrames===0){a._adoptionSequence++;if(!drop)actors[1].net._adoptionSeq=a._adoptionSequence;}
      }else guestFrames++;
    };
    return vm.createContext({RG:G,__rankedReplication:{read:()=>({nid:7,ready:true,remote:true,alive:true,
      owner:a.owner,sampledOwner:a.owner,life:a.netLife,sampledLife:a.netLife,
      acceptedSequence:a.net._adoptionSeq,proof:{sequence:a.net._adoptionSeq},held:true,grounded:true,
      suspended:false,f:16,near:true,rollLoop:true,audioState:'running',
      realRollLoops:[{playing:true,registered:true,volume:frames>=positiveAfter?.4:0}],...delta})}});
  });
  const pages=contexts.map(context=>({evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',context)(arg),
    waitForFunction:async(fn,arg,options)=>{
      assert.equal(options.timeout,30000);
      if(replaceSession)context.RG.netm.s={};
      const value=vm.runInContext('('+fn.toString()+')',context)(arg);
      if(!value)throw Error('acceptance timeout');
      return {dispose:async()=>{}};
    }}));
  const setInput=async(_page,fire,next=[])=>{assert.equal(fire,true);keys=next;if(!keys.length)released++;};
  const receipts=[];
  return {contexts,run:()=>proveRankedRollAudio(...pages,7,setInput,r=>receipts.push(structuredClone(r))),receipts,
    state:()=>({frames,guestFrames,keys,released})};
}
test('slow relay waits consume no owner frames; a fresh live positive voice is required and clocks restore',async()=>{
  const f=fixture(),remote=await f.run();assert(remote.realRollLoops[0].volume>0);
  assert.equal(f.state().frames,6);assert.equal(f.state().released,3);assert.deepEqual(f.state().keys,[]);
  assert.equal(f.receipts.at(-1).status,'passed');
  for(const c of f.contexts){assert.equal(c.RG.game.frozen,false);assert.equal(c.__rankedRollClock,undefined);}
});
test('missing positive audio fails within fifteen owner frames and restores already frozen clocks',async()=>{
  const f=fixture({positiveAfter:Infinity,initialFrozen:true});
  await assert.rejects(f.run(),/No live positive remote roller audio/);
  assert.equal(f.state().frames,15);assert.equal(f.state().released,6);assert.deepEqual(f.state().keys,[]);
  assert.equal(f.receipts.at(-1).status,'failed');
  for(const c of f.contexts){assert.equal(c.RG.game.frozen,true);assert.equal(c.__rankedRollClock,undefined);}
});
test('snapshot tick boundaries are observed rather than assumed to fall on the third frame',async()=>{
  const f=fixture({tickFrames:5});await f.run();assert.equal(f.state().frames,10);
  assert.deepEqual(f.receipts.at(-1).batches.map(b=>b.sent.frames),[5,5]);
});
test('stale, suspended, distant and non-live voices cannot satisfy the paired native clock proof',async()=>{
  for(const delta of [{sampledOwner:'other'},{sampledLife:0},{acceptedSequence:0},{proof:{sequence:-1}},
    {suspended:true},{f:16|(1<<28)},{grounded:false},{near:false},{audioState:'suspended'},
    {realRollLoops:[]},{realRollLoops:[{playing:true,registered:false,volume:1}]},
    {realRollLoops:[{playing:false,registered:true,volume:1}]}]){
    const f=fixture({positiveAfter:0,delta});await assert.rejects(f.run(),/No live positive remote roller audio/);
    assert.equal(f.state().frames,15,JSON.stringify(delta));
  }
});
test('missing delivery and a replaced native session fail instead of extending movement or passing',async()=>{
  for(const options of [{drop:true},{replaceSession:true}]){
    const f=fixture(options);await assert.rejects(f.run(),/acceptance timeout|receiver clock changed/);
    assert.equal(f.state().frames,3);assert.deepEqual(f.state().keys,[]);
    assert.equal(f.receipts.at(-1).status,'failed');
    for(const c of f.contexts)assert.equal(c.RG.game.frozen,false);
  }
});
