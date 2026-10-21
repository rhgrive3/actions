import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
async function setup(host=true){let time=100;
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>time*1000},extraExports:`export { Transport } from './inkwave-public/src/net/transport.js';export { NetSession } from './inkwave-public/src/net/session.js';export {outboundQueueStatus} from './patches/network-replication/outbound-prefix.mjs';`});
 const a=f.make();Object.assign(a,{nid:77,owner:'A',netLife:3});
 const s=new f.NetSession();Object.assign(s,{myId:'A',hostId:host?'A':'B',state:'match'});s._members.set('A',{});s._members.set('B',{});
 const n=new f.NetMatch(s,{id:'prefix-test',map:'reef'}),m={id:'prefix-test',state:'playing',time:180,actors:[a],playing:()=>true,canRespawn:()=>false};n.bind(m);s.match=n;f.G.netm=n;f.G.match=m;
 const tr=new f.Transport(),frames=[];s.tr=tr;tr.ws={readyState:1,bufferedAmount:0,send(raw){frames.push(raw)},close(){}};
 let errors=0,aborts=0;s.on('error',()=>errors++);f.G.game={netMatchAborted(){aborts++}};
 return {f,a,s,n,tr,frames,errors:()=>errors,aborts:()=>aborts,advance(){time+=.05;f.G.time+=.05;},rec(count,payload=''){for(let i=0;i<count;i++)n._rec(['tr',77,'jump',{payload}]);},tick(){time+=.05;f.G.time+=.05;return n._sendTick();},packets(){return frames.filter(x=>x.startsWith('b|')).map(x=>JSON.parse(x.slice(2))).filter(x=>x.k==='t')},close(){n.dispose();f.G.projectiles.clear();}};
}
for(const host of [true,false])test(`real ${host?'host':'follower'} retries accepted prefix once after backpressure`,async()=>{const w=await setup(host);try{
 w.rec(300);const original=w.n.out.map(x=>x.at(-1));w.tr.ws.bufferedAmount=524289;w.tick();assert.equal(w.packets().length,0);assert.equal(w.n.out.length,300);assert.equal(w.errors(),0);
 w.tr.ws.bufferedAmount=0;while(w.n.out.length)w.tick();const p=w.packets();assert.equal(p.length,2);assert.deepEqual(p.flatMap(p=>p.e.map(e=>e.at(-1))),Array.from(original));assert.ok(p.every(p=>p.e.length<=256));assert.ok(p[1].ts>p[0].ts);assert.equal(w.aborts(),0);
 }finally{w.close();}});
test('whole final packet rejection shrinks next tick; no duplicate timestamp',async()=>{const w=await setup();try{
 w.rec(200,'x'.repeat(260));const base=w.tr.broadcast;w.tr.broadcast=function(d){d.extra='x'.repeat(18000);return base.call(this,d)};w.tick();assert.equal(w.packets().length,0);assert.equal(w.n.out.length,200);w.tick();assert.equal(w.packets().length,1);assert.equal(w.n.out.length,100);w.tick();assert.equal(w.n.out.length,0);assert.ok(w.packets().every(p=>Buffer.byteLength('b|'+JSON.stringify(p))<=65536));
 }finally{w.close();}});
