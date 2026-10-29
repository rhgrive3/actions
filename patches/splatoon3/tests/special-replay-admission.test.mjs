import test from 'node:test';
import assert from 'node:assert/strict';
import {observeNativeSpecialUse,admitCatalogueSpecial,flushCatalogueSpecials} from '../runtime/special-replay-admission.mjs';
function client(special='killerWail'){
 const actor={nid:1,owner:'peer',remote:true,netLife:0,weapon:{special}};
 const nm={match:{},byNid:new Map([[1,actor]]),peers:new Map([['peer',{_lastEventSeq:0}]])};
 const api={G:{projectiles:{_s3AllSpecialObjects:[]}}},effects=[];
 const replay=p=>effects.push({...p});
 const use=(id=special,seq=1)=>{const previous=nm.peers.get('peer')._lastEventSeq;nm.peers.get('peer')._lastEventSeq=seq;
  return observeNativeSpecialUse(nm,'peer',Object.assign([10,'ev','special:use',{actor:{n:1},id}],{_netSeq:seq,_netTick:600}),previous);};
 const ac=(changes={},seq=2)=>{const p={id:special,activation:1,action:'activate',pos:[0,0,0],seed:1,...changes};const event=[10,'ac','special',1,actor.netLife,p,600,seq];
  if(admitCatalogueSpecial(nm,'peer',actor,event,p,api,replay)){replay(p);return true;}return false;};
 return{actor,nm,api,effects,use,ac};
}
test('native accepted use and equipped slot bind one activation; arbitrary registry FX and seeds cannot create another',()=>{
 const c=client();assert.equal(c.ac(),false);assert.equal(c.effects.length,0);assert.equal(c.use('inkjet'),true);flushCatalogueSpecials(c.nm,c.api);assert.equal(c.effects.length,0);
 assert.equal(c.use('killerWail',3),true);flushCatalogueSpecials(c.nm,c.api);assert.equal(c.effects.length,0,'newer use cannot authorize older queued activation');
 assert.equal(c.ac({},4),true);assert.equal(c.ac({seed:2},5),false);assert.equal(c.ac({action:'pulse'},6),false);
 assert.equal(c.ac({action:'laser',seed:3,tick:1,index:0},7),true);
 assert.equal(c.ac({activation:2,seed:4},8),false,'one native use cannot mint multiple activations');
});
test('delayed kit sidecar reconciles already validated events without losing persistent FX on later kit change',()=>{
 const c=client('inkjet');c.actor.weapon.special='trizooka';c.use();assert.equal(c.ac(),false);assert.equal(c.effects.length,0);
 c.actor.weapon.special='inkjet';flushCatalogueSpecials(c.nm,c.api);assert.equal(c.effects.length,1);
 c.actor.weapon.special='crabTank';assert.equal(c.ac({action:'impact',seed:3},3),true,'a projectile outlives its equipped slot');
 c.actor.netLife=1;assert.equal(c.ac({action:'shot',seed:4},4),false,'new actor life cannot inherit live attacks');
});
test('pending work is bounded, actor/life scoped, and a disposed receiver never authorizes replay',()=>{
 const c=client();for(let i=0;i<100;i++)c.ac({activation:i+1},i+2);c.use();flushCatalogueSpecials(c.nm,c.api);assert.equal(c.effects.length,1,'one receipt authorizes one of the bounded waiting activations');
 const d=client();d.use();d.ac();d.nm._disposed=true;assert.equal(d.ac({action:'laser'},3),false);
 const e=client();e.ac();e.actor.netLife=1;e.use();flushCatalogueSpecials(e.nm,e.api);assert.equal(e.effects.length,0);
});
test('malformed FX cannot consume the one valid activation receipt',()=>{
 const c=client();c.use();assert.equal(c.ac({pos:[NaN,0,0]}),false);assert.equal(c.ac({seed:-1}),false);assert.equal(c.ac({action:'pulse'}),false);assert.equal(c.ac({},3),true);
});
