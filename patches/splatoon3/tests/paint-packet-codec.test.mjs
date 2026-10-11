import test from 'node:test';import assert from 'node:assert/strict';
import{encodePaintEvents as encode,decodePaintEvents as decode,PAINT_PACKET_CODEC_VERSION as V}from'../runtime/paint-packet-codec.mjs';
const row=(i=0)=>[i/60,'s',i*.003,-2.5,8,1.56,0,.412,0,0,0,0,0,1,['inkwave-paint-order-v1','match',i,0],i,i];
const rows=()=>Array.from({length:40},(_,i)=>row(i));
test('JSON roundtrip preserves every value, sender-independent ordering and duplicates',()=>{const r=rows();r.splice(3,0,r[0]);r.push([.5,'foreign',{owner:'untrusted',value:7}]);const p=encode(r);assert.ok(p);assert.deepEqual(decode(JSON.parse(JSON.stringify(p))),r);assert.equal(r[0][0],0);});
test('wire dictionary preserves safe-integer overflow HLC strings verbatim',()=>{const r=rows();r[2][14][2]='90071992547409930000001';assert.deepEqual(decode(encode(r)),r);});
test('empty, unknown or larger encodings retain legacy fallback',()=>{assert.equal(encode([]),null);assert.equal(encode([[0,'x']]),null);assert.equal(encode([row()]),null);assert.equal(encode(Array.from({length:65},(_,i)=>{const r=row(i);r[5]=i;return r;})),null);});
for(const [name,mutate]of[
 ['unknown version',p=>p[0]='v2'],['row count',p=>p[2]=Array(513).fill(p[2][0])],['dictionary count',p=>p[1]=Array(65).fill(p[1][0])],['negative ref',p=>p[2][0][1]=-1],['fractional ref',p=>p[2][0][1]=.5],['missing ref',p=>p[2][0][1]=64],['long string',p=>p[1][0][9]='x'.repeat(1025)],['nonfinite',p=>p[2][0][2]=Infinity],['huge number',p=>p[2][0][2]=1e13],['unknown row tag',p=>p[2][0][0]=2],['wrong shape',p=>p[1][0].pop()],['extra shape',p=>p[2][0].push(8)],['prototype key',p=>p[2].push([0,[0,'x',JSON.parse('{"__proto__":{"polluted":true}}')]])],['depth',p=>{let v=0;for(let i=0;i<10;i++)v=[v];p[2].push([0,[0,'x',v]]);}]
])test('rejects '+name+' without expansion',()=>{const p=encode(rows());mutate(p);assert.equal(decode(p),null);assert.equal({}.polluted,undefined);});
test('maximum bounded valid row set expands to exactly512 original rows',()=>{const r=Array.from({length:512},(_,i)=>row(i));assert.deepEqual(decode(encode(r)),r);});
test('each decode reconstructs paint order arrays without mutating the dictionary',()=>{const p=encode(rows()),before=JSON.stringify(p),a=decode(p);a[0][14][2]=999;assert.equal(JSON.stringify(p),before);assert.deepEqual(decode(p),rows());});

import{PaintPacketNegotiation as Negotiation}from'../runtime/paint-packet-codec.mjs';
const tick=()=>({k:'t',ts:1,a:[],e:rows()});
test('mixed and unknown peers keep legacy rows until each current relay member agrees',()=>{
 const n=new Negotiation();n.sync('match','self',['self','new','old']);n.observe('new',[V,'match']);assert.equal(n.canEncode(),false);assert.deepEqual(n.packTick(tick()).e,rows());
 assert.equal(n.observe('stranger',[V,'match']),false);assert.equal(n.observe('old',['v2','match']),false);assert.equal(n.canEncode(),false);
 n.observe('old',[V,'match']);const p=n.packTick(tick());assert.equal(p.e,undefined);assert.ok(p.pe);
});
test('joining, leaving, host migration and new-match boundaries do not reuse stale capabilities',()=>{
 const n=new Negotiation();n.sync('match','self',['self','a']);n.observe('a',[V,'match']);assert.equal(n.canEncode(),true);
 n.sync('match','self',['self','a','b']);assert.equal(n.canEncode(),false);n.observe('b',[V,'match']);assert.equal(n.canEncode(),true);
 // Host role is irrelevant; membership and match identity, not host claims, gate support.
 n.sync('match','self',['self','b']);assert.equal(n.canEncode(),true);assert.equal(n.observe('a',[V,'match']),false);
 n.sync('match','self',['self','b','a']);assert.equal(n.canEncode(),false);
 n.sync('next','self',['self','b']);assert.equal(n.observe('b',[V,'match']),false);assert.equal(n.canEncode(),false);
 n.observe('b',[V,'next']);assert.equal(n.canEncode(),true);n.clear();assert.equal(n.canEncode(),false);
});
test('compressed input requires actual current sender and same match without granting authority',()=>{
 const a=new Negotiation(),b=new Negotiation();a.sync('match','a',['a','b']);b.sync('match','b',['a','b']);
 a.observe('b',[V,'match']);const wire=JSON.parse(JSON.stringify(a.packTick(tick())));
 assert.equal(b.acceptTick('stranger',wire),null);assert.deepEqual(b.acceptTick('a',wire).e,rows());
 const forged={...wire,pc:[V,'other']};assert.equal(b.acceptTick('a',forged),null);
 assert.equal(b.acceptTick('a',{...wire,e:rows()}),null);
 const legacy=tick();assert.equal(b.acceptTick('a',legacy),legacy);
});
test('invalid membership fails closed and no-members mode cannot compress',()=>{
 const n=new Negotiation();n.sync('match','self',['self']);assert.equal(n.canEncode(),false);
 assert.equal(n.sync('match','self',['a',null]),false);assert.equal(n.packTick(tick()).pe,undefined);
});
test('wire normalization drops only native non-index row annotations and keeps gear sidecars',()=>{
 const a=new Negotiation(),b=new Negotiation();a.sync('match','a',['a','b']);b.sync('match','b',['a','b']);a.observe('b',[V,'match']);
 const t=tick();t.e[0]._netSeq=99;t.e[0]._netTick=100;t.gg={identity:['hat','shirt','shoe']};t.gc={elapsed:12};t.sjEpochs={0:3};
 const expected=JSON.parse(JSON.stringify(t)),wire=JSON.parse(JSON.stringify(a.packTick(t)));assert.ok(wire.pe);
 const out=b.acceptTick('a',wire);for(const k of ['e','gg','gc','sjEpochs'])assert.deepEqual(out[k],expected[k]);
 assert.equal(t.e[0]._netSeq,99,'original local annotations unchanged');
});
test('dictionary common fields are scalar-only so decoded rows cannot share mutable options',()=>{
 for(const i of [0,1,2,3,4,5,6,7,10])for(const bad of [{x:1},[1]]){const p=encode(rows());p[1][0][i]=bad;assert.equal(decode(p),null,`common ${i}`);}
 const r=rows();r[0][9]={x:0};assert.equal(encode(r),null,'unexpected local shape stays legacy');
});
for(const kind of [0,'shot','line','blast','bomb','trail','drop','roll','rollFloor','speck'])test('native immutable kind '+kind+' remains compressible',()=>{
 const r=rows();for(const e of r)e[8]=kind;const p=encode(r);assert.ok(p);assert.deepEqual(decode(p),r);
});