test('unknown false and thrown local send preserve every event',async()=>{const w=await setup();try{w.rec(5);const send=w.tr.broadcast;for(const fn of [()=>undefined,()=>false,()=>{throw Error('temporary')}]){w.tr.broadcast=fn;w.tick();assert.equal(w.n.out.length,5);assert.equal(w.errors(),0);}assert.match(w.f.outboundQueueStatus(w.n).lastError,/temporary/);w.tr.broadcast=send;while(w.n.out.length)w.tick();assert.equal(w.packets().flatMap(p=>p.e).length,5);}finally{w.close();}});
test('UTF8 overlimit rejected before websocket even below UTF16 limit',async()=>{const w=await setup();try{const d={k:'t',extra:'界'.repeat(23000)};assert.ok(JSON.stringify(d).length<65536);assert.equal(w.tr.broadcast(d),false);assert.equal(w.frames.length,0);}finally{w.close();}});
test('persistent congestion bounded by explicit existing session abort once',async()=>{const w=await setup();try{w.tr.ws.bufferedAmount=524289;for(let i=0;i<200;i++){w.rec(4);w.tick();}assert.equal(w.errors(),1);assert.equal(w.aborts(),1);assert.equal(w.s.state,'error');assert.equal(w.s.match,null);assert.equal(w.n.out.length,0);assert.equal(w.f.outboundQueueStatus(w.n).failed,true);}finally{w.close();}});
test('single impossible event fails explicitly; temporary single-event pressure does not',async()=>{const w=await setup();try{w.rec(1);w.tr.ws.bufferedAmount=524289;for(let i=0;i<20;i++)w.tick();assert.equal(w.errors(),0);assert.equal(w.n.out.length,1);w.rec(1,'界'.repeat(23000));assert.equal(w.errors(),1);assert.equal(w.n.out.length,0);}finally{w.close();}});
test('abort reentrancy cannot close replacement match/session owner',async()=>{const w=await setup();try{const replacement={newMatch:true};let closed=0;w.tr.close=()=>{closed++;w.s.match=replacement;w.s.tr={replacement:true}};w.rec(513);assert.equal(closed,1);assert.equal(w.s.match,replacement);assert.equal(w.errors(),0);assert.equal(w.aborts(),0);assert.equal(w.n.out.length,0);}finally{w.close();}});
test('partial direct-peer acceptance retry preserves real receiver event deduplication',async()=>{const w=await setup();const receivers=[];try{
 for(const myId of ['B','C']){const a=w.f.make();Object.assign(a,{nid:77,owner:'A',netLife:3,remote:true});const s=new w.f.NetSession();Object.assign(s,{myId,hostId:'A',state:'match'});s._members.set('A',{});s._members.set(myId,{});s.tr={sendTo:()=>true,broadcast:()=>true};const n=new w.f.NetMatch(s,{id:'prefix-test',map:'reef'});n.bind({...w.n.match,actors:[a]});s.match=n;receivers.push({n,a});}
 const deliver=(r,d)=>{w.f.G.netm=r.n;w.f.G.match=r.n.match;r.n.onMessage('A',JSON.parse(JSON.stringify(d)));const p=r.n.peers.get('A');if(p){p.tr=d.ts;r.n._playEvents();}w.f.G.netm=w.n;w.f.G.match=w.n.match;};
 w.tr.broadcast=d=>{if(d.k==='t')for(const r of receivers)deliver(r,d);return true};w.tick();
 for(const r of receivers)r.a.character.events.length=0;
 let partial=true;w.tr.broadcast=d=>{if(d.k==='t'){deliver(receivers[0],d);if(!partial)deliver(receivers[1],d);}return !partial;};
 w.rec(6);w.tick();assert.equal(w.n.out.length,6);partial=false;while(w.n.out.length)w.tick();
 for(const r of receivers)assert.equal(r.a.character.events.filter(e=>e[0]==='jump').length,6);
 }finally{for(const r of receivers)r.n.dispose();w.close();}});
