import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const wireModule=process.env.INKWAVE_BUILT_SITE?pathToFileURL(path.join(path.resolve(process.env.INKWAVE_BUILT_SITE),'patches/network-replication/native-command-wire.mjs')):new URL('../native-command-wire.mjs',import.meta.url);
const {
 createNativeCommandRoomPolicy,nativeCommandCapability,admitNativeCommandPeer,
 attachNativeCommandEnvelope,prepareNativeCommandEnvelope,commitNativeCommandEnvelope,retireNativeCommandPeer,
 advanceNativeCommandLife,
}=await import(wireModule.href);
const room=()=>createNativeCommandRoomPolicy({epoch:'match',build:'03523329',seed:123,roster:[{nid:1,owner:'A',life:1},{nid:2,owner:'B',life:1}]});
function setup(){const p=room(),r=admitNativeCommandPeer(p,{from:'A',capability:nativeCommandCapability(p),at:100});assert.equal(r.ok,true);return {p,peer:r.peer};}
const command=()=>({nid:1,owner:'A',life:1,input:{fire:true,squid:false,sub:false,jump:false,special:false,booyah:false,throw:false,move:[.2,.3]},aim:[.1,.2],aimPoint:[3,2,8]});
const frames=(n=1,start=1,time=1000)=>Array.from({length:n},(_,i)=>({tick:start+i,dt:1/60,sourceTime:time+(i+1)/60,commands:[command()]}));
const encode=(p,fs=frames(),sequence=1)=>attachNativeCommandEnvelope({k:'t',a:[[1,2,3]],e:[[1,'ev','weapon:fire',{a:1}]]},p,{from:'A',sequence,frames:fs});
const plain=x=>JSON.parse(JSON.stringify(x));

