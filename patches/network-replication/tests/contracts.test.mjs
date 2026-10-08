import{test}from'node:test';
import assert from'node:assert/strict';
import{fixture}from'./robustness-fixture.mjs';
import{adaptNetworkSource}from'../adapter.mjs';

test('baseline reproduces publication ordering; final packet preserves native local physics',async()=>{
 for(const network of [false,true]){
  const f=await fixture({network}),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',vertical:true});f.bind(nm,[a]);
  f.projectiles.fireFlick(a,a.weapon);const p=f.projectiles.list[0],e=nm.out[0];
  assert.equal(p.grav,144);assert.equal(p.drag,6);assert.equal(e[16],p.grav);assert.equal(e[17],p.drag);
  if(network){assert.equal(e.length,36);assert.equal(e[27],p.inkMeta||null);assert.equal(e[30],1);assert.equal(e[31],p.seed);assert.equal(e[32],p._netId);assert.equal(e[33],p.fidelityRollerUnitIndex);}
 }
});
test('projectile timeline catches up delay without exhausting lifetime budget or freezing',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true});f.bind(nm,[a]);
 const e=[1000,'p',0,'shot','shooter',0,30,0,0,0,1,.4,.2,.06666666666666667,.1,.1,57.6,0,0,0,.1,.8,1.3,.03,26,.3,3,0,.123,1];
 const peer={tr:1000.5};nm.peers.set('p2',peer);nm._play('p2',e);f.projectiles.update(1/60);assert.equal(f.projectiles.list.length,1);assert(f.projectiles.list[0].age>.1);
 peer.tr=1001;f.projectiles.update(1/60);assert.equal(f.projectiles.list.length,0);assert(f.projectiles.pool[0]._qualityDead);
});
test('replayed birth in a newer packet cannot resurrect an ended projectile',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',roller:false});f.bind(nm,[a]);
 a.character.getMuzzle=o=>o.copy(a.pos).setY(30);f.projectiles.fireShooter(a,a.weapon,0);
 const e=JSON.parse(JSON.stringify(nm.out.find(x=>x[1]==='p')));assert.equal(e.length,36);assert(Number.isSafeInteger(e[32]));
 f.projectiles.clear();a.remote=true;a.owner='p2';const peer={tr:e[0]+e[11]+e[12]+1};nm.peers.set('p2',peer);
 nm._play('p2',e);assert.equal(f.projectiles.list.length,1);f.projectiles.update(1/60);assert.equal(f.projectiles.list.length,0);nm._play('p2',e);assert.equal(f.projectiles.list.length,0);

});
test('physics timing remains exact at the shooter gravity transition',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',roller:false});f.bind(nm,[a]);
 a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));f.projectiles.fireShooter(a,a.weapon,0);const p=f.projectiles.list[0],e=nm.out[0];assert.equal(e[13],p.straight);assert.equal(e[12],p.life);assert.equal(e[11],p.delay);
});
test('source drift fails closed instead of silently omitting network finalization',()=>{
 assert.throws(()=>adaptNetworkSource('src/game/weapons.js','// drift'),/anchor mismatch/);
});

test('late roller fire links exactly its immutable volley after catch-up',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',vertical:true});f.bind(nm,[a]);f.projectiles.fireFlick(a,a.weapon);const events=nm.out.slice();f.projectiles.clear();a.remote=true;a.owner='p2';const peer={tr:1000.15};nm.peers.set('p2',peer);
 for(const e of events)nm._play('p2',e);f.projectiles.update(1/60);assert(f.projectiles.list[0].age>1/60);a._netFlickFirst=events[0][31];const sources=f.rollerCurtainSources(f.G,a,{});assert.equal(sources.length,a.weapon.verticalDrops);assert(sources.every(p=>p.s3Vertical));a._netFlickFirst=undefined;assert.equal(f.rollerCurtainSources(f.G,a,{}),null);
});
test('native bomb and forwarded-event sequence replay is idempotent',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true});f.bind(nm,[a]);nm.peers.set('p2',{tr:1000});nm._rec(['b',0,'bomb',0,3,0,0,5,10,1,2]);const b=nm.out.pop();nm._play('p2',b);nm._play('p2',b);assert.equal(f.projectiles.bombs.length,1);
});
// Storm authority is exercised through real received snapshots and native update
// ordering in storm-authority-order.test.mjs, including lifecycle retirement.
test('terminal replay retains the native blaster airburst before recycling',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});f.bind(nm,[a]);
 const life=f.WEAPONS.blaster.ballistics.burstTime,straight=f.WEAPONS.blaster.ballistics.straightTime,peer={tr:1000+life+1/60};nm.peers.set('p2',peer);let bursts=0;f.projectiles._blastBurst=()=>bursts++;
 const e=[1000,'p',0,'blast','blaster',0,30,0,0,0,10,0,life,straight,.2,.2,0,0,0,0,.1,.8,1.3,.03,26,.3,3,0,.123,1];
 nm._play('p2',e);nm._play('p2',[1000+life,'pe',0,1,0]);f.projectiles.update(1/60);assert.equal(bursts,1);assert.equal(f.projectiles.list.length,0);
});


test('publication uses active attack physics even when actor profile differs',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me'});f.bind(nm,[a]);
 const active={...a.weapon};a.weapon={...a.weapon,flickGravity:1,flickDrag:0};f.projectiles.fireFlick(a,active);
 const p=f.projectiles.list[0],e=nm.out[0];assert.equal(p.grav,active.flickGravity);assert.equal(e[16],p.grav);assert.equal(e[17],p.drag);
});


