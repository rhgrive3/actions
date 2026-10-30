import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {actualModule,json} from './added-actual-module.mjs';
const frozenCombat=JSON.parse(fs.readFileSync(new URL('./fixtures/drive-network-before-7f863ea2.json',import.meta.url))).files['patches/network-replication/combat-provenance.mjs'];
const fused=`    if(!candidate)continue;
    let duplicate=false,recent=0;
    for(const proof of store) {
      if(proof.key===candidate.key){duplicate=true;break;}
      if(proof.actor===candidate.actor && t-proof.at<1)recent++;
    }
    if(duplicate)continue;`;
const frozenMainCapacity = [
  "const family=source.weapon?.kind;\n      maxUses=['blaster','slosher','stringer','roller','brush'].includes(family)?6:2;",
  "maxUses=['blaster','slosher','stringer','roller','brush'].includes(source.weapon?.kind)?6:2;",
];
const frozenPresentationAnchor='    const actor=ownerActor(nm,from,candidate.actor);\n    const interval=actor?.weapon?.fireInterval;';
function reviewedSingleRoundPolicy(source) {
  // Keep the frozen scan independent, but compare both scans under the later
  // reviewed single-round admission policy. Do not alter the historical file.
  const capacity = "maxUses=!source.weapon?0:['shooter','dualies','splatling'].includes(source.weapon.catalogRecord?.family||source.weapon.behaviorKind||source.weapon.kind)?1:['blaster','slosher','stringer','roller','brush'].includes(source.weapon.kind)?6:2;";
  for(const anchor of frozenMainCapacity) {
    assert.equal(source.split(anchor).length,2,'one frozen main-capacity anchor');
    source=source.replace(anchor,capacity);
  }
  assert.equal(source.split(frozenPresentationAnchor).length,2,'one frozen projectile-presentation anchor');
  source=source.replace(frozenPresentationAnchor,`    const actor=ownerActor(nm,from,candidate.actor);
    if(candidate.src==='ev'&&candidate.kind==='main'&&['shooter','dualies','splatling'].includes(actor?.weapon?.catalogRecord?.family||actor?.weapon?.behaviorKind||actor?.weapon?.kind))continue;
    const interval=actor?.weapon?.fireInterval;`);
  return source;
}
const oldRecord=_source=>reviewedSingleRoundPolicy(frozenCombat).replace(fused,'    if(!candidate || store.some(p=>p.key===candidate.key))continue;')
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
function snapshot(m){const s=m._combatProvenance;return s?{proofs:[...s.proofs].map(([peer,rows])=>[peer,rows.map(p=>{
 // Compare the frozen scan policy; receiver-only native crab trace metadata
 // added later is verified against actual flight in crablet-native-trajectory.
 const {firePose,beamLength,beamCharge,...policy}=p;return policy;
})]),pending:[...s.pending],contacts:[...s.contacts]}:null;}

test('reference policy retains single-round, penetrating and area capacities on both main event routes',async()=>{
 const before=await load(oldRecord),after=await load();
 const cases=[
  ...['shooter','dualies','splatling'].flatMap(family=>[
   [{kind:family},1],
   [{kind:'blaster',catalogRecord:{id:'catalog-'+family,family}},1],
   [{kind:'shooter',behaviorKind:family},1],
  ]),
  [{kind:'charger'},2],...['blaster','slosher','stringer','roller','brush'].map(kind=>[{kind},6]),
  [{kind:'splatana'},2],[{kind:'brella'},2],
 ];
 for(const [definition,capacity]of cases)for(const route of ['birth','fire']){
  const a=net(),b=net();
  for(const nm of [a,b])Object.assign(nm.byNid.get(1).weapon,definition);
  const id=definition.catalogRecord?.id||'shooter',event=route==='birth'?shot(0):fire(0);
  if(route==='birth')event[4]=id;else event[3].weapon=id;
  before.api.record(a,'peer',packet([event]),100);after.api.record(b,'peer',packet([event]),100);
  assert.deepEqual(json(snapshot(b)),json(snapshot(a)),JSON.stringify([definition,route]));
  const requiresBirth=route==='fire'&&['shooter','dualies','splatling'].includes(definition.catalogRecord?.family||definition.behaviorKind||definition.kind);
  if(requiresBirth)assert.equal(b._combatProvenance.proofs.size,0,'projectile presentation cannot replace a birth');
  else assert.equal(b._combatProvenance.proofs.get('peer')[0].maxUses,capacity);
 }
 // Sub explosions and special births keep their separate multi-contact budget.
 for(const cause of ['bomb','storm']){
  const a=net(),b=net();for(const nm of [a,b])Object.assign(nm.byNid.get(1).weapon,{sub:'bomb',special:'storm'});
  const event=shot(0);event[4]=cause;
  before.api.record(a,'peer',packet([event]),100);after.api.record(b,'peer',packet([event]),100);
  assert.deepEqual(json(snapshot(b)),json(snapshot(a)));assert.equal(b._combatProvenance.proofs.get('peer')[0].maxUses,8);
 }
 const a=net(),b=net(),event=shot(0);event[4]=0;
 for(const nm of [a,b])nm.byNid.get(1).weapon=null;
 before.api.record(a,'peer',packet([event]),100);after.api.record(b,'peer',packet([event]),100);
 assert.deepEqual(json(snapshot(b)),json(snapshot(a)));assert.equal(b._combatProvenance.proofs.get('peer')[0].maxUses,0);
});

