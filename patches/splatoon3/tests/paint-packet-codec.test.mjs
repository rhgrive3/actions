import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import{pathToFileURL}from'node:url';
const codecPath=process.env.INKWAVE_BUILT_SITE?pathToFileURL(path.resolve(process.env.INKWAVE_BUILT_SITE,'patches/splatoon3/runtime/paint-packet-codec.mjs')):new URL('../runtime/paint-packet-codec.mjs',import.meta.url);
const{encodePaintEvents:encode,decodePaintEvents:decode,PAINT_PACKET_CODEC_VERSION:V,PaintPacketNegotiation:Negotiation}=await import(codecPath);
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


const tick=()=>({k:'t',ts:1,a:[],e:rows()});let nonce=0;
const make=()=>new Negotiation(()=> (++nonce).toString(16).padStart(32,'0'));
function pair(ids=['a','b']){const nodes={a:make(),b:make()},q=[],sent=[];for(const [id,n]of Object.entries(nodes))n.sync('match',id,ids);
 const send=from=>(to,d)=>{q.push([from,to,JSON.parse(JSON.stringify(d))]);sent.push([from,to,d]);return true;};
 const flush=()=>{let budget=30;while(q.length){assert.ok(budget-->0);const [from,to,d]=q.shift();nodes[to]?.control(from,d,send(to));}};
 const start=()=>{for(const [id,n]of Object.entries(nodes))n.announce(send(id));flush();};return{nodes,q,sent,send,flush,start};}
test('hello/ack is bounded and steady legacy ticks carry zero added bytes',()=>{const p=pair();p.start();assert.equal(p.sent.length,4);for(let i=0;i<80;i++){p.nodes.a.announce(p.send('a'));const t={k:'t',a:[],e:[]};assert.equal(p.nodes.a.packTick(t),t);}assert.equal(p.sent.length,4);});
test('complete negotiation compresses with generation binding and retains every sidecar',()=>{const p=pair();p.start();const t=tick();t.gg={identity:['hat','shirt','shoe']};t.gc={elapsed:12};t.gb=[1,2];t.sjEpochs={0:3};t.e[0]._netTick=42;const wire=JSON.parse(JSON.stringify(p.nodes.a.packTick(t)));assert.ok(wire.pe);assert.equal(wire.pc,undefined);const out=p.nodes.b.acceptTick('a',wire);assert.deepEqual(out,JSON.parse(JSON.stringify(t)));assert.equal(t.e[0]._netTick,42);});
test('unknown peer and unknown version remain legacy',()=>{const p=pair(['a','b','legacy']);p.start();assert.equal(p.nodes.a.canEncode(),false);assert.equal(p.nodes.a.packTick(tick()).pe,undefined);p.nodes.a.control('legacy',{k:'paint-codec',v:'unknown',m:'match',h:'a'.repeat(32)},p.send('a'));assert.equal(p.nodes.a.canEncode(),false);});
test('lost hello, lost ack, and failed send do not infer delivery',()=>{for(const lost of ['hello','ack','send']){const p=pair();const send=from=>(to,d)=>{if(lost==='send')return false;if(lost==='hello'&&d.h||lost==='ack'&&d.a)return true;return p.send(from)(to,d);};for(const [id,n]of Object.entries(p.nodes))n.announce(send(id));while(p.q.length){const [from,to,d]=p.q.shift();p.nodes[to].control(from,d,send(to));}assert.equal(p.nodes.a.canEncode(),false,lost);assert.equal(p.nodes.b.canEncode(),false,lost);}});
test('one-direction acknowledgement permits only the acknowledged sender',()=>{const p=pair();for(const [id,n]of Object.entries(p.nodes))n.announce(p.send(id));while(p.q.length){const [from,to,d]=p.q.shift();if(from==='a'&&d.a)continue;p.nodes[to].control(from,d,p.send(to));}assert.equal(p.nodes.a.canEncode(),true);assert.equal(p.nodes.b.canEncode(),false);assert.deepEqual(p.nodes.b.acceptTick('a',p.nodes.a.packTick(tick())).e,rows());});
test('ack before peer hello proves receipt of the current challenge',()=>{const p=pair();p.nodes.a.announce(p.send('a'));p.nodes.b.announce(p.send('b'));const aHello=p.q.shift(),bHello=p.q.shift();p.nodes.b.control(aHello[0],aHello[2],p.send('b'));const ack=p.q.shift();p.nodes.a.control(ack[0],ack[2],p.send('a'));assert.equal(p.nodes.a.canEncode(),true);p.nodes.a.control(bHello[0],bHello[2],p.send('a'));assert.equal(p.nodes.a.canEncode(),true);p.flush();assert.equal(p.nodes.b.canEncode(),true);});
test('wrong sender, old nonce, alternate match and malformed control cannot acknowledge',()=>{const p=pair();p.start();const old=p.sent.find(x=>x[0]==='b'&&x[2].a)[2];p.nodes.a.forget('b');p.nodes.a.sync('match','a',['a','b']);for(const [from,d]of [['b',old],['stranger',{...old,a:p.nodes.a.members.get('b').challenge}],['b',{...old,a:p.nodes.a.members.get('b').challenge,m:'elsewhere'}],['b',{...old,a:p.nodes.a.members.get('b').challenge,n:{x:1}}]]){p.nodes.a.control(from,d,p.send('a'));assert.equal(p.nodes.a.canEncode(),false);} });
test('same-id rejoin and new match invalidate old compressed packets and capabilities',()=>{const p=pair();p.start();const wire=p.nodes.a.packTick(tick());p.nodes.b.forget('a');p.nodes.b.sync('match','b',['a','b']);assert.equal(p.nodes.b.acceptTick('a',wire),null);assert.equal(p.nodes.b.canEncode(),false);p.nodes.b.sync('next','b',['a','b']);assert.equal(p.nodes.b.acceptTick('a',wire),null);});
test('leave during negotiation cannot authorize a departed sender',()=>{const p=pair();p.nodes.a.announce(p.send('a'));p.nodes.a.sync('match','a',['a']);p.flush();assert.equal(p.nodes.a.canEncode(),false);assert.equal(p.nodes.a.acceptTick('b',{k:'t',pe:encode(rows()),pn:'a'.repeat(32)}),null);});
test('invalid membership or nonce source fails closed',()=>{const n=new Negotiation(()=>null);n.sync('match','a',['a','b']);assert.equal(n.canEncode(),false);assert.equal(n.packTick(tick()).pe,undefined);assert.equal(n.sync('match','a',['a',null]),false);});
test('full message profitability includes generation field',()=>{const p=pair();p.start();for(let count=0;count<40;count++){const t=tick();t.e=t.e.slice(0,count);const out=p.nodes.a.packTick(t);assert.ok(JSON.stringify(out).length<=JSON.stringify(t).length);}});
test('compressed data still rejects stranger, old generation, and dual representations',()=>{const p=pair();p.start();const wire=p.nodes.a.packTick(tick());assert.equal(p.nodes.b.acceptTick('stranger',wire),null);assert.equal(p.nodes.b.acceptTick('a',{...wire,pn:'0'.repeat(32)}),null);assert.equal(p.nodes.b.acceptTick('a',{...wire,e:rows()}),null);});
test('dictionary common fields are scalar-only so decoded rows cannot share mutable options',()=>{
 for(const i of [0,1,2,3,4,5,6,7,10])for(const bad of [{x:1},[1]]){const p=encode(rows());p[1][0][i]=bad;assert.equal(decode(p),null,`common ${i}`);}
 const r=rows();r[0][9]={x:0};assert.equal(encode(r),null,'unexpected local shape stays legacy');
});
for(const kind of [0,'shot','line','blast','bomb','trail','drop','roll','rollFloor','speck'])test('native immutable kind '+kind+' remains compressible',()=>{
 const r=rows();for(const e of r)e[8]=kind;const p=encode(r);assert.ok(p);assert.deepEqual(decode(p),r);
});