test('back-to-back unstepped volleys carry their own first projectile identity',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',vertical:true});f.bind(nm,[a]);nm.unsubs.push(f.on('weapon:fire',e=>nm._onLocalEvent('weapon:fire',e)));
 f.projectiles.fireFlick(a,a.weapon);a.weaponRunner.s3FlickVertical=false;f.projectiles.fireFlick(a,a.weapon);
 const events=nm.out.filter(e=>e[1]==='ev');assert.equal(events.length,2);assert.equal(events[0][3].projectileFirst,1);assert.equal(events[1][3].projectileFirst,a.weapon.verticalDrops+1);
});


test('invalid birth lifetime/delay is rejected instead of creating an immortal ghost',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true});f.bind(nm,[a]);nm.peers.set('p2',{tr:1000});
 const e=[1000,'p',0,'shot','shooter',0,30,0,0,0,10,0,-1,99,.1,.1,0,0,0,0,.1,.8,1.3,.03,26,.3,3,0,.123,1];nm._play('p2',e);assert.equal(f.projectiles.list.length,0);e[12]=1;e[11]=-.1;nm._play('p2',e);assert.equal(f.projectiles.list.length,0);
});

test('charger birth preserves oblique unit direction, origin, partial charge and length',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',roller:false});a.weapon=f.WEAPONS.charger;a.aimPoint.set(17.53,11.24,49.67);a.character.getMuzzle=o=>o.copy(a.pos).add(new f.THREE.Vector3(.013,1.057,.307));f.bind(nm,[a]);let raw;
 nm.unsubs.push(f.on('weapon:fire',e=>{raw=e;nm._onLocalEvent('weapon:fire',e);}));f.projectiles.fireCharger(a,a.weapon,.3764321);
 const e=JSON.parse(JSON.stringify(nm.out.find(e=>e[1]==='ev')))[3];assert.equal(e.charge,raw.charge);assert.equal(e.len,raw.len);for(let i=0;i<3;i++){assert.equal(e.dir[i],raw.dir.toArray()[i]);assert.equal(e.muzzle[i],raw.muzzle.toArray()[i]);}
});


test('Bomb event preserves gameplay, Storm/Kit metadata and ordered replay footer', async() => {
  const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',roller:false});
  f.bind(nm,[a]);
  f.projectiles.throwBomb(a);
  const e=nm.out.find(x=>x[1]==='b');
  assert.ok(e,'Bomb birth event missing');
  // timestamp + native payload + Storm snapshot/Kit identity/charge + tick/sequence.
  assert.equal(e.length,15);const b=f.projectiles.bombs[0];
  assert.equal(e[2],a.nid);assert.equal(e[3],b.kind);assert.equal(e[10],null);
  assert.equal(b.s3Sub.id,'bomb');assert.equal(e[11],'','native Splat Bomb uses the historical empty Kit sentinel');assert.equal(e[12],0);
  for(let i=0;i<3;i++){assert.equal(e[4+i],Math.round(b.pos.toArray()[i]*100)/100);assert.equal(e[7+i],Math.round(b.vel.toArray()[i]*100)/100);}
  assert.ok(Number.isSafeInteger(e[e.length-2]));
  assert.ok(Number.isSafeInteger(e[e.length-1]));
});

test('weapon vector snapshots stay stable through nested fire and retained payload access', async() => {
  const f = await fixture(), { emit, on, THREE } = f;
  const muzzle = new THREE.Vector3(1,2,3), direction = new THREE.Vector3(0,0,1);
  let retained, nested;
  const offOuter = on('weapon:fire', event => {
    if (event.weapon !== 'outer-probe') return;
    if (!retained) {
      retained = event;
      const copied = new THREE.Vector3();
      assert.equal(f.copyEventVector(event, 'muzzle', copied), true);
      assert.deepEqual([copied.x,copied.y,copied.z], [1,2,3]);
    }
    emit('weapon:fire', { actor: null, weapon: 'nested-probe', muzzle: new THREE.Vector3(7,8,9), dir: new THREE.Vector3(1,0,0) });
    muzzle.set(90,91,92);
    event.muzzle.x = 11;
  });
  const offNested = on('weapon:fire', event => {
    if (event.weapon === 'nested-probe') nested = event;
    if (event.weapon === 'outer-probe') assert.equal(f.eventVectorComponent(event, 'muzzle', 0), 11);
  });
  try {
    const payload = { actor: null, weapon: 'outer-probe', muzzle, dir: direction, hand: 1 };
    emit('weapon:fire', payload);
    assert.deepEqual(Object.keys(payload), ['actor','weapon','muzzle','dir','hand']);
    assert.equal(retained.muzzle, retained.muzzle);
    assert.ok(retained.muzzle instanceof THREE.Vector3);
    assert.deepEqual([retained.muzzle.x,retained.muzzle.y,retained.muzzle.z], [11,2,3]);
    assert.deepEqual([nested.muzzle.x,nested.muzzle.y,nested.muzzle.z], [7,8,9]);
    assert.equal(f.isEventVectorPayload(retained, 'muzzle'), true);
    const stableMuzzle = retained.muzzle;
    emit('weapon:fire', retained);
    assert.equal(retained.muzzle, stableMuzzle);
    const replacement = new THREE.Vector3(4,5,6);
    retained.dir = replacement;
    assert.equal(retained.dir, replacement);
    assert.equal(f.eventVectorComponent(retained, 'dir', 0), 4);
  } finally {
    offOuter(); offNested();
  }
});