test('frozen pre-security capacity is a negative control, and its policy bridge rejects missing or duplicate anchors',async()=>{
 const stale=await load(()=>frozenCombat),reference=await load(oldRecord),current=await load();
 const states=[];
 for(const module of [stale,reference,current]){
  const nm=net();module.api.record(nm,'peer',packet([shot(0),fire(0,100.005)]),100.005);
  states.push(json(snapshot(nm)));
 }
 assert.notDeepEqual(states[0],states[2],'the historical two-use Shooter policy must not be the current oracle');
 assert.deepEqual(states[1],states[2],'the independent old scan retains all paired proof fields under the current policy');
 assert.equal(states[0].proofs[0][1][0].maxUses,2);assert.equal(states[2].proofs[0][1][0].maxUses,1);
 assert.equal(states[2].proofs[0][1].length,1);assert.equal(states[2].proofs[0][1][0].pairedFire,true);
 for(const anchor of frozenMainCapacity){
  assert.throws(()=>reviewedSingleRoundPolicy(frozenCombat.replace(anchor,'')),/one frozen main-capacity anchor/);
  assert.throws(()=>reviewedSingleRoundPolicy(frozenCombat+anchor),/one frozen main-capacity anchor/);
 }
 assert.throws(()=>reviewedSingleRoundPolicy(frozenCombat.replace(frozenPresentationAnchor,'')),/one frozen projectile-presentation anchor/);
 assert.throws(()=>reviewedSingleRoundPolicy(frozenCombat+frozenPresentationAnchor),/one frozen projectile-presentation anchor/);
});

test('the aligned reference and actual admission reject a second body claim from one Shooter proof',async()=>{
 const stale=await load(()=>frozenCombat),reference=await load(oldRecord),current=await load(),outcomes=[];
 for(const module of [stale,reference,current]){
  const nm=net();nm.byNid.set(3,{nid:3,owner:'local',remote:false,alive:true,team:1,pos:{x:0,y:0,z:7}});
  module.api.record(nm,'peer',packet([shot(0)]),100);
  const claim=(v,h)=>module.api.combatAdmission(nm,'peer',{m:'m',a:1,v,h,l:0,d:36,w:'shooter'},'pvp',100);
  outcomes.push([claim(2,1),claim(3,2),nm._combatProvenance.proofs.get('peer')[0].uses]);
 }
 assert.deepEqual(outcomes,[[true,true,2],[true,false,1],[true,false,1]]);
});

test('actual record fused scan preserves duplicate/pairing/rate/order and cap outcomes over deterministic streams',async()=>{
 const before=await load(oldRecord),after=await load();assert(frozenCombat.includes(fused));
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
 const original=await load(),reuse=await load(s=>s.replace('if(store.length)s.proofs.set(from,store.slice(-MAX_PROOFS));return acceptedProof;', 'if(store.length)s.proofs.set(from,store.length>MAX_PROOFS?store.slice(-MAX_PROOFS):store);return acceptedProof;'));
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
 const original=await load(),reuse=await load(s=>s.replace('if(store.length)s.proofs.set(from,store.slice(-MAX_PROOFS));return acceptedProof;', 'if(store.length)s.proofs.set(from,store.length>MAX_PROOFS?store.slice(-MAX_PROOFS):store);return acceptedProof;'));
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
test('caching main cause across proof candidates changes admission when an earlier LOS callback changes the live weapon',async()=>{
 const clause="[weaponId(actor),actor.weapon.id,actor.weapon.kind,'shot','slosh','blast','drop','roller','crab'].includes(d.w)";
 const original=await load(),cached=await load(s=>s.replace('  for(const p of shots) {','  let mainCause;\n  for(const p of shots) {').replace(clause,'(mainCause ??= '+clause+')'));
 const run=module=>{
  const nm=net();module.api.record(nm,'peer',packet([shot(0),shot(10)]),100);
  class V{set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}}
  nm._combatProvenanceTHREE={Vector3:V};nm._combatProvenancePhysics={los(from){nm.byNid.get(1).weapon={id:'charger',kind:'charger',range:35,fireInterval:.12,damage:36};return from.z===.1;}};
  return module.api.combatAdmission(nm,'peer',{m:'m',a:1,v:2,h:1,l:0,d:36,w:'shooter'},'pvp',100);
 };
 assert.equal(run(original),false);assert.equal(run(cached),true);
});
