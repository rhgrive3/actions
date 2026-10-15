import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture as networkFixture } from './robustness-fixture.mjs';
import { fixture as sourceFixture } from '../../splatoon3/tests/source-fixture.mjs';
import {
  validNetworkBombBirth, validNetworkProjectileCosmetics,
  allowGhostBombBirth, ghostBombActorAllowance, REMOTE_GHOST_STORM_RESERVE,
} from '../snapshot-guard.mjs';

test('queued non-finite autostart is rejected before Match; normal 90s and 2s matches still finish', async () => {
  const code=adaptBuildSource('src/main.js',
    fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'));
  const found=code.match(/duration:\s*(\(\(\) => \{ const n = Number\(params.get\('autostart'\)\);.+?\}\)\(\))/);
  assert.ok(found,'production composition must validate the public URL duration');
  const readDuration=Function('params', 'return '+found[1]);
  for (const [value,accepted] of [['90',90],['2',2],['180',180],
    ['Infinity',undefined],['1e309',undefined],['-Infinity',undefined],
    ['NaN',undefined],['0',undefined],['-30',undefined],['86401',undefined]]) {
    const params=new URLSearchParams('autostart='+encodeURIComponent(value));
    assert.equal(readDuration(params),accepted,'malformed or supported autostart: '+value);
  }
  const f=await sourceFixture({productionComposition:true,
    extraExports:"export { Match } from './inkwave-public/src/game/match.js';"});
  const valueFor = duration => new f.Match({duration,mode:'turf'});
  for (const invalid of [Infinity,-Infinity,NaN,-1,0,86401,1e300,'Infinity']) {
    const m=valueFor(invalid);
    assert.ok(Number.isFinite(m.time) && m.duration>0 && m.duration<=86400,
      'Match constructor accepted invalid duration: '+String(invalid));
  }
  assert.equal(valueFor(90).duration,90,'intentional 90s match must not be altered');
  assert.equal(valueFor(180).duration,180);
  const match=valueFor(2);
  match.setState('playing');
  match.update(1); match.update(1.05);
  assert.equal(match.state,'finish','a finite two-second battle must reach TIME UP');
  assert.equal(match.time,0);
});

test('queued projectile visual parameters are validated for current and legacy wire envelopes', () => {
  const valid=Array(32).fill(0);
  Object.assign(valid,{1:'p',19:1,20:.11,21:.8,22:1.3,23:.03,24:26,25:.3,26:4});
  assert.equal(validNetworkProjectileCosmetics(valid),true);
  for(const [i,v] of [[20,Infinity],[20,NaN],[20,'0.11'],[21,-1e6],
    [21,Infinity],[22,-1],[23,NaN],[24,1e300],[25,Infinity],
    [26,1000],[26,Infinity],[26,-3],[26,2.5],[26,'2'],[19,'1']]){
    const mutated=valid.slice();mutated[i]=v;
    assert.equal(validNetworkProjectileCosmetics(mutated),false,
      'untrusted visual parameter '+i+'='+String(v)+' passed');
  }
  for(const length of [27,30,32,33,34,35,36,37]){
    const normal=valid.slice();normal.length=length;
    assert.equal(validNetworkProjectileCosmetics(normal),true,'producer-shaped cosmetic fields for '+length);
  }
});

test('composed remote projectile ingress rejects malformed cosmetics without poisoning valid follow-up', async()=>{
  const f=await networkFixture({productionComposition:true}), nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['p2','P2']]));
  const remote=f.makeActor({nid:17,owner:'p2',remote:true,roller:false});
  const local=f.makeActor({nid:1,owner:'me',remote:false,roller:false});
  f.bind(nm,[remote,local]);
  const peer=nm._peer('p2');
  try{
    local.character.getMuzzle=out=>out.copy(local.pos).setY(30);
    f.projectiles.fireShooter(local,local.weapon,0);
    const produced=nm.out.find(e=>e[1]==='p');
    assert.ok(produced,'native Shooter must supply recognized projectile packet');
    const malformed=[...produced];malformed[0]=1000;malformed[2]=17;malformed[21]=-1000000;malformed[26]=1000;
    const control=[...produced];control[0]=1000.05;control[2]=17;
    const seqStart=produced.length-1;
    malformed[seqStart]=1;malformed[seqStart-1]=100;
    control[seqStart]=2;control[seqStart-1]=103;
    f.projectiles.clear();
    f.clock.set(1000);
    nm.onMessage('p2',{k:'t',ts:1000,r:2,u:100,e:[malformed]});
    assert.equal(peer.events.length,0,'poison must not enter timeline FIFO');
    assert.equal(peer._lastEventSeq||0,0);
    f.clock.advance(.05);
    nm.onMessage('p2',{k:'t',ts:1000.05,r:2,u:103,e:[control]});
    peer.tr=1000.05;peer.sim=103;
    nm._playEvents();
    assert.equal(peer._lastEventSeq,2,'valid follow-up must play');
    assert.ok(f.projectiles.list.some(p=>p.ghost && p.owner===remote));
    assert.ok(f.projectiles.list.filter(p=>p.ghost).every(p=>p.sats<=4 && p.tail0>=0));
  } finally{nm.dispose();}
});

