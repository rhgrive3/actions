import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './contact-provenance-fixture.mjs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';

// Instrument the actual semantic call, including esbuild's renamed imports
// and merged expression statements. A source-text replace silently omitted
// these hooks in emitted mode, leaving the original assertions unexercised.
function withReceiptHook(code,phase) {
  const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'}),nodes=[];
  const walk=node=>{
    if(!node||typeof node!=='object')return;
    if(typeof node.type==='string')nodes.push(node);
    for(const value of Object.values(node)) {
      if(Array.isArray(value))for(const item of value)walk(item);
      else if(value&&typeof value==='object')walk(value);
    }
  };
  walk(ast);
  const bindings=ast.body.filter(n=>n.type==='ImportDeclaration')
    .flatMap(n=>n.specifiers).filter(n=>n.imported?.name==='commitOwnerTick');
  assert.equal(bindings.length,1,'unique actual native receipt import');
  const commits=nodes.filter(n=>n.type==='CallExpression'&&
    n.callee.type==='Identifier'&&n.callee.name===bindings[0].local.name);
  assert.equal(commits.length,1,'unique actual native receipt commit');
  let call=commits[0],hook='_proofCommitHook';
  if(phase==='snapshot') {
    const list=call.arguments.at(-1);
    assert.equal(list.type,'Identifier','actual admitted-actor receipt list');
    const pushes=nodes.filter(n=>n.type==='CallExpression'&&
      n.callee.type==='MemberExpression'&&n.callee.object.type==='Identifier'&&
      n.callee.object.name===list.name&&n.callee.property.name==='push');
    assert.equal(pushes.length,1,'unique actual native actor receipt capture');
    call=pushes[0];hook='_proofSnapshotHook';
  }
  // Preserve the original call result even if the minifier uses it inside a
  // larger expression. The hook executes only after native capture/commit.
  const replacement=`((iwReceiptResult)=>{this.${hook}?.();return iwReceiptResult;})(${code.slice(call.start,call.end)})`;
  return code.slice(0,call.start)+replacement+code.slice(call.end);
}

const proofs=x=>x.state()?.proofs.get('peer')||[];
const row=(x,extra={})=>x.f.packActor(x.remote,{f:1,...extra});
const fire=(x,ts=1000,extra={})=>x.proof(ts,extra);
const hit=x=>x.hit({w:x.remote.weapon.id,d:36});
const tick=(x,extra={})=>x.tick(1000,100,{a:[row(x)],e:[fire(x)],...extra});
function rejected(x){assert.equal(proofs(x).length,0,'native-rejected data must not mint attack proof');hit(x);assert.equal(x.calls.length,0);}

for(const [name,change] of [
  ['invalid forwarded charge',x=>({e:[fire(x,1000,{charge:9})]})],
  ['invalid forwarded beam length',x=>({e:[fire(x,1000,{len:0})]})],
  ['future event timestamp',x=>({e:[fire(x,1000.05)]})],
  ['rejected actor row',x=>({a:[[17,0,2,0]]})],
  ['rejected actor life',()=>({l:{17:-1}})],
  ['malformed present actor roster',()=>({a:{}})],
])test(`${name} cannot authorize a hit after the enclosing owner timestamp advances`,async t=>{
  const x=await setup(t,{roller:false});
  // Charge/beam fields belong to the still-supported no-projectile Charger
  // path, so these negatives continue to exercise native payload rejection.
  if(name.startsWith('invalid forwarded'))x.remote.weapon=x.f.WEAPONS.charger;
  tick(x,change(x));
  assert.equal(x.nm.peers.get('peer').lastTs,1000);
  rejected(x);
});

test('trailing native-rejected duplicate row cannot replace the admitted muzzle pose',async t=>{
  const x=await setup(t,{roller:false});
  tick(x,{a:[row(x,{x:50}),[17,0,2,0]]});
  assert.equal(x.remote.net.buf.at(-1).x,50);assert.equal(x.remote.pos.x,0);
  assert.equal(x.nm.peers.get('peer').events.length,1);
  rejected(x);
});
test('valid admitted pose is retained when a rejected duplicate differs from both it and rendered pose',async t=>{
  const x=await setup(t,{roller:false});x.local.pos.set(50,2,7);
  tick(x,{a:[row(x,{x:50}),[17,0,2,0]],e:[x.birth(1000,{muzzle:[50,2,0]})]});
  assert.equal(x.remote.net.buf.at(-1).x,50);assert.equal(x.remote.pos.x,0);
  assert.equal(proofs(x).length,1);hit(x);assert.equal(x.calls.length,1);
});
test('native pose outside combat coordinate bounds cannot borrow the old rendered pose',async t=>{
  const x=await setup(t,{roller:false});tick(x,{a:[row(x,{x:2001})]});
  assert.equal(x.remote.net.buf.at(-1).x,2001);assert.equal(x.remote.pos.x,0);
  rejected(x);
});