test('whole packet profitability uses UTF-8 bytes with non-ASCII names and order strings',()=>{const p=pair();p.start();for(let count=0;count<=40;count++){const t=tick();t.name='日本語😀é';t.gg={name:'帽子🦑'};t.e=t.e.slice(0,count);for(const r of t.e)r[14][1]='試合🦑';const out=p.nodes.a.packTick(t);assert.ok(Buffer.byteLength(JSON.stringify(out))<=Buffer.byteLength(JSON.stringify(t)));assert.deepEqual(out.pe?decode(out.pe):out.e,t.e);}});

test('capability generation change negotiates fresh challenges without tick advertisements',()=>{const p=pair();p.start();const old=p.nodes.b.packTick(tick()),oldAck=p.sent.find(x=>x[0]==='b'&&x[2].a)[2];p.nodes.b=make();p.nodes.b.sync('match','b',['a','b']);p.nodes.b.announce(p.send('b'));p.flush();assert.ok(p.nodes.a.canEncode());assert.ok(p.nodes.b.canEncode());assert.equal(p.nodes.a.acceptTick('b',old),null);p.nodes.a.control('b',oldAck,p.send('a'));assert.ok(p.nodes.a.canEncode());const count=p.sent.length;for(let i=0;i<80;i++)p.nodes.a.announce(p.send('a'));assert.equal(p.sent.length,count);});
test('explicit incompatible capability cannot be restored by an old ack',()=>{const p=pair();p.start();const oldAck=p.sent.find(x=>x[0]==='b'&&x[2].a)[2];p.nodes.a.control('b',{k:'paint-codec',v:'unsupported',m:'match'},p.send('a'));p.nodes.a.control('b',oldAck,p.send('a'));assert.equal(p.nodes.a.canEncode(),false);const count=p.sent.length;for(let i=0;i<80;i++)p.nodes.a.announce(p.send('a'));assert.equal(p.sent.length,count);});

for(let depth=0;depth<=8;depth++)test('encoded passthrough depth '+depth+' is decodable or stays legacy',()=>{
 let v=1;for(let i=0;i<depth;i++)v={a:v};const r=rows();r.push([1,'ev','event',v,1,42]);const p=encode(r);
 if(p)assert.deepEqual(decode(JSON.parse(JSON.stringify(p))),r);else assert.ok(depth>=5);
 if(depth===5||depth===6){assert.equal(p,null);const peers=pair();peers.start();const t={...tick(),e:r};assert.equal(peers.nodes.a.packTick(t),t);}
});
test('wrapper node overhead retains the original legacy packet before receiver budget overflow',()=>{
 const r=rows();for(let i=0;i<468;i++)r.push([i,'ev',Array(134).fill(0)]);
 assert.equal(r.length,508);assert.equal(encode(r),null);
 const peers=pair();peers.start();const t={...tick(),e:r};assert.equal(peers.nodes.a.packTick(t),t);
});
test('string boundary and UTF-8 whole packet budgets stay symmetric after wrapping',()=>{
 for(const size of [1024,1026]){const r=rows();r.push([1,'ev','🦑'.repeat(size/2)]);const p=encode(r);
 if(size===1024){assert.ok(p);assert.deepEqual(decode(p),r);assert.ok(Buffer.byteLength(JSON.stringify(p))<Buffer.byteLength(JSON.stringify(r)));}else assert.equal(p,null);
 }
 const r=rows();r.push([1,'ev','x'.repeat(1025)]);assert.equal(encode(r),null);
});