test('real composed _draw cannot hide local shot or upload NaN from toxic remote beads',async()=>{
  const f=await networkFixture({productionComposition:true}), P=f.projectiles;
  const remote=f.makeActor({owner:'p2',nid:17,remote:true,roller:false});
  const local=f.makeActor({owner:'me',nid:1,remote:false,roller:false});
  remote.color=new f.THREE.Color('#ff0000');local.color=new f.THREE.Color('#00ff00');
  const make=(owner,ghost,sats=2,tail0=.8)=>{
    const p=P._new();
    Object.assign(p,{owner,ghost,type:'shot',team:owner.team,age:.5,life:3,
      straight:.2,seed:.3,delay:0,size:.12,vis:.12,tail0,tailK:1.3,wob:.03,wobF:26,nose:.3,sats});
    p.pos.set(0,1,35);p.start.set(0,1,0);p.prev.copy(p.pos);p.vel.set(0,0,25);
    return p;
  };
  const localShot=make(local,false);
  P.list.push(localShot);
  P._draw(); const baseline=P.blobs.count;
  assert.ok(baseline>0,'local round must normally render');
  P.list.unshift(make(remote,true,1000,-1000000));
  P._draw();
  assert.equal(P.blobs.count,baseline,'direct poisoned renderer input must not displace the local shot');
  P.list.shift();
  for(let i=0;i<350;i++)P.list.unshift(make(remote,true,4,.8));
  P._draw();
  assert.ok(P.blobs.count<=700,'native budget remains finite');
  const color=new f.THREE.Color();
  let localVisible=false;
  for(let i=0;i<P.blobs.count;i++){
    P.blobs.getColorAt(i,color);
    if(color.distanceTo(local.color)<.0001)localVisible=true;
  }
  assert.equal(localVisible,true,'remote floods must reserve local ink rendering headroom');
  const mats=P.blobs.instanceMatrix.array.slice(0,P.blobs.count*16);
  assert.ok(mats.every(Number.isFinite),'every active instance matrix remains finite');
  P.clear();
});

test('out-of-stage remote bomb is rejected; quota backlog cannot block later owner actions indefinitely',async()=>{
  const f=await networkFixture({productionComposition:true}),nm=f.makeNetMatch(
    f.makeSession('me','me',[['me','Me'],['p2','P2']]));
  const a=f.makeActor({nid:17,owner:'p2',remote:true,roller:false});
  f.bind(nm,[a]);f.G.level.bounds={minX:-80,maxX:80,minZ:-80,maxZ:80};
  const peer=nm._peer('p2');Object.assign(peer,{tr:1000,lastTs:1000,sim:60000,off:0});
  const birth=(seq,y=2,x=0)=>Object.assign(
    [1000,'b',17,'bomb',x,y,0,0,0,0,60000,seq],
    {_netTick:60000,_netSeq:seq});
  try{
    assert.equal(validNetworkBombBirth(birth(1,1e6),f.G.level.bounds),false);
    assert.equal(validNetworkBombBirth(birth(1,2,1000),f.G.level.bounds),false);
    assert.equal(validNetworkBombBirth(birth(1,2),f.G.level.bounds),true);
    nm._play('p2',birth(1,1e6));
    assert.equal(f.projectiles.bombs.length,0,'off-world bomb allocated scene meshes');
    assert.equal(peer._lastEventSeq||0,0,'rejected birth must not consume replay sequence');
    const limit=ghostBombActorAllowance(a,'p2',nm.match.actors)-REMOTE_GHOST_STORM_RESERVE;
    for(let seq=1;seq<=limit;seq++)nm._play('p2',birth(seq));
    assert.equal(f.projectiles.bombs.filter(b=>b.ghost).length,limit);
    assert.equal(allowGhostBombBirth(f.projectiles.bombs,a,'p2','bomb',nm.match.actors),false);
    let triggers=0;a.character._netTrig=()=>triggers++;
    const blocked=birth(limit+1);
    const after=Object.assign([1000,'tr',17,'jump',null,60000,limit+2],
      {_netTick:60000,_netSeq:limit+2});
    peer.events.push(blocked,after);
    f.clock.set(1000);nm._playEvents();
    assert.equal(peer.events.length,2,'legitimate full-quota birth should initially wait');
    assert.equal(triggers,0);
    f.clock.advance(6.1);nm._playEvents();
    assert.equal(peer.events.length,0,'bounded replay wait must drain subsequent actions');
    assert.equal(triggers,1,'valid action behind quota-blocked bomb must play');
    assert.equal(peer._lastEventSeq,limit+2);
    // Capacity returns through ordinary lifecycle; no stale budget counters.
    f.projectiles.clear();
    nm._play('p2',birth(limit+3));
    assert.equal(f.projectiles.bombs.filter(b=>b.ghost).length,1);
  }finally{nm.dispose();}
});

test('ghost flight expiry is bounded without deleting deployed Sprinklers or ordinary local bombs',async()=>{
  const f=await networkFixture({productionComposition:true});
  const remote=f.makeActor({nid:17,owner:'p2',remote:true,roller:false});
  const normal=f.makeActor({nid:1,owner:'me',remote:false,roller:false});
  const P=f.projectiles;
  try{
    const abandoned=P.ghostBomb(remote,'bomb',0,1000000,0,0,0,0);
    assert.ok(abandoned);
    abandoned.age=30.01;abandoned.fuse=-1;abandoned.s3Mode='flight';
    P._updateBombs(1/60);
    assert.ok(!P.bombs.includes(abandoned),'abandoned ghost airborne bomb should retire');
    const sprinkler=P.ghostBomb(remote,'bomb',0,3,0,0,0,0);
    assert.ok(sprinkler);
    sprinkler.age=30.01;sprinkler.fuse=-1;sprinkler.s3Mode='sprinkling';
    P._updateBombs(1/60);
    assert.ok(P.bombs.includes(sprinkler),'deployed sprinkler must survive flight-only cutoff');
    P.clear();
    P.throwBomb(normal);
    const own=P.bombs[0];own.age=30.01;own.fuse=-1;
    P._updateBombs(1/60);
    assert.ok(P.bombs.includes(own),'local bomb retirement remains governed by native physics');
  }finally{P.clear();}
});
