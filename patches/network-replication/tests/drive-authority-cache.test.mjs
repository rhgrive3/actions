import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/drive-network-before-7f863ea2.json',import.meta.url)));
const name='patches/network-replication/kit-paint-admission.mjs';
const current=fs.readFileSync(new URL('../kit-paint-admission.mjs',import.meta.url),'utf8');
function prune(code){const a=code.indexOf('function pruneState('),b=code.indexOf('\nfunction identify(',a);assert.ok(a>=0&&b>a);return new Function('clock',code.slice(a,b)+';return pruneState;')(()=>123);}
const oldPrune=prune(frozen.files[name]),newPrune=prune(current);
function world(){
  const actors=new Map(Array.from({length:8},(_,i)=>[i,{owner:'p'+i}])),members=new Map([...actors.values()].map(a=>[a.owner,{}]));
  const births=new Map(Array.from({length:200},(_,i)=>['b'+i,{nid:i%8,owner:'p'+(i%8),seq:i}]));
  return {nm:{byNid:actors,s:{_members:members}},state:{births,pending:new Map([...members].map(([id])=>[id,[id]]))}};
}
const visible=s=>({births:[...s.births],pending:[...s.pending],lastPrune:s.lastPrune});
test('authority reuse stays equivalent through in-place owner, member, Map and actor changes',()=>{
  const before=world(),after=world();
  const both=fn=>{fn(before);fn(after);};
  const check=()=>{oldPrune(before.nm,before.state);newPrune(after.nm,after.state);assert.deepEqual(visible(after.state),visible(before.state));};
  check(); assert.ok(after.state.authority);const retained=after.state.authority;
  for(let i=0;i<200;i++)check();assert.equal(after.state.authority,retained,'unchanged ordinary authority avoids birth scans');
  both(({nm})=>{nm.byNid.get(3).owner='p4';});check();
  both(({nm})=>{nm.s._members.delete('p5');});check();
  both(({nm})=>{nm.byNid.set(2,{owner:'p2'});});check();
  both(({nm})=>{nm.byNid=new Map(nm.byNid);nm.s._members=new Map(nm.s._members);});check();
  both(({nm})=>{nm.byNid.delete(7);});check();
  both(({nm})=>{nm.byNid.get=Map.prototype.get.bind(nm.byNid);});check();assert.equal(after.state.authority,null,'custom map operations retain uncached validation');
});

test('a newly queued pending owner invalidates the memo before any authority reuse',()=>{
  assert.match(current,/s\.authority=null;s\.pending\.set\(/);
  assert.match(current,/s\.births\.set\([^\n]+\);\s*s\.authority=null/);
  const before=world(),after=world();
  oldPrune(before.nm,before.state);newPrune(after.nm,after.state);
  for(const x of [before,after]){x.state.pending.set('departed',['proof']);x.state.authority=null;}
  oldPrune(before.nm,before.state);newPrune(after.nm,after.state);
  assert.deepEqual(visible(after.state),visible(before.state));assert.equal(after.state.pending.has('departed'),false);
});
