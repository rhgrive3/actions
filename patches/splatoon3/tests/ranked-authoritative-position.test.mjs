import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';
import {RANKED_POSE_LIMITS as L} from '../runtime/ranked/pose-admission.mjs';
const f=await fixture({productionComposition:true,includeMatch:true,rankedNetwork:true});

function rig(label,{power=[0,0,0],blocked=()=>false}={}){
 f.clock.set(1000); f.G.time=1000;
 // Production levels carry spawn pad coordinates; respawn epochs are
 // admitted only at the owner's pad (#1648). The shared fixture has y only.
 if(!Number.isFinite(f.G.level.spawnPads?.[0]?.x))f.G.level.spawnPads=[{x:0,y:0,z:0},{x:0,y:0,z:60}];
 const nm=f.makeNetMatch(f.makeSession('me','me'),{id:'1648-'+label});
 const a=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});a.pos.set(0,0,0);a.grounded=true;
 const m=f.bind(nm,[a]);f.G.match=m;m.mode='clams';
 m.ranked=new f.RankedEngine('clams',{id:'fixture',clams:{spawns:[],goals:[[0,1,30],[0,1,-30]]}});
 m.rankedWorld={zoneCoverage:()=>[],floorAt:()=>0,blocked};m.rankedBarrierHits=[];m.rankedGains=[0,0];m.playRankedEvents=()=>{};
 const rule=m.ranked.rule;rule.state.clams=[{id:'field-power',kind:'power',team:0,pos:power,velocity:[0,0,0],grounded:true,age:0,expiresIn:null,persistent:false,counterPower:false,thrower:null,pass:false,bounces:0}];
 let seq=0,packets=0,ticks=0;
 function send(pos=[0,0,0],{throwClam=false,from='p2',flags=17,tp=0,mutate=null,life=0,ts=f.clock.now()}={}){
  const row=f.packActor(a,{x:pos[0],y:pos[1],z:pos[2],f:flags,tp});if(mutate)mutate(row);
  const d={k:'t',ts,r:2,u:Math.round(ts*60),l:{0:life},a:[row],rki:{match:nm.cfg.id,id:'0',seq:++seq,fire:false,throw:throwClam,aim:[0,0,1],special:null,specialDeployed:false,clamDrop:0}};
  nm.onMessage(from,f.parseWire(JSON.stringify(d)));packets++;return d;
 }
 function tick(n=1){for(let i=0;i<n;i++){f.clock.advance(1/60);f.G.time=f.clock.now();nm.update(1/60);nm.applyRemote(a,1/60);m.ranked.update(1/60,f.buildFrame(m,f));ticks++;}}
 function result(){return {label,packets,ticks,actorPos:a.pos.toArray(),rankedPose:nm.rankedPose?.get('0')??null,inventory:rule.state.inventories['0']??null,counts:[...m.ranked.counts],events:JSON.parse(JSON.stringify(m.ranked.events)),buffer:a.net.buf.map(s=>({t:s.t,p:s.p?.toArray?.()??s.p})),field:JSON.parse(JSON.stringify(rule.state.clams))};}
 return {nm,a,m,rule,send,tick,result};
}