test('byte queue bound is explicit below row limit and remains retired',async()=>{const w=await setup();try{w.tr.ws.bufferedAmount=524289;for(let i=0;i<130;i++)w.rec(1,'x'.repeat(5000));w.tick();assert.equal(w.errors(),1);const status=w.f.outboundQueueStatus(w.n);assert.ok(status.discardedRows<512);assert.equal(w.n.out.length,0);w.rec(1);assert.equal(w.n.out.length,0);}finally{w.close();}});
test('abort preserves local producer row return without queuing further events',async()=>{const w=await setup();try{w.rec(513);const e=w.n._rec(['tr',77,'jump',{}]);assert.ok(Array.isArray(e));assert.ok(Number.isSafeInteger(e._netSeq));assert.equal(w.n.out.length,0);assert.equal(w.errors(),1);}finally{w.close();}});
test('final sidecar-only and one-event envelopes fail explicitly when they can never fit',async()=>{for(const rows of [0,1]){const w=await setup();try{w.rec(rows);const send=w.tr.broadcast;w.tr.broadcast=function(d){d.extra='x'.repeat(66000);return send.call(this,d)};w.tick();assert.equal(w.errors(),1);assert.equal(w.aborts(),1);assert.equal(w.n.out.length,0);}finally{w.close();}}});
test('mutated queued payload is remeasured; synchronous append survives accepted prefix',async()=>{const w=await setup();try{w.rec(2);w.n.out[0][4].payload='x'.repeat(530000);w.tick();assert.equal(w.errors(),1);}finally{w.close();}const w2=await setup();try{w2.rec(2);const send=w2.tr.broadcast;let added=false;w2.tr.broadcast=function(d){const ok=send.call(this,d);if(!added){added=true;w2.rec(1)}return ok};w2.tick();assert.equal(w2.n.out.length,1);w2.tick();assert.equal(w2.n.out.length,0);assert.equal(w2.packets().flatMap(p=>p.e).length,3);}finally{w2.close();}});
test('negotiated codec failure/retry keeps actual paint order and receiver effects once',async()=>{const w=await setup();let receiver;try{w.f.context.crypto=webcrypto;
 const a=w.f.make();Object.assign(a,{nid:77,owner:'A',netLife:3,remote:true});const s=new w.f.NetSession();Object.assign(s,{myId:'B',hostId:'A',state:'match'});s._members.set('A',{});s._members.set('B',{});
 receiver=new w.f.NetMatch(s,{id:'prefix-test',map:'reef'});receiver.bind({...w.n.match,actors:[a]});s.match=receiver;
 const other=new w.f.Transport(),inbox=[];s.tr=other;other.ws={readyState:1,bufferedAmount:0,send:raw=>inbox.push(['B',raw]),close(){}};w.tr.ws.send=raw=>{w.frames.push(raw);inbox.push(['A',raw]);};
 const flush=()=>{let guard=0;while(inbox.length){assert.ok(++guard<100);const[from,raw]=inbox.shift();if(!raw.startsWith('b|')&&!raw.startsWith('s|'))continue;const d=JSON.parse(raw.slice(raw.startsWith('b|')?2:raw.indexOf('|',2)+1));const target=from==='A'?receiver:w.n;w.f.G.netm=target;w.f.G.match=target.match;target.onMessage(from,d);const p=target.peers.get(from);if(p&&d.k==='t'){p.tr=d.ts;target._playEvents();}}w.f.G.netm=w.n;w.f.G.match=w.n.match;};
 for(let i=0;i<3;i++){w.tick();flush();receiver._sendTick();flush();}
 let paints=0;w.f.G.paint.splat=()=>{paints++;return 1};
 for(let i=0;i<20;i++)w.n.recSplat(new w.f.THREE.Vector3(i*.1,0,0),.5,0,{seed:.25,claimOwner:w.a});w.rec(2);
 const original=w.n.out.map(e=>e.at(-1)),before=paints;w.tr.ws.bufferedAmount=524289;w.tick();flush();assert.equal(w.n.out.length,22);assert.equal(paints,before);w.tr.ws.bufferedAmount=0;
 while(w.n.out.length){w.tick();flush();}
 assert.equal(paints-before,20);const packets=w.packets();assert.ok(packets.some(p=>p.pe),'negotiated wire must actually use codec');
 assert.equal(a.character.events.filter(e=>e[0]==='jump').length,2);assert.equal(w.n.out.length,0);assert.equal(original.length,22);
 }finally{receiver?.dispose();w.close();}});

test('attempt receipt is private and cannot leak failure across nested transport sends',async()=>{const w=await setup();try{
 w.rec(1);const send=w.tr.broadcast;let attempts=[];
 w.tr.broadcast=function(d){const symbols=Object.getOwnPropertySymbols(d);assert.equal(symbols.length,1);const receipt=d[symbols[0]];attempts.push(receipt);
 // Separate synchronous send is oversized, but cannot poison this tick receipt.
 assert.equal(send.call(this,{k:'diagnostic',extra:'x'.repeat(66000)}),false);
 assert.equal(receipt.reason,null);return send.call(this,{...d});};
 w.tick();assert.equal(w.n.out.length,0);w.rec(1);w.tick();assert.equal(w.errors(),0);assert.notEqual(attempts[0],attempts[1]);
 for(const p of w.packets())assert.equal(Object.keys(p).some(k=>/receipt/i.test(k)),false);
 }finally{w.close();}});
