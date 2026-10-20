import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Metadata-only regression: no native imports, actor HP, rendering, or token lifecycle.
// Read the actual sibling implementation, never a copied production fixture.
const source = fs.readFileSync(new URL('../combat-provenance.mjs', import.meta.url), 'utf8');
const tokenImport = "import { bindSubBirthCommit, closeSubBirthCommit } from './sub-birth-commit.mjs';";
assert.equal(source.split(tokenImport).length, 2, 'exactly one audited dependency');
const executable = source.replace(tokenImport, '').replaceAll('export function ', 'function ');
assert.doesNotMatch(executable, /\b(?:import|require|process|fetch|WebSocket|globalThis|eval|Function)\s*(?:[.(]|\{)/,
  'new capabilities require a fresh metadata boundary audit');
function run(body, direct = false) {
  assert.equal(executable.split('function flush(').length, 2, 'unique audited direct boundary');
  const prefix = direct ? executable.slice(0, executable.indexOf('function flush(')) : executable;
  assert.ok(prefix.length > 0);
  const code = 'let clock=100; const performance={now:()=>clock*1000};\n' + prefix +
    '\nfunction bindSubBirthCommit(){} function closeSubBirthCommit(){}\n' +
    '(' + body.toString() + ')()';
  // Token binding is explicitly stubbed. No host objects/functions enter this realm.
  const context = vm.createContext(Object.create(null), {codeGeneration:{strings:false, wasm:false}});
  return JSON.parse(JSON.stringify(new vm.Script(code).runInContext(context, {timeout:1000})));
}

test('PvP caps preserve exact boundaries, proof accounting, Boss and unrelated routes', () => {
  const rows = run(directCases, true);
  assert.equal(rows.length, 14);
  for (const row of rows) assert.equal(row.pass, true, row.name + ': ' + (row.message || ''));
});

test('cap rejection cannot reserve pending slots; legal retries and expiry retain semantics', () => {
  const rows = run(wrapperCases);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0].initial.pending, []);
  assert.deepEqual(rows[0].retry.pending, []);
  assert.deepEqual(rows[1].retry.pending, [{h:1,at:100}]);
  assert.deepEqual(rows[2].pending, []);
  assert.equal(rows[3].before.pending.length, 48);
  assert.equal(rows[3].after.pending.length, 47);
  assert.deepEqual(rows[3].after.accepted, [{h:2,d:160,from:'peer'}]);
  assert.deepEqual(rows[3].after.proofUses, [1]);
  assert.deepEqual(rows[3].expired.pending, []);
});