function frame(r){return f.buildFrame(r.m,f).actors[0];}
function check(label, fn){test(label,()=>{const r=rig(label,{power:[0,0,27]});try{fn(r);}finally{r.nm.dispose();}});}
check('legitimate-walk-pickup-throw-score',r=>{
  r.send();r.tick(3);
  for(let z=1;z<=27;z++){r.send([0,0,z]);r.tick(3);}
  assert.equal(frame(r).pos[2],27);r.tick(10);
  assert.equal(r.rule.state.inventories['0'].power,true);
  r.send([0,0,27],{throwClam:true});r.tick(150);
  assert.equal(r.m.ranked.counts[0],80);
 });
 for(const kind of ['stale','out-of-order','bad-life','invalid-yaw'])check(kind+'-does-not-advance',r=>{
  const d=r.send();r.tick(3);const before=r.nm.rankedPose.get('0');
  const opt=kind==='stale'?{ts:d.ts}:kind==='out-of-order'?{ts:d.ts-.01}:kind==='bad-life'?{life:-1}:{mutate:row=>row[7]=null};
  r.send([0,0,1],opt);
  assert.equal(r.nm.rankedPose.get('0'),before);assert.equal(frame(r).pos[2],0);
 });
 check('new-owner-does-not-inherit-old-admission',r=>{
  r.send();r.tick(3);assert.equal(frame(r).alive,true);
  r.a.owner='p3';assert.equal(frame(r).alive,false);
  r.send([0,0,1]);assert.equal(frame(r).alive,false);
  r.send([0,0,1],{from:'p3'});assert.equal(frame(r).alive,true);assert.equal(frame(r).pos[2],1);
 });
 check('new-life-invalidates-until-accepted',r=>{
  r.send();r.tick(3);r.a.net.lastLife=1;assert.equal(frame(r).alive,false);
  r.send([0,0,1],{life:0});assert.equal(frame(r).alive,false);
  r.tick(3);r.send([0,0,1],{life:1});assert.equal(frame(r).alive,true);
 });
 check('replacement-actor-does-not-inherit-admission',r=>{
  r.send();r.tick(3);
  const next=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});
  r.m.actors=[next];r.nm.byNid.set(0,next);assert.equal(frame(r).alive,false);
 });
 check('actual-modern-adoption-sequence-replay-rejected',r=>{
  let wire; const original=r.nm.s.tr.broadcast;
  r.nm.s.tr.broadcast=d=>{wire=JSON.parse(JSON.stringify(d));return true;};
  r.a.remote=false;r.a.weaponRunner.charge=0;r.nm._sendTick();r.a.remote=true;r.nm.s.tr.broadcast=original;
  assert.ok(wire.a[0].length>=26);r.nm.onMessage('p2',f.parseWire(JSON.stringify(wire)));
  const before=r.nm.rankedPose.get('0');assert.ok(before);r.tick(3);
  wire.ts=f.clock.now();wire.u=Math.round(wire.ts*60);wire.a[0][3]=1;
  wire.a[0][23][3]=wire.u;
  r.nm.onMessage('p2',f.parseWire(JSON.stringify(wire)));
  assert.equal(r.nm.rankedPose.get('0'),before);assert.equal(frame(r).pos[2],0);
  r.tick(3);wire.ts=f.clock.now();wire.u=Math.round(wire.ts*60);wire.a[0][23][3]=wire.u;wire.a[0][23][2]++;
  r.nm.onMessage('p2',f.parseWire(JSON.stringify(wire)));assert.equal(frame(r).pos[2],1);
 });
 check('local-and-follower-use-existing-position',r=>{
  r.a.pos.set(0,0,4);r.a.remote=false;assert.equal(frame(r).alive,true);assert.equal(frame(r).pos[2],4);
  r.a.remote=true;r.nm.s.isHost=false;assert.equal(frame(r).alive,true);assert.equal(frame(r).pos[2],4);
 });

for(const velocity of [0,150]) check(`accepted position bounds objective pickup with display velocity ${velocity}`,r=>{
 r.send([0,0,0],{mutate:row=>row[6]=velocity});r.tick(40);
 assert.equal(r.a.pos.z,velocity===0?0:27,'existing display extrapolation stays unchanged');
 assert.equal(r.nm.rankedPose.get('0').last.pos[2],0);
 r.send([0,0,0],{throwClam:true,mutate:row=>row[6]=velocity});r.tick(150);
 assert.equal(r.m.ranked.counts[0],100);
 assert.equal(r.m.ranked.events.some(e=>e.kind==='clam-pickup'||e.kind==='clam-score'),false);
});

