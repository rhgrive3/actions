import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { pathToFileURL } from 'node:url';
const { validBossMove } = await import(process.env.INKWAVE_BUILT_SITE
  ? pathToFileURL(`${process.env.INKWAVE_BUILT_SITE}/patches/network-replication/snapshot-guard.mjs`)
  : new URL('../snapshot-guard.mjs', import.meta.url));
const exports = `
  export { Boss } from './inkwave-public/src/boss/boss.js';
  export { BossHazards } from './inkwave-public/src/boss/bossHazards.js';
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

async function rig({old=false}={}) {
  const adapt=(rel,code)=>{
    let out=adaptBuildSource(rel,code);
    if(old && rel==='patches/network-replication/snapshot-guard.mjs') {
      for(const [before,after] of [
        ['const wireScalar = value => finite(value) && Number.isSafeInteger(Math.round(value * 1000));', 'const wireScalar = finite;'],
        ['Array.isArray(p.b) && p.b.length > 0', 'Array.isArray(p.b)'],
        ["case 'sweep': return move.d[1] > 0 && fields", "case 'sweep': return fields"],
        ['|| !(move.d[0] > 0) ', ''],
      ]) {
        assert.equal(out.split(before).length,2,'counterfactual changes exactly this guard');
        out=out.replace(before,after);
      }
    }
    return out;
  };
  const f = await fixture({ fullRuntime: true, realProjectiles: true, adapt, adaptRuntime:adapt, extraExports: exports });
  const source=fs.readFileSync(new URL('../../splatoon3/bootstrap.mjs', import.meta.url),'utf8');
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

async function nativeRig(t, options) {
  const f=await rig(options);
  f.boss.log={moves:[]};f.boss.nav={inPad:()=>false,kindAt:()=>0};
  f.boss.hz=new f.BossHazards(f.boss);
  Object.assign(f.boss,{match:f.nm.match,st:{},_ev:{},_rain:new Map(),visible:true,dead:false,target:-1});
  f.boss.model={root:new f.THREE.Group(),update(){},flash(){}};
  t.after(()=>{f.boss.hz.dispose();f.nm.dispose();});
  return f;
}
const clean={id:'barrage',t0:1,s:0,d:[1,2,1],p:{sx:0,sy:5,sz:0,b:[[4,0,6,1]]}};
const malformed = () => {
  const overflow=structuredClone(clean);overflow.p.sx=1e308;overflow.p.b[0][0]=-1e308;
  return [overflow,{...structuredClone(clean),p:{sx:0,sy:5,sz:0,b:[]}},
    {id:'sweep',t0:1,s:0,d:[1,0,1],p:{ox:0,oy:2,oz:0,y:0,a0:-1,a1:1,c:0}},
    {id:'charge',t0:2,s:0,d:[0,1,1],p:{x:0,y:0,z:0,yaw:0,L:12,v:13,wall:0,stun:1}}];
};
function sendEvent(f,move,ts=1000,seq=1,from='host') {
  f.nm.onMessage(from,{k:'t',ts,r:2,u:1,a:[],e:[[ts,'bm',JSON.parse(JSON.stringify(move)),1,seq]]});
  const peer=f.nm.peers.get(from);peer.tr=ts;peer.sim=1;f.nm._playEvents();return peer;
}
function sendSnapshot(f,move,ts=1000,bt=2.5) {
  const row=f.boss.pack(false);row[0]=bt;row[10]=move.t0;row[9]=8;row.push(move);
  f.send(JSON.parse(JSON.stringify(row)),ts);f.nm.peers.get('host').tr=ts;f.nm._sampleBoss(1/60);
}
function assertFiniteBarrel(f) {
  f.boss.hz.update(1/60,2.5,{live:false});
  const barrel=f.boss.hz.fx.pools.barrel.list[0];
  assert.ok(barrel.position.toArray().every(Number.isFinite));
  assert.ok(barrel.scale.toArray().every(Number.isFinite));
}

test('#1178 unsafe/empty/zero-phase Boss move events do not reserve replay admission; valid same-sequence recovery draws normally',async t=>{
  for(const move of malformed()) {
    const f=await nativeRig(t),peer=sendEvent(f,move);
    assert.equal(f.boss.hz.moves.length,0,'malformed move never reaches native hazards');
    assert.equal(peer._lastEventSeq||0,0,'rejected move does not consume a valid successor');
    sendEvent(f,clean,1001);assert.equal(f.boss.hz.moves.length,1);assert.equal(peer._lastEventSeq,1);
    assertFiniteBarrel(f);sendEvent(f,clean,1002);assert.equal(f.boss.hz.moves.length,1);
  }
});

test('#1178 invalid move snapshots cannot replace the valid Boss record or poison its model/hazard update',async t=>{
  for(const move of malformed()) {
    const f=await nativeRig(t);
    sendSnapshot(f,clean);f.boss.update(1/60);assertFiniteBarrel(f);
    const before=structuredClone(f.boss.net.buf), previous=f.boss.move;
    sendSnapshot(f,move,1001,2);assert.deepEqual(structuredClone(f.boss.net.buf),before);
    assert.doesNotThrow(()=>f.boss.update(1/60));assert.equal(f.boss.move,previous);
    assert(f.boss.st.aim.toArray().every(Number.isFinite));assertFiniteBarrel(f);
    const next={...structuredClone(clean),t0:2};sendSnapshot(f,next,1002,3.5);f.boss.update(1/60);
    assert.equal(f.boss.move.t0,2);assert(f.boss.st.aim.toArray().every(Number.isFinite));
  }
});

test('#1178 finite-but-unrepresentable move scalars are rejected in every native move schema',()=>{
  const moves=[clean,
    {id:'slam',t0:1,s:0,d:[1,1,1],p:{x:0,y:0,z:0,rings:[0]}},
    {id:'sweep',t0:1,s:0,d:[1,1,1],p:{ox:0,oy:2,oz:0,y:0,a0:-1,a1:1,c:0}},
    {id:'charge',t0:1,s:0,d:[1,1,1],p:{x:0,y:0,z:0,yaw:0,L:10,v:13,wall:0,stun:1}},
    {id:'crablets',t0:1,s:0,d:[1,1,1],p:{n:3}},
    {id:'frenzy',t0:1,s:0,d:[1,1,1],p:{x:0,y:0,z:0,rot0:0,spin:1,stun:1}}];
  for(const move of moves) {
    assert.equal(validBossMove(move),true,move.id);
    for(const key of Object.keys(move.p)) if(typeof move.p[key]==='number' && key!=='n')
      for(const value of [1e308,-1e308]) assert.equal(validBossMove({...move,p:{...move.p,[key]:value}}),false,`${move.id}.${key}`);
    for(let i=0;i<3;i++){const m=structuredClone(move);m.d[i]=1e308;assert.equal(validBossMove(m),false,`${move.id}.d${i}`);}
  }
  for(let i=0;i<4;i++){const m=structuredClone(clean);m.p.b[0][i]=1e308;assert.equal(validBossMove(m),false);}
  const slam=structuredClone(moves[1]);slam.p.rings=[1e308];assert.equal(validBossMove(slam),false);
  const signed=structuredClone(clean);signed.p.sx=-4.125;signed.p.b[0][0]=-12.345;
  assert.equal(validBossMove(signed),true,'normal negative coordinates remain valid');
});

test('#1178 malformed/recovered Boss hazards remain finite under 30/60/120Hz fixed clocks and host authority',async t=>{
  let reference;
  for(const hz of [30,60,120]){
    const f=await nativeRig(t);sendEvent(f,clean,999,1,'other');assert.equal(f.boss.hz.moves.length,0);
    sendEvent(f,malformed()[0]);sendEvent(f,clean,1001);const trace=[],clock=new f.FixedClock();
    for(let frame=0;frame<hz;frame++)clock.advance(1/hz,dt=>{
      const bt=2+trace.length/60;f.boss.hz.update(dt,bt,{live:false});
      const barrel=f.boss.hz.fx.pools.barrel.list[0];
      trace.push(Array.from(barrel.position.toArray()));assert(trace.at(-1).every(Number.isFinite));
    });
    if(reference)assert.deepEqual(trace,reference);else reference=trace;
  }
});

test('#1178 original permissive move guard reproduces Infinity geometry, empty-array throw and zero-phase NaN',
  {skip:!!process.env.INKWAVE_BUILT_SITE},async t=>{
    for(const [i,move] of malformed().entries()){
      const f=await nativeRig(t,{old:true});sendSnapshot(f,move,1000,i===0?2.5:2);
      if(i===1)assert.throws(()=>f.boss.update(1/60),/reading '0'/);
      else{
        f.boss.update(1/60);
        if(i===0)assert(f.boss.hz.fx.pools.barrel.list[0].position.toArray().some(x=>!Number.isFinite(x)));
        else if(i===2) {assert(f.boss.st.aim.toArray().some(x=>!Number.isFinite(x)));assert(Number.isNaN(f.boss.hz.fx.pools.beam.list[0].scale.z));}
        else assert(Number.isNaN(f.boss.hz.fx.pools.lane.list[0].material.uniforms.uK.value));
      }
      assert.equal(f.boss.hz.moves.length,1);
    }
  });

// This is the existing rounded-wire representation limit, not a stage bound.
test('#1178 signed r3 representation boundaries keep native barrage interpolation and Float32 matrices finite',async t=>{
  const f=await nativeRig(t),limit=Number.MAX_SAFE_INTEGER/1000;
  const move=structuredClone(clean);Object.assign(move.p,{sx:limit,sy:limit,sz:-limit});
  move.p.b=[[-limit,-limit,limit,1]];
  assert.equal(validBossMove(move),true);sendEvent(f,move);
  for(const bt of [2,2.5,3.3,3.34]){
    f.boss.hz.update(1/60,bt,{live:false});
    const b=f.boss.hz.fx.pools.barrel.list[0];b.updateMatrixWorld(true);
    assert(b.position.toArray().every(Number.isFinite));
    assert(Array.from(new Float32Array(b.matrixWorld.elements)).every(Number.isFinite));
  }
});
