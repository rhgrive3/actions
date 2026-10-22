import test from 'node:test';
import assert from 'node:assert/strict';
import {actualModule,json} from './added-actual-module.mjs';
const fused=`    if(!candidate)continue;
    let duplicate=false,recent=0;
    for(const proof of store) {
      if(proof.key===candidate.key){duplicate=true;break;}
      if(proof.actor===candidate.actor && t-proof.at<1)recent++;
    }
    if(duplicate)continue;`;
const oldRecord=source=>source.replace(fused,'    if(!candidate || store.some(p=>p.key===candidate.key))continue;')
 .replace('    if(recent>=rate)continue;',`    let recent=0;
    for(const shot of store)if(shot.actor===candidate.actor && t-shot.at<1)recent++;
    if(recent>=rate)continue;`);
const oldPrune=source=>source.replace(`  // combatAdmission is take's sole entry and already prunes at this same t.
  const s=state(nm);`,`  const s=state(nm);prune(s,t);`);
async function load(transform=s=>s){return actualModule('patches/network-replication/combat-provenance.mjs',{
 transform:s=>transform(s).replace('function prune(s,t) {','function prune(s,t) { globalThis.prunes++;'),
 extra:'export {record,prune,state};',globals:{prunes:0}});}
function net(){
 const actor={nid:1,owner:'peer',remote:true,alive:true,team:0,pos:{x:0,y:0,z:0},weapon:{id:'shooter',kind:'shooter',range:35,fireInterval:.12,damage:36}};
 return{cfg:{id:'m'},byNid:new Map([[1,actor],[2,{nid:2,owner:'local',remote:false,alive:true,team:1,pos:{x:0,y:0,z:5}}]])};
}
const packet=(events,ts=100)=>({ts,a:[[1,0,0,0]],e:events});
const shot=(n,at=100)=>[at,'p',1,'shot','shooter',0,1,n*.01,0,0,45];
const fire=(n,at=100)=>[at,'ev','weapon:fire',{actor:{n:1},weapon:'shooter',muzzle:[0,1,n*.01],dir:[0,0,45]}];
function snapshot(m){const s=m._combatProvenance;return s?{proofs:[...s.proofs],pending:[...s.pending],contacts:[...s.contacts]}:null;}

test('actual record fused scan preserves duplicate/pairing/rate/order and cap outcomes over deterministic streams',async()=>{
 const before=await load(oldRecord),after=await load();assert(before.source.includes(fused));
 let random=0x12345678;const rnd=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
 for(let trial=0;trial<180;trial++){
  const a=net(),b=net();
  for(let batch=0;batch<5;batch++){
   const at=100+batch*.3,events=[];
   for(let i=0;i<Math.floor(rnd()*257);i++){
    const n=Math.floor(rnd()*20),time=at-rnd()*1.6;
    events.push(rnd()<.3?fire(n,time):shot(n,time));
    if(rnd()<.3)events.push(fire(n,time+.005));
    if(events.length>=256){events.length=256;break;}
   }
   before.api.record(a,'peer',packet(events,at),at);after.api.record(b,'peer',packet(events,at),at);
   assert.deepEqual(json(snapshot(b)),json(snapshot(a)),'same keys, pairedFire, order and timestamps');
  }
 }
 for(const count of [0,1,159,160,161,256]){
  const a=net(),b=net(),entries=Array.from({length:count},(_,i)=>({actor:i%2?1:3,at:99.1,kind:'special',key:'prior-'+i,uses:0,maxUses:2}));
  before.api.state(a).proofs.set('peer',structuredClone(entries));after.api.state(b).proofs.set('peer',structuredClone(entries));
  before.api.record(a,'peer',packet([shot(500)]),100);after.api.record(b,'peer',packet([shot(500)]),100);
  assert.deepEqual(json(snapshot(b)),json(snapshot(a)));
 }
});

test('actual combat admission prunes once with identical boundary maps, including invalid candidates',async()=>{
 const before=await load(oldPrune),after=await load();
 for(const delta of [-.001,0,.95,1.2,3.5,10,10.001]){
  const a=net(),b=net();
  for(const [module,nm]of [[before,a],[after,b]]){
   const s=module.api.state(nm);s.proofs.set('other',[{at:100,kind:'main'},{at:100,kind:'special'}]);s.pending.set('other',[{at:100}]);s.contacts.set('key',{at:100});
  }
  const d={m:'m',a:1,v:2,h:1,l:0,d:36,w:'shooter'};
  const x=before.api.combatAdmission(a,'peer',d,'pvp',100+delta),y=after.api.combatAdmission(b,'peer',d,'pvp',100+delta);
  assert.equal(x,y);assert.deepEqual(json(snapshot(b)),json(snapshot(a)));
 }
 assert.equal(before.context.prunes,14);assert.equal(after.context.prunes,7);
 const wrong={m:'wrong',a:1,v:2,h:1,l:0,d:36,w:'shooter'};
 after.api.combatAdmission(net(),'peer',wrong,'pvp',100);assert.equal(after.context.prunes,8,'rejected envelope still performs its existing first cleanup');
 assert.equal(after.source.match(/return take\(/g)?.length,1,'take keeps its sole pruned entry');
});

test('retention reuse proposal changes a retained outer proof array across a later no-op and append',async()=>{
 const original=await load(),reuse=await load(s=>s.replace('store.slice(-MAX_PROOFS)','store.length>MAX_PROOFS?store.slice(-MAX_PROOFS):store'));
 const run=module=>{
  const nm=net();module.api.record(nm,'peer',packet([shot(0)]),100);
  const retained=nm._combatProvenance.proofs.get('peer');
  module.api.record(nm,'peer',packet([]),100);
  module.api.record(nm,'peer',packet([shot(10,100.1)],100.1),100.1);
  return{retained:retained.length,stored:nm._combatProvenance.proofs.get('peer').length};
 };
 assert.deepEqual(run(original),{retained:1,stored:2});assert.deepEqual(run(reuse),{retained:2,stored:2});
 assert(original.source.includes('store.slice(-MAX_PROOFS)'),'the ownership-changing candidate is not installed');
});

test('retention reuse changes real admission under a synchronous geometry reentry',async()=>{
 const original=await load(),reuse=await load(s=>s.replace('store.slice(-MAX_PROOFS)','store.length>MAX_PROOFS?store.slice(-MAX_PROOFS):store'));
 const run=module=>{
  const nm=net();module.api.record(nm,'peer',packet([shot(0)]),100);let nested=false;
  class V{set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}}
  nm._combatProvenanceTHREE={Vector3:V};
  nm._combatProvenancePhysics={los(from){
   if(!nested){nested=true;module.api.record(nm,'peer',packet([]),100);module.api.record(nm,'peer',packet([shot(10,100.01)],100.01),100);}
   return from.z===.1;
  }};
  return module.api.combatAdmission(nm,'peer',{m:'m',a:1,v:2,h:1,l:0,d:36,w:'shooter'},'pvp',100);
 };
 assert.equal(run(original),false,'retained outer traversal cannot see proof appended to the replacement');
 assert.equal(run(reuse),true,'candidate exposes the appended proof to an already active admission traversal');
});