check('duplicate actor rows commit only the first native-accepted row',r=>{
 // Stay inside the production per-envelope actor budget while exercising a
 // repeated row. Over-budget envelopes are independently rejected below.
 const other=f.makeActor({nid:1,owner:'p3',remote:true,roller:false});
 r.m.actors.push(other);r.nm.byNid.set(1,other);r.nm._setupActor(other);
 const d=r.send();r.tick(3);d.ts=f.clock.now();d.u=Math.round(d.ts*60);d.rki.seq++;
 const first=structuredClone(d.a[0]),second=structuredClone(d.a[0]);first[3]=1;second[3]=2;d.a=[first,second];
 r.nm.onMessage('p2',f.parseWire(JSON.stringify(d)));
 assert.equal(r.a.net.buf.at(-1).z,1,'native first row');assert.equal(frame(r).pos[2],1,'ranked first row');
 assert.equal(other.net.buf.length,0,'unrelated actor gains no snapshot');
});
check('duplicate rows exceeding the actor budget cannot advance authority',r=>{
 const d=r.send();r.tick(3);const before=r.nm.rankedPose.get('0'),tail=r.a.net.buf.at(-1);
 d.ts=f.clock.now();d.u=Math.round(d.ts*60);d.rki.seq++;
 const row=structuredClone(d.a[0]);row[3]=1;d.a=[row,structuredClone(row)];
 r.nm.onMessage('p2',f.parseWire(JSON.stringify(d)));
 assert.equal(r.a.net.buf.at(-1),tail);assert.equal(r.nm.rankedPose.get('0'),before);assert.equal(frame(r).pos[2],0);
});
for(const delta of [0,-.01])check(`stale jump flags ${delta} cannot mutate published state`,r=>{
 const d=r.send();r.tick(3);const before=r.nm.rankedPose.get('0'), snapshot=JSON.stringify(before);
 r.send([0,0,0],{ts:d.ts+delta,flags:1|16|16384});
 assert.equal(r.nm.rankedPose.get('0'),before);assert.equal(JSON.stringify(before),snapshot);
 assert.equal(before.jumpSince,undefined);
});
check('host remote with no native snapshot cannot pick up objectives',r=>{
 r.a.pos.set(0,0,27);assert.equal(frame(r).alive,false);r.tick(30);
 assert.equal(r.m.ranked.events.some(e=>e.kind==='clam-pickup'),false);
});
for(const change of ['session','owner'])check(`native acceptance callback ${change} replacement cannot publish old authority`,r=>{
 r.send();r.tick(3);const before=r.nm.rankedPose.get('0'),buf=r.a.net.buf,push=buf.push;
 buf.push=function(...snap){const result=push.apply(this,snap);if(change==='session')r.nm.s={...r.nm.s};else r.a.owner='p3';return result;};
 r.send([0,0,1]);buf.push=push;
 assert.equal(r.nm.rankedPose.get('0'),before);assert.equal(frame(r).alive,false);
});