function directCases() {
const results=[];
const assert={equal(a,b,message=''){if(!Object.is(a,b))throw Error(message+' expected '+JSON.stringify(b)+' actual '+JSON.stringify(a));}};
function test(name,fn){try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,message:e.message});}}
const actor=(kind='shooter',special='storm')=>({
  nid:1,owner:'peerA',remote:true,team:0,alive:true,
  weapon:{id:kind,kind,range:35,fireInterval:.12,damage:36,special,sub:'bomb'},
  pos:{x:0,y:0,z:0},net:{cur:{f:1}},weaponRunner:{rolling:false},specialActive:null,
});
const victim=()=>({nid:2,owner:'local',remote:false,team:1,alive:true,pos:{x:0,y:0,z:7}});
function hit(v=2,h=1,w='shooter'){return{k:'hit',m:'test-match',a:1,v,d:36,w,h,l:0}};
function boss(q=1,c=-1,weak=0,w='shooter',d=36){return{k:'bhit',m:'test-match',a:1,d,w,q,c,l:0,weak}};
class Stub { constructor(){this.myId='local';this.cfg={id:'test-match'};this.byNid=new Map([[1,actor()],[2,victim()]]);this.isHost=true;this._disposed=false;this.match={state:'playing',boss:{sim:true,dead:false,pos:{x:0,y:0,z:3},invuln:false,crabs:new Map()}};}}
function capFixture(kind, route='event-proof') {
  const nm=new Stub(),a=nm.byNid.get(1);
  a.weapon.special=kind;
  nm.byNid.get(2).pos={x:0,y:0,z:3};
  nm.match.boss.pos={x:0,y:0,z:3};
  const proof={actor:1,kind:'special',cause:kind,at:100,
    origin:[0,0,0],unit:[0,0,1],reach:30,uses:0,maxUses:24,key:'cap-proof'};
  nm._combatProvenance={
    proofs:new Map(route==='event-proof'?[['peerA',[proof]]]:[]),
    pending:new Map([['peerA',[{type:'pvp',d:{...hit(2,8,kind),d:1},at:100}]]]),
    contacts:new Map([['sentinel',{at:100}]]),
  };
  if(route==='active-fallback')a.specialActive={id:kind};
  return {nm,a,proof};
}
for(const route of ['event-proof','active-fallback']) for(const kind of ['krakenRoyale','storm']) {
  const cap=kind==='krakenRoyale'?120:160;
  for(const damage of [cap,cap+1]) test(`PvP Special cap ${kind} ${route} damage=${damage}`,()=>{
    const {nm,proof}=capFixture(kind,route),s=nm._combatProvenance;
    const beforePending=JSON.stringify([...s.pending]),beforeContacts=JSON.stringify([...s.contacts]);
    assert.equal(combatAdmission(nm,'peerA',{...hit(2,1,kind),d:damage},'pvp',100),damage<=cap);
    if(route==='event-proof')assert.equal(proof.uses,damage<=cap?1:0,
      'successful event-proof must actually consume proof, not pass via fallback');
    assert.equal(JSON.stringify([...s.pending]),beforePending,'direct admission must not alter pending claims');
    if(damage>cap)assert.equal(JSON.stringify([...s.contacts]),beforeContacts,'cap rejection must not consume contact budget');
  });
  // Preserve the existing Boss behavior, NOT approval of its fallback/proof disparity.
  test(`Boss cap policy is untouched ${kind} ${route}`,()=>{
    const {nm,proof}=capFixture(kind,route);
    assert.equal(combatAdmission(nm,'peerA',boss(1,-1,0,kind,cap+1),'boss',100),route==='event-proof');
    if(route==='event-proof')assert.equal(proof.uses,1);
  });
}
test('PvP cap adds no current-position or attacker-life rejection to committed proof',()=>{
  const {nm,a,proof}=capFixture('krakenRoyale');
  a.pos={x:100,y:0,z:100};a.netLife=9;
  assert.equal(combatAdmission(nm,'peerA',{...hit(2,1,'krakenRoyale'),d:120},'pvp',100),true);
  assert.equal(proof.uses,1);
});
test('unrelated main weapon remains outside Special cap',()=>{
  const {nm,proof}=capFixture('storm');
  proof.kind='main';proof.cause='shooter';
  assert.equal(combatAdmission(nm,'peerA',{...hit(),d:161},'pvp',100),true);
  assert.equal(proof.uses,1);
});

return results;
}

