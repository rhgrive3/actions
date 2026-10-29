import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

// Real production-composed native Actor/Runner/Physics/Projectiles. Display is
// a fixed muzzle seam, paint is dry/zero-credit, Boss combat state is fixed.
// This is a private MessageChannel pipeline, not a deployed/WAN relay room.
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`
 export * from './patches/network-replication/trusted-native-replay.mjs';
 export * from './patches/network-replication/trusted-native-replay-worker.mjs';
 export * from './patches/network-replication/native-command-wire.mjs';
 export * from './patches/network-replication/native-command-scheduler.mjs';
 export {Boss} from './inkwave-public/src/boss/boss.js';
`});
const plain=x=>JSON.parse(JSON.stringify(x)),V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
class Display{
 constructor(){this.root=new f.THREE.Group();this.color=new f.THREE.Color(0xffffff);}
 _owner(){return this.actor;}_runner(){return this.actor?.weaponRunner;}
 trigger(){}setVisible(){}setHurt(){}setWeapon(){}update(){}dispose(){}
 getMuzzle(out){return out.copy(this.root.position).add(V(0,1.05,.3));}
}
const roster=()=>[{nid:1,owner:'A',life:1,team:0,slot:0,weapon:'shooter',position:[0,0,0],yaw:0},{nid:2,owner:'B',life:1,team:1,slot:0,weapon:'shooter',position:[0,0,7],yaw:Math.PI}];
function world({wall=false,target=null,beforeActors=null,afterActors=null}={}){
 const raw={bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]};
 if(wall)raw.single.push({kind:'box',min:[-4,0,3],max:[4,6,4]});
 const level=new f.Level(raw);
 return {level,physics:new f.Physics(level),paint:{sample:()=>0,splat:()=>0},match:{playing:()=>true,canRespawn:()=>false},beforeActors,afterActors,
  createBoss:target?()=>Object.assign(Object.create(f.Boss.prototype),{match:{state:'playing'},sim:true,dead:false,visible:true,invuln:false,stunned:false,pos:V(0,0,7),hp:1000,maxHp:1000,flashN:0,weakN:0,
   crabs:new Map(target==='crablet'?[[3,{id:3,x:0,y:.5,z:7,hp:100,dead:false}]]:[]),unsubs:[],hz:{dispose(){}},model:{flash(){},dispose(){},hitShapes:target==='boss'?[{active:true,weak:false,pos:V(0,1,7),r:1}]:[]}}):null};
}
function setup({hz=60,maxPendingFrames=256,scheduled=true,...options}={}){
 const r=roster();if(options.target)r[1].position=[30,0,7];
 const token=f.createTrustedNativeReplay(f,{isolatedRealm:true,epoch:'match',seed:83921,time:0,world:world(options),roster:r,CharacterClass:Display});
 const p=f.createNativeCommandRoomPolicy({epoch:'match',build:'72c799',seed:83921,roster:r.map(({nid,owner,life})=>({nid,owner,life}))});
 const {port1,port2}=new MessageChannel();let principal='A',epoch='match',clock=10,serial=0;
 const endpoint=f.attachTrustedNativeReplayWorker(port1,token,{authorize:()=>{options.authorizeHook?.();return {epoch,from:principal,at:clock,owners:new Map(r.map(a=>[a.nid,a.owner]))};},
  ...(scheduled?{commandRoom:{build:'72c799',seed:83921,at:10,dt:1/hz,maxPendingFrames}}:{})});
 const call=(from,request,{at=20,authEpoch='match'}={})=>new Promise((resolve,reject)=>{
  principal=from;epoch=authEpoch;clock=at;
  const timer=setTimeout(()=>reject(Error('native command worker timeout')),3000);
  port2.once('message',result=>{clearTimeout(timer);resolve(result);});port2.postMessage({id:++serial,...request});
 });
 const sequences={A:0,B:0};
 const packet=(owner,start,count,{fire=true,dt=1/hz,timeOffset=0,sequence=++sequences[owner]}={})=>plain(f.attachNativeCommandEnvelope({k:'t',a:[[1,'legacy']],e:[]},p,{from:owner,sequence,frames:Array.from({length:count},(_,i)=>{
  const tick=start+i;return {tick,dt,sourceTime:tick*dt+timeOffset,commands:r.filter(a=>a.owner===owner).map(a=>({nid:a.nid,owner,life:a.life,input:{fire:fire&&a.nid===1&&tick===3*hz+1,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[a.yaw,0],aimPoint:[0,1,40]}))};
 })}));
 const state=()=>plain(f.inspectTrustedNativeReplay(token));
 const enroll=async()=>{for(const owner of ['A','B'])assert.equal((await call(owner,{operation:'enroll',capability:plain(f.nativeCommandCapability(p))})).ok,true);};
 return {token,p,call,packet,state,enroll,revokeOwner:endpoint.revokeOwner,closeEndpoint:endpoint.close,close(){endpoint.close();port1.close();port2.close();}};
}
const claim=e=>Object.fromEntries(['epoch','tick','serial','kind','attacker','attackerLife','victim','victimLife','source','damage'].map(k=>[k,e[k]]));
async function send(w,owner,packet,options){return w.call(owner,{operation:'commands',packet},options);}
async function run(w,{delayed=false,fire=true,frames=240,chunk=60}={}){
 await w.enroll();
 for(let first=1;first<=frames;first+=chunk){
  const count=Math.min(chunk,frames-first+1),a=w.packet('A',first,count,{fire}),b=w.packet('B',first,count,{fire:false});
  const order=delayed?['B','A']:['A','B'];
  assert.equal((await send(w,order[0],order[0]==='A'?a:b)).executed,0);
  assert.equal(w.state().tick,first-1,'one owner alone cannot advance a native tick');
  const done=await send(w,order[1],order[1]==='A'?a:b);assert.equal(done.ok,true,done.reason);assert.equal(done.executed,count);
 }
}

for(const hz of [30,60,120])test(`worker all-owner ${hz}Hz barrier retains real paid shot/contact and one-use claim`,async()=>{
 const w=setup({hz});try{
  await run(w,{frames:4*hz,chunk:hz});const s=w.state();assert.ok(s.launches.length);assert.ok(s.effects.length);assert.ok(s.actors[1].hp<100);
  const e=s.effects[0],c=claim(e),before=plain(s.actors);
  assert.equal((await w.call('B',{operation:'claim',claim:c})).reason,'worker-claim-owner');
  assert.equal((await w.call('A',{operation:'claim',claim:c},{authEpoch:'other'})).reason,'worker-epoch-mismatch');
  const result=await w.call('A',{operation:'claim',claim:c});assert.equal(result.ok,true);assert.deepEqual(result.effect,e);
  assert.deepEqual(w.state().actors,before,'claim returns the already executed effect without applying HP twice');
  assert.equal((await w.call('A',{operation:'claim',claim:c})).reason,'no-native-contact');
 }finally{w.close();}
});
test('delayed opposite-owner packet order produces identical native effects and world state',async()=>{
 let expected;const a=setup();try{await run(a);expected=a.state();}finally{a.close();}
 const b=setup();try{await run(b,{delayed:true});assert.deepEqual(b.state(),expected);}finally{b.close();}
});
for(const target of ['boss','crablet'])test(`scheduled two-owner commands execute actual native ${target} contact`,async()=>{
 const w=setup({target});try{await run(w,{delayed:true});const e=w.state().effects.find(e=>e.kind===target);assert.ok(e);assert.ok(e.hpDelta>0);assert.equal((await w.call('A',{operation:'claim',claim:claim(e)})).ok,true);}finally{w.close();}
});
for(const condition of ['idle','wall'])test(`scheduled ${condition} does not admit invented contact`,async()=>{
 const w=setup({wall:condition==='wall'});try{await run(w,{fire:condition!=='idle'});const s=w.state();assert.equal(s.effects.length,0);assert.equal(s.actors[1].hp,100);
  assert.equal((await w.call('A',{operation:'claim',claim:{epoch:'match',tick:181,serial:1,kind:'pvp',attacker:1,attackerLife:1,victim:2,victimLife:1,source:'shooter',damage:36}})).reason,'no-native-contact');
 }finally{w.close();}
});
test('scheduled worker cannot bypass the owner barrier with raw advance or legacy result events',async()=>{
 const w=setup();try{await w.enroll();
  assert.equal((await w.call('A',{operation:'advance',frame:{tick:1,dt:1/60,commands:[]}})).ok,false);
  assert.equal((await w.call('A',{operation:'advance'})).ok,false);
  assert.equal((await send(w,'A',{k:'hit',d:36})).ok,false);
  const q=w.packet('A',1,1);q.e=[[1,'weapon:fire',{damage:999}]];q.d=999;
  assert.equal((await send(w,'A',q)).executed,0);assert.equal(w.state().tick,0);assert.equal(w.state().launches.length,0);
 }finally{w.close();}
});
test('malformed final row rejects the whole batch without spending its sequence or valid prefix',async()=>{
 const w=setup();try{await w.enroll();const good=w.packet('A',1,3),bad=plain(good);bad.nc.frames.at(-1)[3][0][2]=1024;
  assert.equal((await send(w,'A',bad)).ok,false);assert.equal(w.state().tick,0);
  assert.equal((await send(w,'B',w.packet('B',1,3))).executed,0);
  assert.equal((await send(w,'A',good)).executed,3);assert.equal(w.state().tick,3);
 }finally{w.close();}
});
test('fixed room dt and first source-time origin reject before reserving a peer prefix',async()=>{
 const w=setup();try{await w.enroll();const good=w.packet('A',1,3);
  for(const q of [w.packet('A',1,3,{dt:1/30,sequence:1}),w.packet('A',1,3,{timeOffset:100,sequence:1})])assert.equal((await send(w,'A',q)).reason,'native-command-room-clock-mismatch');
  assert.equal((await send(w,'A',good)).ok,true);assert.equal((await send(w,'B',w.packet('B',1,3))).executed,3);
 }finally{w.close();}
});
test('auth owner/epoch/receiver elapsed budget reject without poisoning the legitimate packet',async()=>{
 const w=setup();try{await w.enroll();const a=w.packet('A',1,3);
  assert.equal((await send(w,'B',a)).ok,false);
  assert.equal((await send(w,'A',a,{authEpoch:'old'})).reason,'worker-epoch-mismatch');
  assert.equal((await send(w,'A',a,{at:10.049})).reason,'native-command-exceeds-authority-elapsed');
  assert.equal((await send(w,'A',a,{at:10.05})).ok,true);assert.equal((await send(w,'B',w.packet('B',1,3))).executed,3);
 }finally{w.close();}
});
test('exact retries do not replay native updates, modified retries and packet gaps remain rejected',async()=>{
 const w=setup();try{await w.enroll();const a=w.packet('A',1,3),b=w.packet('B',1,3);
  await send(w,'A',a);assert.equal((await send(w,'A',a)).duplicate,true);await send(w,'B',b);const before=w.state();
  assert.equal((await send(w,'A',a)).duplicate,true);assert.deepEqual(w.state(),before);
  const changed=plain(a);changed.nc.frames[0][3][0][2]=1;assert.equal((await send(w,'A',changed)).ok,false);
  assert.equal((await send(w,'A',w.packet('A',4,1,{sequence:3}))).reason,'native-command-sequence-gap');
  assert.equal((await send(w,'A',w.packet('A',4,1,{sequence:2}))).ok,true);
 }finally{w.close();}
});
test('bounded missing-owner backlog accepts a corrected retry after the other owner catches up',async()=>{
 const w=setup({maxPendingFrames:3});try{await w.enroll();const tooFar=w.packet('A',1,4);
  assert.equal((await send(w,'A',tooFar)).reason,'native-command-pending-limit');
  assert.equal((await send(w,'A',w.packet('A',1,3,{sequence:1}))).executed,0);
  const next=w.packet('A',4,1,{sequence:2});assert.equal((await send(w,'A',next)).reason,'native-command-pending-limit');
  assert.equal(w.state().tick,0);assert.equal((await send(w,'B',w.packet('B',1,3))).executed,3);
  assert.equal((await send(w,'A',next)).ok,true);
 }finally{w.close();}
});
test('old public complete-frame worker API remains usable without the trusted commandRoom option',async()=>{
 const w=setup({scheduled:false});try{
  assert.equal(w.revokeOwner,undefined);
  const frame={tick:1,dt:1/60,commands:roster().map(a=>({nid:a.nid,owner:a.owner,life:1,input:{fire:false,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[a.yaw,0]}))};
  assert.equal((await w.call('A',{operation:'advance',frame})).ok,true);assert.equal(w.state().tick,1);
  assert.equal((await w.call('A',{operation:'enroll',capability:plain(f.nativeCommandCapability(w.p))})).reason,'invalid-worker-request');
 }finally{w.close();}
});
test('scheduled RPC IDs cannot poison another owner or bypass native execution replay checks',async()=>{
 const w=setup();try{await w.enroll();
  assert.equal((await w.call('A',{id:Number.MAX_SAFE_INTEGER,operation:'commands',packet:{bad:true}})).ok,false);
  const a=w.packet('A',1,3),b=w.packet('B',1,3);
  assert.equal((await w.call('A',{id:1,operation:'commands',packet:a})).executed,0);
  assert.equal((await w.call('B',{id:1,operation:'commands',packet:b})).executed,3);
  const before=w.state();assert.equal((await w.call('A',{id:1,operation:'commands',packet:a})).duplicate,true);assert.deepEqual(w.state(),before);
 }finally{w.close();}
});
test('trusted owner revocation clears queued prefixes and retained effects before another owner arrives',async()=>{
 const w=setup();try{await run(w);const old=w.state().effects[0];
  assert.equal((await send(w,'A',w.packet('A',241,2))).executed,0);
  assert.equal(w.revokeOwner('stranger'),false);assert.equal(w.revokeOwner('A'),true);
  assert.equal(w.state().tick,240);assert.equal(w.state().contacts,0);assert.equal(w.state().closed,true);
  assert.equal((await send(w,'B',w.packet('B',241,2))).ok,false);
  assert.equal((await w.call('A',{operation:'claim',claim:claim(old)})).ok,false);
  assert.equal((await w.call('A',{operation:'revokeOwner',owner:'B'})).ok,false);
 }finally{w.close();}
});
test('native fault after earlier successful ticks revokes all contacts and queued prefixes',async()=>{
 let fault=false,attempt=0;const w=setup({afterActors(){if(fault&&++attempt===2)throw Error('scheduled native phase fault');}});
 try{await run(w);const e=w.state().effects[0];assert.ok(e);fault=true;
  await send(w,'A',w.packet('A',241,3));const result=await send(w,'B',w.packet('B',241,3));assert.equal(result.reason,'scheduled native phase fault');
  assert.equal(w.state().tick,242,'first tick ran and the failing second tick may have mutated native state; no rollback is asserted');
  assert.equal(w.state().closed,true);assert.equal(w.state().contacts,0);
  assert.equal((await w.call('A',{operation:'claim',claim:claim(e)})).ok,false);
  assert.equal((await send(w,'A',w.packet('A',243,1))).ok,false);
 }finally{w.close();}
});
test('synchronous scheduler reentry cannot consume queued input, retire an owner or dispose the executing realm',()=>{
 let scheduler,packet,nested;
 const auth=owner=>({epoch:'match',from:owner,at:20});
 const w=setup({scheduled:false,beforeActors(){if(scheduler)nested={
  receive:plain(f.receiveNativeCommandSchedulerPacket(scheduler,packet,auth('A'))),
  enroll:plain(f.enrollNativeCommandSchedulerPeer(scheduler,f.nativeCommandCapability(w.p),auth('A'))),
  dispose:f.disposeNativeCommandScheduler(scheduler),revoke:f.revokeNativeCommandSchedulerOwner(scheduler,'A'),
 };}});
 try{
  scheduler=f.createNativeCommandScheduler(w.token,{build:'72c799',seed:83921,at:10});
  for(const owner of ['A','B'])assert.equal(f.enrollNativeCommandSchedulerPeer(scheduler,f.nativeCommandCapability(w.p),auth(owner)).ok,true);
  packet=w.packet('A',1,1);assert.equal(f.receiveNativeCommandSchedulerPacket(scheduler,packet,auth('A')).executed,0);
  assert.equal(f.receiveNativeCommandSchedulerPacket(scheduler,w.packet('B',1,1),auth('B')).executed,1);
  assert.deepEqual(nested,{receive:{ok:false,reason:'reentrant-native-command-scheduler'},enroll:{ok:false,reason:'reentrant-native-command-scheduler'},dispose:false,revoke:false});
  assert.equal(w.state().tick,1);assert.equal(f.checkNativeCommandScheduler(scheduler).ok,true);
  assert.equal(f.disposeNativeCommandScheduler(scheduler),true);
 }finally{w.close();}
});
for(const transportFault of [false,true])test(`scheduled worker rejects synchronous custom-port reentry before authorization; transport fault=${transportFault}`,()=>{
 let listener,endpoint,nested=false,authCalls=0,principal='A';const responses=[];
 const port={on(_name,fn){listener=fn;},off(){listener=null;},postMessage(result){responses.push(plain(result));if(transportFault&&result.reason==='reentrant-native-command-worker')throw Error('nested transport fault');}};
 const w=setup({scheduled:false,afterActors(){nested=true;listener({id:999,operation:'commands',packet:{}});nested=false;}});
 try{
  endpoint=f.attachTrustedNativeReplayWorker(port,w.token,{commandRoom:{build:'72c799',seed:83921,at:10},authorize(){authCalls++;if(nested)throw Error('nested auth must not run');return {epoch:'match',from:principal,at:20};}});
  for(const owner of ['A','B']){principal=owner;listener({id:1,operation:'enroll',capability:plain(f.nativeCommandCapability(w.p))});}
  principal='A';listener({id:2,operation:'commands',packet:w.packet('A',1,1)});
  principal='B';listener({id:2,operation:'commands',packet:w.packet('B',1,1)});
  assert.equal(authCalls,4);assert.equal(responses.at(-2).reason,'reentrant-native-command-worker');
  if(transportFault){assert.equal(responses.at(-1).ok,false);assert.equal(responses.at(-1).reason,'native-worker-fault');assert.equal(w.state().closed,true);assert.equal(w.state().contacts,0);}
  else{assert.equal(responses.at(-1).executed,1);assert.equal(w.state().closed,false);}
  assert.equal(w.state().tick,1);
 }finally{endpoint?.close();w.close();}
});
test('actual native life transition halts before any queued old-life next frame can execute',async()=>{
 let transition=false;const w=setup({afterActors(actors){if(transition)actors[0].spawnAt(V(0,0,0),0);}});
 try{await run(w);const old=w.state().effects[0];transition=true;
  await send(w,'A',w.packet('A',241,2));const result=await send(w,'B',w.packet('B',241,2));
  assert.equal(result.reason,'native-command-lifecycle-checkpoint-required');assert.equal(w.state().tick,241);assert.equal(w.state().actors[0].life,2);assert.equal(w.state().closed,true);
  assert.equal((await w.call('A',{operation:'claim',claim:claim(old)})).ok,false);
 }finally{w.close();}
});
test('session disposal caught inside the final native callback cannot publish a successful completed batch',async()=>{
 let dispose=false,caught=false,w;
 w=setup({afterActors(){if(dispose)try{f.disposeTrustedNativeReplay(w.token);}catch{caught=true;}}});
 try{await run(w);assert.ok(w.state().effects.length);dispose=true;
  await send(w,'A',w.packet('A',241,1));const result=await send(w,'B',w.packet('B',241,1));
  assert.equal(caught,true);assert.equal(result.ok,false);assert.equal(result.reason,'native-command-replay-diverged');
  assert.equal(w.state().closed,true);assert.equal(w.state().contacts,0);
 }finally{w.close();}
});
test('scheduled endpoint close during a native callback returns false without tearing down the executing frame',async()=>{
 let w,result;w=setup({afterActors(){result=w.closeEndpoint();}});
 try{await w.enroll();await send(w,'A',w.packet('A',1,1));assert.equal((await send(w,'B',w.packet('B',1,1))).ok,true);
  assert.equal(result,false);assert.equal(w.state().closed,false);assert.equal(w.state().tick,1);
  assert.equal(w.closeEndpoint(),true);assert.equal(w.state().closed,true);
 }finally{w.close();}
});
test('trusted authorization exception retires the worker and revokes effects plus queued input',async()=>{
 let fail=false;const w=setup({authorizeHook(){if(fail)throw Error('authorization unavailable');}});
 try{await run(w);assert.ok(w.state().effects.length);await send(w,'A',w.packet('A',241,2));fail=true;
  assert.equal((await send(w,'B',w.packet('B',241,2))).reason,'native-worker-fault');
  assert.equal(w.state().closed,true);assert.equal(w.state().tick,240);assert.equal(w.state().contacts,0);
  assert.equal(f.advanceTrustedNativeReplay(w.token,{tick:241,dt:1/60,commands:[]},{}).ok,false);
 }finally{w.close();}
});
test('out-of-band replay advancement retires scheduled claims and prevents a second scheduler lease',async()=>{
 const w=setup();try{await run(w);const e=w.state().effects[0];
  assert.throws(()=>f.createNativeCommandScheduler(w.token,{build:'72c799',seed:1,at:10}),/Fresh/);
  const frame={tick:241,dt:1/60,commands:roster().map(a=>({nid:a.nid,owner:a.owner,life:1,input:{fire:false,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[a.yaw,0]}))};
  assert.equal(f.advanceTrustedNativeReplay(w.token,frame,{epoch:'match',owners:new Map([[1,'A'],[2,'B']])}).ok,true);
  assert.equal((await w.call('A',{operation:'claim',claim:claim(e)})).reason,'native-command-replay-diverged');assert.equal(w.state().closed,true);
 }finally{w.close();}
});
