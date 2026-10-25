import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';

const HELD_UNSUPPORTED = 1 << 28;
const familyRows = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'roller' || r.family === 'brush');
const allIds = familyRows.flatMap(r => [r.id, ...ALTERNATE_WEAPON_KITS.filter(k => k.baseId === r.id).map(k => k.id)]);

test('all Roller/Brush and alternate kits replicate grounded unsupported drum without playing contact audio', async () => {
  let now = 500000;
  const f = await fixture({
    fullRuntime:true, productionComposition:true, realProjectiles:true,
    vmPerformance:{now:() => now},
  });
  f.G.scene = new f.THREE.Scene();
  f.G.camera = new f.THREE.PerspectiveCamera();
  assert.equal(familyRows.length, 8);
  assert.ok(allIds.length > familyRows.length, 'also checks the alternate family kits');
  for(const id of allIds){
    f.G.projectiles.clear(); f.G.actors.length=0;
    const owner=f.make(id), ghost=f.make(id), packets=[];
    owner.nid=ghost.nid=720;
    owner.owner=ghost.owner='owner';
    owner.netLife=ghost.netLife=1;
    owner.grounded=ghost.grounded=true;
    owner.form=ghost.form='kid';
    owner.weaponRunner.rolling=true;
    owner.weaponRunner.s3RollerSuspendedHold=true;
    const members=new Set(['owner','viewer']);
    const sender=new f.NetMatch({
      myId:'owner',hostId:'owner',isHost:true,_members:members,
      tr:{broadcast:message=>packets.push(structuredClone(message)),sendTo(){}},
    },{});
    const receiver=new f.NetMatch({
      myId:'viewer',hostId:'owner',isHost:false,_members:members,
      tr:{broadcast(){},sendTo(){}},
    },{});
    sender.bind({actors:[owner],state:'playing',time:180});
    receiver.bind({actors:[ghost],state:'playing',time:180});
    f.G.netm=sender;
    const audio=[];
    receiver._voiceLoop=(_a,_near,key,on)=>{if(key==='roll')audio.push(!!on);return null;};
    try{
      sender._sendTick();
      const held=packets.at(-1);
      assert.ok(held.a[0][10]&HELD_UNSUPPORTED,id+' owner publishes unsupported held drum');
      assert.ok(held.a[0][10]&16,id+' native grounded flag remains set');
      assert.ok(held.a[0][10]&256,id+' lowered rolling flag remains set');
      receiver.onMessage('owner',structuredClone(held));
      const peer=receiver._peer('owner');
      peer.tr=held.ts;
      receiver._sample(ghost,peer.tr,1/60);
      receiver.applyRemote(ghost,1/60);
      assert.equal(ghost.weaponRunner.s3RollerSuspendedHold,true,id+' remote runner keeps visual-only suspended hold');
      assert.equal(ghost.weaponRunner.rolling,true);
      assert.equal(ghost.grounded,true,'true ground may coexist with unsupported drum');
      receiver._voices(1/60);
      assert.equal(audio.at(-1),false,id+' no false contact sound');

      owner.weaponRunner.s3RollerSuspendedHold=false;
      now+=100; sender._sendTick();
      const landed=packets.at(-1);
      assert.equal(landed.a[0][10]&HELD_UNSUPPORTED,0,id+' genuine drum support clears optional bit');
      receiver.onMessage('owner',structuredClone(landed));
      peer.tr=landed.ts;
      receiver._sample(ghost,peer.tr,1/60);
      receiver.applyRemote(ghost,1/60);
      assert.equal(ghost.weaponRunner.s3RollerSuspendedHold,false,id+' remote resumes contact pose');
      receiver._voices(1/60);
      assert.equal(audio.at(-1),true,id+' contact audio resumes at supported ground');
    }finally{
      receiver.dispose();sender.dispose();f.G.netm=null;now+=1000;
    }
  }
});