test('actual sendTo preserves explicit local acceptance and UTF8 envelope guard',async()=>{const w=await setup();try{
 assert.equal(w.tr.sendTo('B',{k:'diagnostic',value:1}),true);assert.ok(w.frames.at(-1).startsWith('s|B|'));
 const count=w.frames.length;w.tr.ws.bufferedAmount=524289;assert.equal(w.tr.sendTo('B',{k:'diagnostic'}),false);assert.equal(w.frames.length,count);
 w.tr.ws.bufferedAmount=0;assert.equal(w.tr.sendTo('B',{k:'diagnostic',extra:'界'.repeat(23000)}),false);assert.equal(w.frames.length,count);
 }finally{w.close();}});

// Independent synchronous owner-reentry regression.
for(const stage of ['codec','accepted'])for(const identity of ['session','transport','owner','game-match'])test(`owner identity: ${stage} ${identity}`,async()=>{
 const w=await setup();try{
 w.f.context.crypto=webcrypto;w.rec(2);const events=[...w.n.out],newFrames=[];
 const originalSession=w.s,originalTransport=w.tr,originalMatch=w.n.match;
 const replacementTransport={broadcast(d){newFrames.push(d);return true},sendTo(){return true}},replacementOwner={replacement:true};
 const replace=()=>{
 if(identity==='session')w.n.s={...originalSession,tr:replacementTransport,match:w.n};
 if(identity==='transport')w.s.tr=replacementTransport;
 if(identity==='owner')w.s.match=replacementOwner;
 if(identity==='game-match')w.n.match={...originalMatch,replacement:true};
 };
 let callbacks=0;
 if(stage==='codec')w.tr.sendTo=(id,d)=>{assert.equal(d.k,'paint-codec');callbacks++;replace();return true};
 else {const native=w.tr.broadcast;w.tr.broadcast=function(d){callbacks++;const accepted=native.call(this,d);assert.equal(accepted,true);replace();return accepted};}
 const accepted=w.tick();assert.equal(callbacks,1);assert.equal(accepted,false);assert.equal(newFrames.length,0);assert.equal(w.packets().length,stage==='codec'?0:1);assert.equal(w.n.out.length,2);assert.ok(w.n.out.every((e,i)=>e===events[i]));
 if(identity==='owner'){w.tick();assert.equal(w.n.out.length,2);assert.equal(callbacks,1,'obsolete owner cannot retry into replacement');}
 }finally{w.close()}
});

// Independent synchronous owner-reentry regression.
for(const identity of ['session','game-match','global-network','global-match','global-game','game-match-owner'])test(`abort close reentry: ${identity}`,async()=>{
 const w=await setup();try{
 let closes=0,newGameAborts=0;const originalGame=w.f.G.game;originalGame.match=w.n.match;
 const replacementGame={match:{replacement:true},netMatchAborted(){newGameAborts++}},replacementSession={match:{replacement:true},tr:{replacement:true},state:'match'};
 const replace=()=>{
 if(identity==='session')w.n.s=replacementSession;
 if(identity==='game-match')w.n.match={replacement:true};
 if(identity==='global-network')w.f.G.netm={replacement:true};
 if(identity==='global-match')w.f.G.match={replacement:true};
 if(identity==='global-game')w.f.G.game=replacementGame;
 if(identity==='game-match-owner')originalGame.match={replacement:true};
 };
 w.tr.close=()=>{closes++;replace();};
 w.rec(513);console.log(JSON.stringify({identity,closes,newGameAborts,oldErrors:w.errors(),oldAborts:w.aborts()}));
 assert.equal(closes,1);assert.equal(newGameAborts,0);assert.equal(w.errors(),0,'retired owner must not issue an old error callback');assert.equal(w.aborts(),0,'old session must not call current game abort');assert.equal(w.n.out.length,0);w.rec(1);assert.equal(w.n.out.length,0);assert.equal(closes,1,'retired queue aborts only once');
 }finally{w.close()}
});