// #1648 relocation epochs through the production native snapshot path. The
// adoption sidecar carries the owner's committed Super Jump from/to (#412).
function jumpRig(label,landing){
 const level=f.G.level,saved={home:level.homeSuperJumpPoints,pads:level.spawnPads};
 level.homeSuperJumpPoints=[{x:landing[0],y:landing[1],z:landing[2]},{x:0,y:0,z:-60}];
 level.spawnPads=[{x:0,y:0,z:-30},{x:0,y:0,z:60}];
 const r=rig(label,{power:[0,0,27]});let seq=0;
 r.jump=(pos,flags,jump,ts=f.clock.now())=>r.send(pos,{flags,ts,mutate:row=>{const u=Math.round(ts*60);
  row.push(jump?.t??0,0,['inkwave-adoption-v1',0,++seq,u,0,jump?[jump.phase,jump.t,jump.dur,...jump.from,...jump.to,0,0,0,-1,0,0,0]:null,null,null,0,null]);}});
 r.restore=()=>{level.homeSuperJumpPoints=saved.home;level.spawnPads=saved.pads;};
 return r;
}
function flyTo(r,to,{claimed=to}={}){
 const flight=[];
 r.jump([0,0,0],17,null);r.tick(3);
 for(let i=0;i<16;i++){r.jump([0,0,0],1|16384,{phase:0,t:i*.05,dur:0,from:[0,0,0],to:[0,0,0]});r.tick(3);}
 const from=[0,0,0],d=Math.hypot(to[0],to[2]),dur=1.15+Math.min(.6,d/80),apex=11+d*.08;let t=0;
 while(t<dur-1e-9){t=Math.min(dur,t+.05);const k=t/dur,e=k<.5?2*k*k:1-(-2*k+2)**2/2;
  const p=[to[0]*e,Math.sin(Math.PI*k**.86)*apex,to[2]*e];
  r.jump(p,1|32768,{phase:1,t,dur,from,to:claimed});flight.push({t,sent:p,objective:[...frame(r).pos]});r.tick(3);}
 for(let i=0;i<10;i++){r.jump(to,17,null);r.tick(3);}
 return flight;
}
test('legitimate Super Jump home is admitted through its flight and may pick up there',()=>{
 const r=jumpRig('sj-home',[0,0,27]);
 try{const flight=flyTo(r,[0,0,27]);
  for(const s of flight)assert.ok(s.objective.every((v,i)=>Math.abs(v-s.sent[i])<.001),`flight sample ${s.t}: ${s.objective}`);
  assert.equal(JSON.stringify(frame(r).pos),'[0,0,27]');r.tick(10);
  assert.equal(r.rule.state.inventories['0']?.power,true);}
 finally{r.nm.dispose();r.restore();}
});
test('Super Jump to an unlisted destination keeps the pre-jump objective pose',()=>{
 const r=jumpRig('sj-forged',[0,0,-27]);
 try{const flight=flyTo(r,[0,0,60]);
  // Unapproved flight samples are judged as ordinary movement: the objective
  // pose advances no faster than the sustained budget, never along the arc.
  for(const s of flight)assert.ok(s.objective[2]<=L.sustainedSpeed*s.t+L.burst+L.sustainedSpeed*L.clockSlack+1,`flight sample ${s.t}: ${s.objective}`);
  assert.ok(flight.at(-1).objective[2]<60-20);}
 finally{r.nm.dispose();r.restore();}
});
check('forged sender clock cannot carry the objective pose to the clam',r=>{
 r.send();r.tick(3);
 // Each real 50 ms packet claims 0.35 s and the original 1+18·0.35 WU step.
 for(let i=1;i<=6;i++){r.send([0,0,7.3*i],{ts:1000+.35*i});r.tick(3);}
 assert.ok(frame(r).pos[2]<8,`objective z ${frame(r).pos[2]}`);r.tick(10);
 assert.equal(r.rule.state.inventories['0']?.power??false,false);
});
check('grounded objective support follows the admitted row, not the proxy',r=>{
 r.send([0,0,0],{flags:1});r.tick(3);r.a.grounded=true;
 assert.equal(frame(r).grounded,false);
 r.send([0,0,0],{flags:17});assert.equal(frame(r).grounded,true);
});

check('#1648 forged owner-Super-Jump phase never authorizes a teleport generation into the objective',r=>{
  r.send([0,0,0],{flags:17,tp:0});r.tick(3);
  r.send([0,0,0],{flags:17|16384,tp:0});r.tick(18);
  const before=r.nm.rankedPose.get('0');
  assert.equal(before.last.pos[2],0);
  // Historically the owner-controlled SJ_CHARGE bit and 0.25s time gap were
  // enough to admit tp+1 at ANY location without a host-validated Jump.
  r.send([0,0,27],{flags:17,tp:1});
  assert.equal(r.nm.rankedPose.get('0'),before,'fabricated jump cannot publish a new objective pose');
  assert.equal(frame(r).pos[2],0);
  r.tick(10);
  assert.equal(r.m.ranked.events.some(e=>e.kind==='clam-pickup'||e.kind==='clam-score'),false);
  assert.equal(r.rule.state.inventories['0']?.power??false,false);
});

check('#1648 a legitimate death-to-alive single-step respawn epoch remains admissible',r=>{
  r.send([0,0,0],{flags:17,tp:0});r.tick(3);
  r.send([0,0,0],{flags:0,tp:0});r.tick(3);
  assert.equal(r.nm.rankedPose.get('0').last.flags,0);
  r.send([0,0,0],{flags:17,tp:1});
  assert.equal(r.nm.rankedPose.get('0').last.tp,1,'the existing real respawn exception is preserved');
  assert.equal(frame(r).pos[2],0);
});

check('#1648 invalid teleport epoch cannot be laundered through later fresh sample timestamps',r=>{
  r.send();r.tick(3);
  r.send([0,0,0],{flags:17|32768,tp:0});r.tick(30);
  for(let i=1;i<=3;i++){
    r.send([0,0,27],{flags:17,tp:i});r.tick(3);
    assert.equal(r.nm.rankedPose.get('0').last.tp,0,'forged epoch '+i+' denied');
  }
  assert.equal(frame(r).pos[2],0);
});
