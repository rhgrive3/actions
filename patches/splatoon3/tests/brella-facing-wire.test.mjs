import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));

async function pair(id) {
  let ms=1000;
  const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,
    vmPerformance:{now:()=>ms},vmMathRandom:()=>.5,
    extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  const {G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(45,1,.1,100);
  G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,o)=>{o.length=0;return o;};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const make=local=>{const a=new f.Actor({team:0,name:'guard-wire',weapon:id,isLocal:local,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.nid=17;a.owner='owner';a.ink=100;a.grounded=a.ground.hit=true;a.character.actor=a;a.character.onEvent=null;a._nearCamera=()=>false;G.scene.add(a.character.root);return a;};
  const owner=make(true),remote=make(false);G.actors=[owner,remote];
  const members=new Set(['owner','viewer']),cfg={id:'brella-facing-review',map:'reef',difficulty:'normal'},packets=[];
  const sender=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,_members:members,tr:{broadcast:d=>packets.push(clone(d)),sendTo(){}}},cfg);
  sender.bind({actors:[owner],state:'playing',time:180,opts:{}});
  const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false,_members:members,tr:{broadcast(){},sendTo(){}}},cfg);
  receiver.bind({actors:[remote],state:'playing',time:180,opts:{}});
  return {f,owner,remote,sender,receiver,packets,advance(dt){ms+=dt*1000;G.time+=dt;},snapshot(){sender._sendTick();return packets.at(-1);},dispose(){sender.dispose();receiver.dispose();owner.character.dispose();remote.character.dispose();}};
}

test('preparing is local-only: unchanged snapshot slots and correctly wired built remote yaw',async()=>{
  for(const id of['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus']){
    const p=await pair(id),{f,owner,remote,receiver}=p;
    try{
      owner.intent.fire=true;owner.weaponRunner.update(1/60,{fire:true,firePressed:true});
      const c=owner.weaponRunner.catalogState.canopy;assert.equal(c.preparing,true);
      owner.yaw=.7;owner.aimYaw=-.4;owner.vel.set(.05,0,-1.4);
      const before=p.snapshot();assert.equal(before.a[0].length,26,'existing wire schema');
      // packAdoptionState increments this existing sequence once per snapshot.
      assert.equal(before.a[0][23][0],'inkwave-adoption-v1');
      const expectedNext=clone(before.a);expectedNext[0][23][2]++;
      c.preparing=false;const without=p.snapshot();assert.deepEqual(without.a,expectedNext,'only the normal snapshot sequence changes');
      expectedNext[0][23][2]++;
      c.preparing=true;const restored=p.snapshot();assert.deepEqual(restored.a,expectedNext,'preparation cannot add wire data');
      assert.equal(JSON.stringify(restored).includes('preparing'),false);
      for(const hz of[30,60,120]){
        p.advance(.05);const packet=p.snapshot();receiver.onMessage('owner',clone(packet));
        const peer=receiver._peer('owner');peer.tr=packet.ts;receiver._sample(remote,packet.ts,0);
        let faceCalls=0;const nativeFace=remote._face;remote._face=function(...args){faceCalls++;return nativeFace.apply(this,args);};
        receiver.applyRemote(remote,1/hz);remote._face=nativeFace;
        assert.equal(faceCalls,0,'replicated yaw remains sole remote facing owner');
        assert.ok(Math.abs(remote.yaw-.7)<1e-9);assert.ok(Math.abs(remote.aimYaw+.4)<1e-9);
        assert.equal(remote.character.root.rotation.y,remote.yaw);
        assert.equal(remote.weaponRunner.catalogState?.canopy?.preparing,undefined,'no authoritative preparation reconstructed remotely');
        assert.ok([...remote.character.P].every(Number.isFinite));
      }
      console.log('BRELLA_WIRE_PROOF '+JSON.stringify({id,rowLength:before.a[0].length,flagChangesRow:false,remoteFaceCalls:0,rates:[30,60,120]}));
    }finally{p.dispose();}
  }
});

test('uncircled Undercover never receives the preparation flag across its continuous fire/release path',async()=>{
  const p=await pair('s3-shelter-compact');
  try{const a=p.owner;let canopy=false;for(let j=0;j<180;j++){const fire=j<120;a.intent.fire=fire;a.ink=100;a.weaponRunner.update(1/60,{fire,firePressed:j===0});const c=a.weaponRunner.catalogState.canopy;if(c){canopy=true;assert.equal(Object.hasOwn(c,'preparing'),false);}}assert.ok(canopy);}finally{p.dispose();}
});