for(const reason of ['bye','network failure'])test(`session close ${reason} keeps one disposal and one existing game notification`,async()=>{const w=await setup();try{
 w.f.G.net=w.s;w.f.G.game.match=w.n.match;let disposed=0,states=0;const dispose=w.n.dispose.bind(w.n);w.n.dispose=()=>{disposed++;return dispose()};w.s.on('state',()=>states++);
 w.s._closed(reason);assert.equal(disposed,1);assert.equal(w.aborts(),1);assert.equal(w.errors(),reason==='bye'?0:1);assert.equal(w.s.state,reason==='bye'?'offline':'error');assert.equal(w.s.match,null);assert.equal(w.s.tr,null);assert.equal(states,reason==='bye'?0:1,'silent leave is already offline; only error adds a state notification');
 }finally{w.close();}});
for(const event of ['state','error'])for(const owner of ['game','room','match'])test(`session ${event} listener replacing ${owner} cannot notify a new owner`,async()=>{const w=await setup();try{
 w.f.G.net=w.s;w.f.G.game.match=w.n.match;let replacementAborts=0,handled=false;const replacement={replacement:true};
 w.s.on(event,()=>{if(handled)return;handled=true;if(owner==='game')w.f.G.game={netMatchAborted(){replacementAborts++}};
 else if(owner==='room'){w.s._roomAttempt++;w.s.code='NEWROOM';}
 else {w.s.match=replacement;w.f.G.game.match=replacement;w.f.G.match=replacement;}});
 w.s._closed('network failure');assert.equal(handled,true);assert.equal(w.aborts(),0);assert.equal(replacementAborts,0);
 if(owner==='room')assert.equal(w.s.code,'NEWROOM');if(owner==='match')assert.equal(w.s.match,replacement);
 }finally{w.close();}});
test('outbound limit error listener cannot abort the newly installed game',async()=>{const w=await setup();try{let replacementAborts=0;w.s.on('error',()=>{w.f.G.game={netMatchAborted(){replacementAborts++}};});w.rec(513);assert.equal(w.errors(),1);assert.equal(w.aborts(),0);assert.equal(replacementAborts,0);assert.equal(w.n.out.length,0);}finally{w.close();}});

test('outbound helper is source-bound and present in the selected emitted artifact', async () => {
  const fs = await import('node:fs'), path = await import('node:path'), { createHash } = await import('node:crypto');
  const { networkIdentity } = await import('../adapter.mjs');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const rel = 'patches/network-replication/outbound-prefix.mjs';
  const sourceHash = hash(fs.readFileSync(new URL('../outbound-prefix.mjs', import.meta.url)));
  assert.equal(networkIdentity()['outbound-prefix.mjs'], sourceHash, 'new helper must participate in canonical source identity');
  if (process.env.INKWAVE_BUILT_SITE) {
    const site = path.resolve(process.env.INKWAVE_BUILT_SITE);
    const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
    assert.equal(manifest.files['network-replication/outbound-prefix.mjs'], sourceHash);
    assert.equal(manifest.build.network['outbound-prefix.mjs'], sourceHash);
    assert.equal(manifest.artifacts[rel], hash(fs.readFileSync(path.join(site, rel))));
    assert.ok(manifest.build.revision, 'built artifact must carry an immutable revision');
    const versioned = '_versions/' + manifest.build.revision + '/' + rel;
    assert.equal(manifest.artifacts[versioned], hash(fs.readFileSync(path.join(site, versioned))));
    assert.equal(manifest.artifacts[versioned], manifest.artifacts[rel]);
  }
});

for(const event of ['state','error'])test(`same-owner ${event} presentation changes retain the old close notification`,async()=>{const w=await setup();try{
 w.f.G.net=w.s;w.f.G.game.match=w.n.match;let notified;w.f.G.game.netMatchAborted=reason=>{notified=reason};
 w.s.on(event,()=>{w.s.error=null;w.s.state='offline';});w.s._closed('network failure');
 assert.equal(notified,'Lost connection to the room');assert.equal(w.s.match,null);assert.equal(w.s.tr,null);
 }finally{w.close();}});
