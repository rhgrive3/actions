import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { validBossSnapshotRow } from '../snapshot-guard.mjs';
const exports = `
  export { Boss } from './inkwave-public/src/boss/boss.js';
  export { BossBrain } from './inkwave-public/src/boss/bossBrain.js';
  export { installIssueFiveHotfixA } from './patches/splatoon3/runtime/issue-five-hotfix-a.mjs';
  export { installIssueFiveHotfixB } from './patches/splatoon3/runtime/issue-five-hotfix-b.mjs';
  export { installIssueFiveHotfixC } from './patches/splatoon3/runtime/issue-five-hotfix-c.mjs';
  export { installDisconnectFidelity } from './patches/splatoon3/runtime/disconnect-fidelity.mjs';
  export { installSlosherIntermediatePaint } from './patches/splatoon3/runtime/slosher-intermediate-paint.mjs';
  export { installQuality } from './patches/local-quality/install.mjs';
  export { installWeaponsFidelity } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
  export { installIssueEightFollowup } from './patches/splatoon3/runtime/issue-eight-followup.mjs';
`;

async function rig({negative=false,boundaryNegative=false}={}) {
  const adapt=(rel,code)=>{
    const out=adaptBuildSource(rel,code);
    if(rel==='src/net/netmatch.js'&&negative)return out.replace(' && validBossSnapshotRow(d.B, d.ts)','');
    return rel==='src/net/netmatch.js'&&boundaryNegative?out.replace('const s = t >= last.t ? last : s0;','const s = t > last.t ? last : s0;'):out;
  };
  const f = await fixture({ fullRuntime: true, adapt, adaptRuntime:adapt, extraExports: exports });
  const source=fs.readFileSync(new URL('../../splatoon3/bootstrap.mjs',import.meta.url),'utf8');
  let previous=source.indexOf('const context = install(profile);');assert.ok(previous>=0);
  for(const name of ['installIssueFiveHotfixA','installIssueFiveHotfixB','installIssueFiveHotfixC','installDisconnectFidelity','installSlosherIntermediatePaint','installQuality','installWeaponsFidelity','installIssueEightFollowup']) {
    const index=source.indexOf(`  ${name}(`,previous);assert.ok(index>previous);previous=index;
    if(name==='installQuality')f[name](f.profile);else f[name](f.installedRuntime,f.profile);
  }
  const session={myId:'guest',hostId:'host',isHost:false,_members:new Map([['host','Host'],['guest','Guest'],['other','Other']]),tr:{broadcast(){},sendTo(){}}};
  const nm=new f.NetMatch(session,{id:'boss-snapshot',map:'reef',mode:'boss'});
  const boss=Object.assign(Object.create(f.Boss.prototype),{
    sim:false,pos:new f.THREE.Vector3(),vel:new f.THREE.Vector3(),bt:0,yaw:0,turn:0,hp:100,maxHp:100,phase:1,anim:0,flashN:0,weakN:0,killer:-1,
    net:{buf:[],err:new f.THREE.Vector3(),errV:new f.THREE.Vector3(),ready:false,prev:null},crabs:new Map(),hz:{moves:[],add(m){this.moves.push(m);},fizzle(){}},model:{flash(){}}
  });
  nm.match={boss,actors:[],state:'playing',playing:()=>true};f.G.match=nm.match;f.G.netm=nm;
  function send(B,ts=1000){nm.onMessage('host',{k:'t',ts,a:[],B});}
  function sample(ts=1000){nm.peers.get('host').tr=ts;nm._sampleBoss(1/60);boss._follow(1/60);}
  return {...f,nm,boss,send,sample};
}
test('Boss snapshot negative control: unvalidated container poisons actual guest pose and clock',async()=>{
  const f=await rig({negative:true});f.send({});f.sample();
  assert.ok(Number.isNaN(f.boss.pos.x));assert.ok(Number.isNaN(f.boss.bt));
});

test('Boss exact-latest negative control: old strict comparison falls back to the oldest valid snapshot',async()=>{
  const f=await rig({boundaryNegative:true}),a=f.boss.pack(false),b=structuredClone(a);
  a[1]=3;b[1]=9;b[7]=40;b[0]=10;
  f.send(a,1000);f.send(b,1001);f.sample(1001);
  assert.equal(f.boss.pos.x,3);assert.equal(f.boss.hp,100);assert.equal(f.boss.bt,0);
});

