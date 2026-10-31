import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { OWNED_RANKED_FRAME, OWNED_RANKED_ACTOR } from '../runtime/ranked/frame-ownership.mjs';
import { bindRankedInput } from '../runtime/ranked/pose-admission.mjs';
import { withRainmakerReleaseCompletion, recordRainmakerReleaseCompletion, completedRainmakerRelease,
  clearRainmakerReleaseCompletion, admitRainmakerHostEvents, beginRainmakerDeviceShot } from '../runtime/ranked/rainmaker-device-contact.mjs';

// Scalar trusted-hook contract only. Real native holder/release/network/contact
// positives and failure cases live in the independent three-peer tests.
function rig(){
 const actor={nid:301,owner:'source',team:0,remote:true,alive:true,netLife:0,net:{lastLife:0}};
 const match={state:'playing',mode:'rainmaker',paused:false,follower:false,actors:[actor]};
 const session={myId:'host',hostId:'host',_members:new Map([['host',{}],['source',{}]])};
 const nm={s:session,match,cfg:{id:'completion-contract'},myId:'host',isHost:true,byNid:new Map([[301,actor]]),rankedInputs:new Map(),_rankedAPI:{G:{}}};nm._rankedAPI.G.netm=nm;
 const data={id:0,actorId:'301',team:0,pos:[0,0,0],aim:[0,0,1],charge:1,
  shotOrigin:{actorId:'301',team:0,owner:'source',life:0,body:[0,.7,0],muzzle:[0,.7,.5]},damage:60};
 const engine=Object.assign(Object.create(RankedEngine.prototype),{elapsed:10,events:[],rule:{state:{carrier:'301',charge:{pending:data}}}});match.ranked=engine;
 const row={id:'301',pos:[0,0,0],owner:'source',team:0,life:0,alive:true,swimming:false};row[OWNED_RANKED_ACTOR]=row.pos;
 const frame={inputs:{},actors:[row]};frame[OWNED_RANKED_FRAME]=frame.inputs;match._rankedFrameScratch={frame};engine.frame=frame;
 nm.rankedInputs.set('301',bindRankedInput({seq:1},actor,match,nm));
 const f={actor,match,session,nm,data,engine,frame};
 f.event=()=>{engine.event('rainmaker-shot',data);return engine.events.at(-1);};
 f.run=fn=>withRainmakerReleaseCompletion(nm,match,frame,fn);
 return f;
}
test('exact native event0 gains a fact only after successful owned completion, independently of presentation consumption',()=>{
 const f=rig();let e;f.run(()=>{e=f.event();assert.equal(completedRainmakerRelease(f.nm,e),false);});
 assert.equal(e.id,0);assert.equal(completedRainmakerRelease(f.nm,e),true);
 admitRainmakerHostEvents(f.nm,f.match,[e],'host');assert(beginRainmakerDeviceShot(f.nm,f.match,e));
 assert.equal(beginRainmakerDeviceShot(f.nm,f.match,e),null,'presentation event ticket is single-use');
 assert.equal(completedRainmakerRelease(f.nm,e),true,'wire fact is not that consumed ticket');
 assert.equal(completedRainmakerRelease(f.nm,{...e}),false);assert.equal(completedRainmakerRelease(f.nm,structuredClone(e)),false);
});
test('bare events, direct record calls, copied frames/actors and unbound input cannot create completion',()=>{
 for(const mutate of [f=>delete f.frame[OWNED_RANKED_FRAME],f=>delete f.frame.actors[0][OWNED_RANKED_ACTOR],f=>f.nm.rankedInputs.set('301',{}),f=>f.engine.rule.state.carrier='other']){
  const f=rig();mutate(f);let e;f.run(()=>{e=f.event();});assert.equal(completedRainmakerRelease(f.nm,e),false);
 }
 const f=rig(),e=f.event();assert.equal(recordRainmakerReleaseCompletion(f.engine,e,f.data),false);assert.equal(completedRainmakerRelease(f.nm,e),false);
 admitRainmakerHostEvents(f.nm,f.match,[e],'host');assert.equal(beginRainmakerDeviceShot(f.nm,f.match,e),null);
});
test('callback return and throw identities are preserved; failed, thenable and throwing-getter results never publish',()=>{
 for(const value of [undefined,null,0,false,{},'result']){const f=rig();assert.equal(f.run(()=>value),value);}
 const f=rig(),error=new Error('native sentinel');let e;assert.throws(()=>f.run(()=>{e=f.event();throw error;}),x=>x===error);assert.equal(completedRainmakerRelease(f.nm,e),false);assert(f.engine.events.includes(e),'native queue remains intact');
 for(const value of [{then(){}},{get then(){throw error;}}]){const g=rig();let ev;assert.equal(g.run(()=>{ev=g.event();return value;}),value);assert.equal(completedRainmakerRelease(g.nm,ev),false);}
 const result={};assert.equal(withRainmakerReleaseCompletion(null,null,null,()=>result),result);assert.throws(()=>withRainmakerReleaseCompletion(null,null,null,()=>{throw error;}),x=>x===error);
});
test('nested successful release cannot escape failed outer update, and later normal ticks cannot bless old queued events',()=>{
 const f=rig(),error=new Error('outer');let e;assert.throws(()=>f.run(()=>{f.run(()=>{e=f.event();});throw error;}),x=>x===error);assert.equal(completedRainmakerRelease(f.nm,e),false);
 f.run(()=>{});assert.equal(completedRainmakerRelease(f.nm,e),false);
 f.match.state='finish';f.match.state='playing';f.nm.isHost=false;f.nm.isHost=true;f.run(()=>{});assert.equal(completedRainmakerRelease(f.nm,e),false);
});
test('completion checks current host epoch and exact signature; actual epoch retirement defeats host-role ABA',()=>{
 for(const mutate of [f=>f.nm.cfg.id='new',f=>f.nm.s={...f.session},f=>f.nm.match={...f.match},f=>f.match.ranked={},f=>f.engine.rule={...f.engine.rule},f=>f.nm.isHost=false,f=>f.session.hostId='source',f=>f.session._members.delete('host'),f=>f.nm._disposed=true]){
  const f=rig();let e;f.run(()=>{e=f.event();});assert(completedRainmakerRelease(f.nm,e));mutate(f);assert.equal(completedRainmakerRelease(f.nm,e),false);
 }
 const f=rig();let e;f.run(()=>{e=f.event();});e.damage++;assert.equal(completedRainmakerRelease(f.nm,e),false);e.damage--;clearRainmakerReleaseCompletion(f.nm);assert.equal(completedRainmakerRelease(f.nm,e),false);
 f.session.hostId='source';f.nm.isHost=false;f.session.hostId='host';f.nm.isHost=true;f.run(()=>{});assert.equal(completedRainmakerRelease(f.nm,e),false);
});