test('sibling envelope round-trips exact raw input and leaves native tuples byte-identical',()=>{
 const {p,peer}=setup(),base={k:'t',a:[[1,2,3,undefined]],e:[[1,'ev','weapon:fire',{actor:{n:1}}]]},before=JSON.stringify(base);
 const packet=attachNativeCommandEnvelope(base,p,{from:'A',sequence:1,frames:frames(3)});
 assert.equal(JSON.stringify(base),before);assert.equal(JSON.stringify(packet.a),JSON.stringify(base.a));assert.equal(JSON.stringify(packet.e),JSON.stringify(base.e));assert.equal(packet.a,base.a);assert.equal(packet.e,base.e);
 const prepared=prepareNativeCommandEnvelope(peer,plain(packet),{from:'A',at:100.05});assert.equal(prepared.ok,true);assert.deepEqual(prepared.frames,frames(3));
 assert.equal(commitNativeCommandEnvelope(peer,prepared.token),true);assert.equal(commitNativeCommandEnvelope(peer,prepared.token),false);
});
for(const capability of [undefined,{version:1},{version:2,schema:'legacy',build:'03523329'},{version:2,schema:'native-intent-v2',build:'old'}])test('fixed v2 room rejects omitted/legacy/wrong-build capability: '+JSON.stringify(capability),()=>{
 const p=room();assert.equal(admitNativeCommandPeer(p,{from:'A',capability,at:100}).ok,false);assert.equal(p.version,2);
});
for(const packet of [{k:'hit'},{nc:null},{nc:{version:1}},{nc:{version:2,frames:[]}}, {nc:{version:2,legacy:true}}])test('required-room omission/malformed/legacy cannot select a fallback: '+JSON.stringify(packet),()=>{
 const {peer}=setup();assert.equal(prepareNativeCommandEnvelope(peer,packet,{from:'A',at:101}).ok,false);
});
test('plain policy copies and owner self-declaration grant no room/peer authority',()=>{
 const {p,peer}=setup();assert.throws(()=>nativeCommandCapability({...p}),/Trusted/);
 assert.equal(admitNativeCommandPeer(p,{from:'stranger',capability:nativeCommandCapability(p),at:100}).ok,false);
 assert.equal(prepareNativeCommandEnvelope(peer,encode(p),{from:'B',at:101}).ok,false);
 assert.equal(prepareNativeCommandEnvelope(peer,encode(p),{at:101}).ok,false);
});
test('unknown result/resource fields cannot become input or initialize source state',()=>{
 const {p}=setup();
 for(const key of ['ink','charge','damage','grounded','birthcount','specialGauge']){
   const fs=frames();fs[0].commands[0][key]=100;assert.throws(()=>encode(p,fs),/fields/);
 }
 const fs=frames();fs[0].commands[0].input.charge=1;assert.throws(()=>encode(p,fs),/request/);
});
test('foreign/life/duplicate/omitted actor rows reject before timeline reservation',()=>{
 const {p,peer}=setup(),good=encode(p);
 for(const mutate of [q=>q.nc.frames[0][3][0][0]=2,q=>q.nc.frames[0][3][0][1]=2,q=>q.nc.frames[0][3].push(q.nc.frames[0][3][0]),q=>q.nc.frames[0][3]=[]]){
  const q=plain(good);mutate(q);assert.equal(prepareNativeCommandEnvelope(peer,q,{from:'A',at:101}).ok,false);
 }
 const ok=prepareNativeCommandEnvelope(peer,good,{from:'A',at:101});assert.equal(ok.ok,true);assert.equal(commitNativeCommandEnvelope(peer,ok.token),true);
});
test('dt/time/frame gaps and speedup cannot fund a native replay',()=>{
 const {p,peer}=setup();
 const good=encode(p,frames(3));assert.equal(prepareNativeCommandEnvelope(peer,good,{from:'A',at:100.049}).ok,false);
 for(const mutate of [q=>q.nc.frames[1][0]=9,q=>q.nc.frames[1][2]+=.01,q=>q.nc.frames[0][1]=0,q=>q.nc.frames[0][1]=.2,q=>q.nc.frames[0][3][0][3]=2]){
   const q=plain(good);mutate(q);assert.equal(prepareNativeCommandEnvelope(peer,q,{from:'A',at:101}).ok,false);
 }
 assert.equal(prepareNativeCommandEnvelope(peer,good,{from:'A',at:100.05}).ok,true);
});
test('prepare is pure, commit is one-use, stale plans cannot advance twice',()=>{
 const {p,peer}=setup(),packet=encode(p),a=prepareNativeCommandEnvelope(peer,packet,{from:'A',at:101}),b=prepareNativeCommandEnvelope(peer,packet,{from:'A',at:101});
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(commitNativeCommandEnvelope(peer,{...a.token}),false);
 assert.equal(commitNativeCommandEnvelope(peer,a.token),true);assert.equal(commitNativeCommandEnvelope(peer,b.token),false);
 assert.deepEqual(prepareNativeCommandEnvelope(peer,packet,{from:'A',at:101}),{ok:true,duplicate:true,frames:[]});
 const changed=plain(packet);changed.nc.frames[0][3][0][2]=0;assert.equal(prepareNativeCommandEnvelope(peer,changed,{from:'A',at:101}).ok,false);
 const next=encode(p,frames(1,2,1000+1/60),2),n=prepareNativeCommandEnvelope(peer,next,{from:'A',at:101});assert.equal(n.ok,true);assert.equal(commitNativeCommandEnvelope(peer,n.token),true);
});
test('retirement rejects pending plans and all later packets',()=>{
 const {p,peer}=setup(),q=encode(p),a=prepareNativeCommandEnvelope(peer,q,{from:'A',at:101});retireNativeCommandPeer(peer);assert.equal(commitNativeCommandEnvelope(peer,a.token),false);assert.equal(prepareNativeCommandEnvelope(peer,q,{from:'A',at:101}).ok,false);
});
test('packet quota remains bounded without mutating the legacy message',()=>{
 const {p}=setup();assert.throws(()=>encode(p,frames(257)),/envelope/);
 const roster=Array.from({length:32},(_,nid)=>({nid,owner:'A',life:1})),large=createNativeCommandRoomPolicy({epoch:'m',build:'b',seed:1,roster});
 const fs=frames(256);for(const f of fs)f.commands=roster.map(r=>({...command(),nid:r.nid}));
 assert.throws(()=>encode(large,fs),/envelope/);
});
test('only trusted next-life enrollment can accept a respawn; old prepared plans retire',()=>{
 const {p,peer}=setup(),first=encode(p),old=prepareNativeCommandEnvelope(peer,first,{from:'A',at:101}),future=plain(first);future.nc.frames[0][3][0][1]=2;
 assert.equal(prepareNativeCommandEnvelope(peer,future,{from:'A',at:101}).ok,false);
 assert.equal(advanceNativeCommandLife(p,{nid:1,owner:'B',previousLife:1,life:2}),false);
 assert.equal(advanceNativeCommandLife(p,{nid:1,owner:'A',previousLife:1,life:3}),false);
 assert.equal(advanceNativeCommandLife(p,{nid:1,owner:'A',previousLife:1,life:2}),true);
 assert.equal(commitNativeCommandEnvelope(peer,old.token),false);
 assert.equal(prepareNativeCommandEnvelope(peer,first,{from:'A',at:101}).ok,false);
 const next=prepareNativeCommandEnvelope(peer,future,{from:'A',at:101});assert.equal(next.ok,true);assert.equal(commitNativeCommandEnvelope(peer,next.token),true);assert.equal(p.version,2);
});
test('rejoining cannot mint another elapsed budget or reset native input chronology',()=>{
 const {p,peer}=setup(),request={from:'A',capability:nativeCommandCapability(p),at:100};
 assert.equal(admitNativeCommandPeer(p,request).reason,'native-command-owner-already-enrolled');
 retireNativeCommandPeer(peer);assert.equal(admitNativeCommandPeer(p,{...request,at:200}).reason,'native-command-owner-already-enrolled');
});
test('native hold cancellation survives sidecar coding and cannot be paired with held fire',()=>{
 const {p,peer}=setup(),fs=frames();fs[0].commands[0].input.fire=false;fs[0].commands[0].cancel={fire:true,sub:false};
 const q=encode(p,fs),prepared=prepareNativeCommandEnvelope(peer,q,{from:'A',at:101});assert.equal(prepared.ok,true);assert.deepEqual(prepared.frames,fs);
 fs[0].commands[0].input.fire=true;assert.throws(()=>encode(p,fs),/cancellation/);
 const forged=plain(q);forged.nc.frames[0][3][0][2]|=1;assert.equal(prepareNativeCommandEnvelope(peer,forged,{from:'A',at:101}).ok,false);
});