test('Boss exact-latest selects latest pose, clock, discrete state and crablet rather than oldest history',async()=>{
  const f=await rig(),a=f.boss.pack(false),b=structuredClone(a);
  a[1]=3;a[16]=[[1,3,0,0,0,30]];
  b[1]=9;b[7]=40;b[0]=10;b[8]=2;b[11]=2;b[16]=[[1,9,0,0,0,10]];
  f.send(a,1000);f.send(b,1001);f.sample(1001);
  assert.equal(f.boss.pos.x,9);assert.equal(f.boss.hp,40);assert.equal(f.boss.bt,10);
  assert.equal(f.boss.phase,2);assert.equal(f.boss.anim,2);
  assert.equal(f.boss.crabs.get(1).x,9);assert.equal(f.boss.crabs.get(1).hp,10);
});
test('Boss snapshot negative control: malformed crablet throws in native follow',async()=>{
  const f=await rig({negative:true}),row=f.boss.pack(false);row[16]=[null];f.send(row);
  assert.throws(()=>f.sample(),/null/);
});
test('malformed Boss snapshot never poisons the actual guest follow path',async()=>{
  const f=await rig();f.send({});f.sample();
  assert.ok(Number.isFinite(f.boss.pos.x));assert.ok(Number.isFinite(f.boss.bt));
});
test('malformed crablet row cannot throw in native Boss sampling',async()=>{
  const f=await rig(),row=f.boss.pack(false);row[16]=[null];f.send(row);
  assert.doesNotThrow(()=>f.sample());
  assert.equal(f.boss.net.buf.length,0);
});
test('malformed Boss components leave the last valid snapshot intact and following valid packets recover normally',async()=>{
  const f=await rig(),valid=f.boss.pack(false);valid[1]=3;f.send(valid);f.sample();
  const original=structuredClone(f.boss.net.buf);
  const bad=[{},true,4,'boss',[],valid.slice(0,17)];
  for(const index of [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17]){
    const row=structuredClone(valid);row[index]=NaN;bad.push(row);
  }
  for(const crabs of [{},[null],[[1,0,0]],[[1,0,0,0,0,Infinity]]]){const row=structuredClone(valid);row[16]=crabs;bad.push(row);}
  for(const move of [7,{}, {id:'slam',t0:0,s:0,d:[1,1,1],p:{x:0,y:0,z:0,rings:[null]}}])bad.push([...valid,move]);
  let ts=1000;
  for(const row of bad){f.send(row,++ts);assert.deepEqual(structuredClone(f.boss.net.buf),original);f.sample(ts);assert.ok(Number.isFinite(f.boss.pos.x));}
  const next=structuredClone(valid);next[1]=9;next[0]=2;next[7]=40;
  // The independent native exact-last-timestamp boundary is covered separately.
  f.send(next,++ts);f.sample(ts+1e-6);
  assert.equal(f.boss.net.cur.x,9);assert.ok(Number.isFinite(f.boss.pos.x));assert.equal(f.boss.hp,40);assert.ok(Math.abs(f.boss.bt-2)<1e-5);
  for(let i=0;i<120;i++)f.sample(ts+1e-6);
  assert.ok(Math.abs(f.boss.pos.x-9)<1e-3,'existing correction spring converges after the accepted snapshot');
});
test('native pack, all six native move producers, interpolation and current-host authority remain accepted',async()=>{
  const f=await rig(),b=f.boss;
  b.nav={floorAt:()=>0,inPad:()=>false,cast:()=>({dist:12,wall:false}),wallClear:()=>10,floorClear:()=>10};
  const target={alive:true,team:0,pos:new f.THREE.Vector3(4,0,6),vel:new f.THREE.Vector3()};f.G.actors=[target];
  b.difficulty='normal';
  const brain=Object.assign(Object.create(f.BossBrain.prototype),{b,rnd:()=>.5,cd:{},_lane:()=>({})});
  let ts=1000;
  for(const phase of [1,2,3])for(const id of ['slam','barrage','sweep','charge','crablets','frenzy']){
    b.phase=phase;b.bt=++ts;
    brain._start({id,lane:{}},target);
    const row=b.pack(true);assert.equal(row[18].id,id);assert.equal(validBossSnapshotRow(row,ts),true,id);
    f.send(row,ts);f.sample(ts+1e-6);assert.equal(b.move.id,id);
  }
  const row=b.pack(false),count=b.net.buf.length;
  const negativeHp=structuredClone(row);negativeHp[7]=-.1;negativeHp[16]=[[1,0,0,0,0,-1]];
  assert.equal(validBossSnapshotRow(negativeHp,ts),true,'finite pre-death negative HP is not a malformed snapshot');
  f.nm.onMessage('other',{k:'t',ts:++ts,a:[],B:row});assert.equal(b.net.buf.length,count,'nonhost cannot buffer Boss');
  f.nm.onMessage('host',{k:'t',ts:++ts,a:[]});assert.equal(b.net.buf.length,count,'missing Boss payload stays compatible');
  b.net.buf.length=0;b.net.prev=null;b.net.ready=false;b.net.err.set(0,0,0);b.net.errV.set(0,0,0);
  const a=b.pack(false),z=structuredClone(a);a[1]=0;z[1]=10;a[5]=z[5]=10;
  a[16]=[[1,0,0,0,0,30]];z[16]=[[1,10,0,0,0,20]];
  f.send(a,++ts);f.send(z,++ts);f.sample(ts-.5);
  assert.equal(b.pos.x,5);assert.equal(b.crabs.get(1).x,5);assert.equal(b.crabs.get(1).hp,20);
});
