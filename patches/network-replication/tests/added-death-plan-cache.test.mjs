import test from 'node:test';
import assert from 'node:assert/strict';
import {actualModule,json} from './added-actual-module.mjs';
import {deathBlastPlan} from '../../splatoon3/runtime/death-blast.mjs';
const cache=`  const plans=state(nm).deathPlans;
  let cached=plans.get(proof[2]),same=!!cached;
  if(same)for(let i=3;i<=10;i++)if(cached.keys[i-3]!==proof[i]){same=false;break;}
  if(!same){
    cached={keys:proof.slice(3,11),plan:deathBlastPlan(position,proof[9],DEATH_PAINT_SPEC)};
    plans.set(proof[2],cached);
    if(plans.size>8)plans.delete(plans.keys().next().value);
  }
  const row = cached.plan[proof[11]];`;
async function load(before=false){let calls=0;const f=await actualModule('patches/network-replication/paint-authority.mjs',{
 transform:s=>before?s.replace(cache,'  const row = deathBlastPlan(position, proof[9], DEATH_PAINT_SPEC)[proof[11]];'):s,
 extra:'export {state};',overrides:{'../splatoon3/runtime/death-blast.mjs':{deathBlastPlan(...args){calls++;return deathBlastPlan(...args);}}}});return{...f,get calls(){return calls;}};}
function net(){return{s:{_members:new Map([['peer',true],['other',true]]),hostId:'peer'},cfg:{id:'match'},byNid:new Map([[1,{nid:1,owner:'peer',remote:true,team:0,net:{lastLife:3},pos:{x:0,y:0,z:0}}],[2,{nid:2,owner:'other',team:1}]])};}
function stamp(module,index,{nid=1,life=3,generation=0,seed=.4,position={x:0,y:0,z:0},attacker=2,team=1}={}){
 const row=deathBlastPlan(position,seed,module.api.DEATH_PAINT_SPEC)[index];
 const proof=[module.api.PAINT_AUTHORITY_TAG,'death',nid,generation,life,attacker,position.x,position.y,position.z,seed,team,index];
 const e=[100,'s',row.x,row.y,row.z,row.radius,team,row.seed,0,0,0,0,0,-1,[null,null,null,null,proof]];e._netTick=10;e._netSeq=index+1;return e;
}

test('actual death authority shares one exact plan for eleven stamps and preserves replay masks/order',async()=>{
 const old=await load(true),current=await load();
 for(const order of [[...Array(11).keys()],[...Array(11).keys()].reverse(),[5,1,9,3,7,0,10,4,2,8,6,5,0]]){
  const a=net(),b=net(),beforeA=old.calls,beforeB=current.calls;
  for(const i of order){const x=stamp(old,i),y=stamp(current,i);const ax=old.api.admitPaintAuthority(a,'peer',x),by=current.api.admitPaintAuthority(b,'peer',y);assert.equal(by,ax);if(ax){old.api.consumePaintAuthority(a,x);current.api.consumePaintAuthority(b,y);}}
  assert.deepEqual(json(current.api.state(b).deaths),json(old.api.state(a).deaths));
  assert.equal(old.calls-beforeA,order.length);assert.equal(current.calls-beforeB,1);
 }
});

test('cache never grants ownership/life/geometry/team authority and keys every death numeric field',async()=>{
 const f=await load(),nm=net(),good=stamp(f,0);assert(f.api.admitPaintAuthority(nm,'peer',good));
 const calls=f.calls;
 for(const mutate of [e=>e[14][4][3]++,e=>e[14][4][4]++,e=>e[14][4][5]=999,e=>e[14][4][6]=20,e=>e[14][4][9]=NaN,e=>e[6]=0,e=>e[2]+=.01,e=>e[5]+=.01,e=>e[7]+=.01,e=>e[14][4][10]=0]){
  const e=stamp(f,1);mutate(e);assert.equal(f.api.admitPaintAuthority(nm,'peer',e),false);
 }
 assert.equal(f.api.admitPaintAuthority(nm,'other',stamp(f,1)),false);assert.equal(f.calls,calls,'early invalid identity and same-key row tampering never generate new plans');
 for(const options of [{seed:.5},{position:{x:.1,y:0,z:0}},{position:{x:.1,y:.1,z:0}},{position:{x:.1,y:.1,z:.1}}])assert(f.api.admitPaintAuthority(nm,'peer',stamp(f,1,options)));
 assert.equal(f.calls,calls+4);
 nm.byNid.get(1).net.lastLife=4;assert(f.api.admitPaintAuthority(nm,'peer',stamp(f,1,{life:4})));
 f.api.transferPaintOwner(nm,nm.byNid.get(1),'other');nm.byNid.get(1).owner='other';assert.equal(f.api.admitPaintAuthority(nm,'peer',stamp(f,1,{life:4})),false);
 assert(f.api.admitPaintAuthority(nm,'other',stamp(f,1,{life:4,generation:1})));
 const next={...nm,cfg:{id:'next'}};assert(f.api.admitPaintAuthority(next,'other',stamp(f,1,{life:4,generation:0})),'fresh match does not inherit old generation/cache');
 assert.notEqual(f.api.state(next).deathPlans,f.api.state(nm).deathPlans);
});

test('retained plans are bounded to eight victims even under roster/cache churn',async()=>{
 const f=await load(),nm=net();
 for(let nid=3;nid<40;nid++){
  nm.byNid.set(nid,{nid,owner:'peer',remote:true,team:0,net:{lastLife:3},pos:{x:0,y:0,z:0}});
  assert(f.api.admitPaintAuthority(nm,'peer',stamp(f,0,{nid})));assert(f.api.state(nm).deathPlans.size<=8);
 }
 assert.equal(f.api.state(nm).deathPlans.size,8);
});