function wrapperCases() {
const rows=[];
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+': '+JSON.stringify(a)+' != '+JSON.stringify(b));};
class Stub {
 constructor(){this.myId='local';this.cfg={id:'m'};this.peers=new Map();this.accepted=[];this.calls=0;this.ticks=0;
 this.byNid=new Map([[1,{nid:1,owner:'peer',remote:true,team:0,alive:true,weapon:{id:'shooter',kind:'shooter',special:'storm',sub:'bomb'},pos:{x:0,y:0,z:0},net:{cur:{f:1}}}],[2,{nid:2,owner:'local',remote:false,team:1,alive:true,pos:{x:0,y:0,z:3}}]]);this.match={state:'playing'};}
 _tick(from,d){if((this.peers.get(from)?.lastTs??-Infinity)>=d.ts)return;this.peers.set(from,{lastTs:d.ts});}
 _hit(d,from){this.accepted.push({h:d.h,d:d.d,from});return true;}
 onMessage(from,d){if(d.k==='hit')return this._hit(d,from);}
 onLeave(){} dispose(){} bind(){}
}
// Explicit synthetic payload policy for cap-only wrappers, not token/native acceptance.
installCombatProvenance(Stub,{hitPayloadAllowed:d=>Number.isFinite(d?.d)&&d.d>0&&d.d<=500&&['storm','angleShooter'].includes(d.w)&&(d.w!=='angleShooter'||d.d<=40)});
function claim(nm,h,damage=161){if(++nm.calls>3)throw Error('event budget');nm.onMessage('peer',{k:'hit',m:'m',a:1,v:2,l:0,h,seq:h,w:'storm',d:damage});}
function tick(nm,time){if(++nm.ticks>2)throw Error('tick budget');clock=time;nm._tick('peer',{k:'t',ts:time,a:[],e:[]});}
function proof(nm){state(nm).proofs.set('peer',[{actor:1,kind:'special',cause:'storm',at:clock,origin:[0,0,0],unit:[0,0,1],reach:30,uses:0,maxUses:24,key:'metadata'}]);}
function snap(nm){const s=state(nm);return{pending:(s.pending.get('peer')||[]).map(x=>({h:x.d.h,at:x.at})),accepted:nm.accepted.slice(),proofUses:(s.proofs.get('peer')||[]).map(x=>x.uses),events:nm.calls,ticks:nm.ticks};}
function run(name,fn){clock=100;const nm=new Stub();const result=fn(nm);if(nm.calls>3||nm.ticks>2)throw Error('bound');rows.push({name,...result});}
run('oversized proof claim never queues or consumes proof',nm=>{proof(nm);claim(nm,1);const initial=snap(nm);tick(nm,100.5);const retry=snap(nm);tick(nm,101);const expired=snap(nm);eq(initial.accepted,[],'cap rejected');eq(retry.accepted,[],'retry rejected');eq(expired.pending,[],'expiry');eq(initial.proofUses,[0],'proof budget');return{initial,retry,expired};});
run('same legal hit retry does not refresh pending age or duplicate entry',nm=>{claim(nm,1,160);const initial=snap(nm);clock=100.4;claim(nm,1,160);const retry=snap(nm);tick(nm,101);const expired=snap(nm);eq(initial.pending,[{h:1,at:100}],'legal claim initially queued');eq(initial.pending,retry.pending,'same h metadata');eq(expired.pending,[],'original age expires');return{initial,retry,expired};});
run('two oversized unique claims occupy no slots',nm=>{claim(nm,1);claim(nm,2);const result=snap(nm);eq(result.accepted,[],'no admitted callbacks');return result;});
run('oversized claim cannot displace legal pending claim at queue capacity',nm=>{const s=state(nm);s.pending.set('peer',Array.from({length:47},(_,i)=>({type:'pvp',at:100,d:{k:'hit',m:'m',a:1,v:2,l:0,h:100+i,seq:100+i,w:'storm',d:161}})));claim(nm,1);claim(nm,2,160);const before=snap(nm);proof(nm);tick(nm,100.1);const after=snap(nm);tick(nm,101);const expired=snap(nm);eq(expired.pending,[],'pre-existing entries retain expiry');return{seededMetadataRows:47,before,after,expired};});
run('Angle overflow then same-ID legal claim remains available',nm=>{nm.byNid.get(1).weapon.sub='angleShooter';const emit=d=>{if(++nm.calls>3)throw Error('event budget');nm.onMessage('peer',{k:'hit',m:'m',a:1,v:2,l:0,h:1,seq:1,w:'angleShooter',d});};emit(40.1);const invalid=snap(nm);eq(invalid.pending,[],'invalid cannot reserve h');emit(40);const queued=snap(nm);eq(queued.pending.length,1,'legal same h deferred');state(nm).proofs.set('peer',[{actor:1,kind:'sub',cause:'angleShooter',at:clock,origin:[0,0,0],unit:[0,0,1],reach:30,uses:0,maxUses:8,key:'angle-metadata'}]);tick(nm,100.1);const delivered=snap(nm);eq(delivered.accepted,[{h:1,d:40,from:'peer'}],'legal same h delivered');return{invalid,queued,delivered};});
return rows;
}