for(const sequence of [10,65547])test(`R2 native rejected event sequence ${sequence} cannot mint proof`,async t=>{
  const x=await setup(t,{roller:false});
  tick(x,{r:2,u:100,e:[[1000,'ev','actor:jump',{actor:{n:17}},100,10]]});
  const peer=x.nm.peers.get('peer');x.nm._play('peer',peer.events.shift());
  assert.equal(peer._lastEventSeq,10);
  x.tick(1000.1,100.1,{r:2,u:106,a:[row(x)],e:[[...fire(x,1000.1),106,sequence]]});
  assert.equal(peer.lastTs,1000.1);assert.equal(peer.events.length,0);
  rejected(x);
});
test('R2 rejected owner simulation tick cannot mint an event proof',async t=>{
  const x=await setup(t,{roller:false});tick(x,{r:2,u:100,e:[]});
  x.tick(1000.1,100.1,{r:2,u:1000000,a:[row(x)],e:[[...fire(x,1000.1),1000000,1]]});
  assert.equal(x.nm.peers.get('peer').lastTs,1000.1);
  assert.equal(x.nm.peers.get('peer').events.length,0);rejected(x);
});
test('full native nonpaint FIFO cannot mint proof for an omitted shot',async t=>{
  const x=await setup(t,{roller:false});
  for(let n=0;n<2;n++)x.tick(1000+n*.1,100+n*.1,{u:100+n*6,a:[row(x)],
    e:Array.from({length:256},()=>[1000+n*.1,'ev','actor:jump',{actor:{n:17}}])});
  const peer=x.nm.peers.get('peer');assert.equal(peer.events.length,512);
  x.tick(1000.2,100.2,{u:112,a:[row(x)],e:[fire(x,1000.2)]});
  assert.equal(peer.lastTs,1000.2);assert.equal(peer.events.length,512);rejected(x);
});

test('accepted R2 shot retains admission timing and flushes a valid first pending hit',async t=>{
  const x=await setup(t,{roller:false});x.f.clock.set(100);hit(x);
  assert.equal(x.calls.length,0);
  const birth=x.birth();birth.splice(-2,2,100,1);birth._netTick=100;birth._netSeq=1;
  tick(x,{r:2,u:100,e:[birth]});
  assert.equal(x.nm.peers.get('peer').events.length,1,'proof admission does not force playback');
  assert.equal(x.calls.length,1);assert.equal(proofs(x).length,1);
});

test('a different accepted actor cannot lend its admission to a rejected actor event',async t=>{
  const x=await setup(t,{roller:false});
  const other=x.f.makeActor({nid:18,owner:'peer',remote:true,team:1,roller:false});
  x.nm.byNid.set(18,other);x.nm._setupActor(other);
  tick(x,{a:[[17,0,2,0],x.f.packActor(other,{f:1})],l:{17:0,18:0}});
  assert.equal(other.net.buf.length,1);assert.equal(x.remote.net.buf.length,0);rejected(x);
});

test('post-commit epoch replacement cannot transfer old native proof to the new match',async t=>{
  const x=await setup(t,{roller:false,transformSource(rel,code){
    return rel==='src/net/netmatch.js'?withReceiptHook(code,'commit'):code;
  }});
  x.nm._proofCommitHook=()=>{x.nm.cfg={...x.nm.cfg,id:'replacement-match'};};
  tick(x);assert.equal(x.nm.cfg.id,'replacement-match');rejected(x);
});

test('nested newer native snapshot cannot erase the already admitted outer shot pose',async t=>{
  const x=await setup(t,{roller:false,transformSource(rel,code){
    return rel==='src/net/netmatch.js'?withReceiptHook(code,'snapshot'):code;
  }});
  x.local.pos.set(50,2,7);
  x.nm._proofSnapshotHook=()=>{
    x.nm._proofSnapshotHook=null;
    x.tick(1000.1,100.1,{u:106,a:[row(x,{x:0})],e:[]});
  };
  tick(x,{a:[row(x,{x:50})],e:[x.birth(1000,{muzzle:[50,2,0]})]});
  assert.equal(x.remote.net.buf.at(-1).x,0);
  assert.equal(x.nm.peers.get('peer').lastTs,1000.1);
  assert.equal(proofs(x).length,1);assert.equal(proofs(x)[0].origin[0],50);
  hit(x);assert.equal(x.calls.length,1);
});
