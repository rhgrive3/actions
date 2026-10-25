import test from 'node:test';
import assert from 'node:assert/strict';
import {packWipeoutTimeline,acceptWipeoutTimeline,replayWipeoutConfirmations,acceptWipeoutConfirmation}
  from '../../splatoon3/runtime/disconnect-fidelity.mjs';
function fixture(){
  const actors=Array.from({length:8},(_,nid)=>({nid,team:nid<4?0:1,owner:'host',remote:false,alive:true,netLife:1}));
  const match={mode:'turf',state:'playing',time:170,duration:180,actors};
  const sent=[],nm={myId:'host',isHost:true,cfg:{id:'m'},match,byNid:new Map(actors.map(a=>[a.nid,a])),
    s:{hostId:'host',_members:new Map([['host',{}]])},_sendNow:d=>{sent.push(d.key);return true;}};
  nm._matchStateAPI={G:{netm:nm,match},emit(){}};
  return{nm,sent,match,actors};
}
test('unchanged owner history shares immutable wire data while append and rejected rewrites remain isolated',()=>{
  const {nm,match,actors}=fixture(),first=packWipeoutTimeline(nm),owned=nm._wipeoutLedger.rows.get(0).h;
  match.time-=1/60;const second=packWipeoutTimeline(nm);
  assert.equal(first.rows[0].h,second.rows[0].h);assert.ok(Object.isFrozen(second.rows[0].h[0]));
  assert.equal(nm._wipeoutLedger.rows.get(0).h,owned);
  actors[0].alive=false;match.time-=1/60;const third=packWipeoutTimeline(nm);
  assert.notEqual(third.rows[0].h,first.rows[0].h);assert.equal(first.rows[0].h.length,1);assert.equal(third.rows[0].h.length,2);
  const before=structuredClone(nm._wipeoutLedger.rows.get(0)),forged=structuredClone(third);
  forged.rows[0].q++;forged.rows[0].h[0][1]=999;
  acceptWipeoutTimeline(nm,'host',forged);assert.deepEqual(nm._wipeoutLedger.rows.get(0),before);
});
test('confirmation recovery shares a two-per-second room budget, is fair and retains refused sends',()=>{
  const {nm,sent}=fixture();
  for(let i=1;i<=12;i++)acceptWipeoutConfirmation(nm,'host',{k:'wc',m:'m',team:0,key:`0:0/${i}/${i},1/${i}/${i},2/${i}/${i},3/${i}/${i}`});
  let refused=true;nm._sendNow=d=>{if(refused){refused=false;return false;}sent.push(d.key);return true;};
  replayWipeoutConfirmations(nm,0);assert.equal(sent.length,0);
  for(let i=1;i<=600;i++)replayWipeoutConfirmations(nm,i/60);
  assert.ok(sent.length<=20&&sent.length>=19);assert.equal(new Set(sent).size,12);
  assert.equal(sent[0],[...nm._wipeoutLedger.confirmed.keys()][0],'the refused first decision is retried');
  const before=sent.length;nm.isHost=false;replayWipeoutConfirmations(nm,11);assert.equal(sent.length,before);
  nm.isHost=true;replayWipeoutConfirmations(nm,12);assert.equal(sent.length,before+1);
});
