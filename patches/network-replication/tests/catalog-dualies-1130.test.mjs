import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../../splatoon3/runtime/main-weapon-catalog-data.mjs';
import {ALTERNATE_WEAPON_KITS} from '../../splatoon3/runtime/alternate-weapon-kits-data.mjs';
import {DUALIES_TURRET_FLAG} from '../../splatoon3/runtime/dualies-network.mjs';
import {remoteDodgePresentation,acceptRemoteDodgeClock} from '../../splatoon3/runtime/remote-dodge-clock.mjs';

test('all added Dualies and kits send accepted roll epochs and planted state over the native snapshot/event transport',async()=>{
  let time=100000;
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>time}});
  f.G.scene=new f.THREE.Scene();f.G.camera=new f.THREE.PerspectiveCamera();
  const bases=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='dualies'&&!r.legacy);
  for(const base of bases)for(const id of [base.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===base.id).map(k=>k.id)]){
    f.G.actors.length=0;
    const owner=f.make(id),remote=f.make(id);owner.nid=remote.nid=440;owner.owner=remote.owner='owner';
    owner.netLife=remote.netLife=1;owner.netTp=remote.netTp=0;
    const packets=[],members=new Set(['owner','viewer']);
    const sender=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,_members:members,tr:{broadcast:m=>packets.push(structuredClone(m)),sendTo(){}}},{});
    const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false,_members:members,tr:{broadcast(){},sendTo(){}}},{});
    sender.bind({actors:[owner],state:'playing',time:180});receiver.bind({actors:[remote],state:'playing',time:180});f.G.netm=sender;
    try{
      owner.intent.fire=true;owner.intent.move.set(1,0,0);
      assert.ok(owner.weaponRunner.tryDodge(owner.intent.move),id);
      sender._sendTick();const packet=packets.at(-1),event=packet.e?.find(e=>e[1]==='tr'&&e[3]==='dodge');
      assert.ok(event,id+' owner trigger is forwarded');
      assert.ok(Number.isInteger(event[4].token)&&event[4].token>0,id+' accepted action token is attached');
      assert.equal(packet.rl[440].start,event[0],id+' event and sidecar share the same epoch');
      assert.ok(packet.a[0][10]&1024,id+' native dodge bit represents catalogue movement');
      assert.equal(packet.a[0][10]&DUALIES_TURRET_FLAG,0,id+' moving mode is not planted');
      receiver.onMessage('owner',structuredClone(packet));const peer=receiver._peer('owner');peer.tr=packet.ts;
      receiver._sample(remote,peer.tr,1/60);receiver._playEvents();receiver.applyRemote(remote,1/60);
      assert.ok(remote.remoteDodgeClock,id+' remote accepted epoch');
      const startupFrames=base.parameters.SideStepParam.ChargeFrame||0;
      assert.equal(remoteDodgePresentation(remote)?.phase,startupFrames?'startup':'roll',id+' remote motion uses the accepted phase');
      assert.equal(event[4].startupDur,startupFrames/60,id+' startup is separate from the movement duration');
      if(startupFrames){
        peer.tr=packet.ts+startupFrames/60+.0001;receiver._sample(remote,peer.tr,1/60);receiver.applyRemote(remote,1/60);
        assert.equal(remoteDodgePresentation(remote)?.phase,'roll',id+' remote startup transitions on the sender clock');
      }
      const epoch=remote.remoteDodgeClock.epoch;
      assert.equal(acceptRemoteDodgeClock(remote,'owner',event[0],event[4],packet.ts),false,id+' duplicate cannot restart');
      assert.equal(acceptRemoteDodgeClock(remote,'owner',event[0]-.01,{...event[4],start:event[0]-.01},packet.ts),false,id+' reordered older epoch cannot rewind');
      assert.equal(remote.remoteDodgeClock.epoch,epoch);
      remote.net.remoteDodgeLife=event[4].life+1;
      assert.equal(acceptRemoteDodgeClock(remote,'owner',event[0]+.01,{...event[4],token:event[4].token+1,start:event[0]+.01},packet.ts+.01),false,id+' prior-life action cannot restart');
      remote.net.remoteDodgeLife=event[4].life;
      owner.intent.move.set(0,0,0);
      const frames=Math.round((owner.weaponRunner.catalogState.roll.dur+owner.weaponRunner.catalogState.roll.startupDur)*60);
      for(let i=0;i<frames;i++)owner.weaponRunner.update(1/60,{fire:true});
      time+=500;sender._sendTick();const planted=packets.at(-1);
      assert.ok(planted.a[0][10]&DUALIES_TURRET_FLAG,id+' planted state is sent');
      assert.equal(planted.a[0][10]&1024,0,id+' core movement bit clears');
      receiver.onMessage('owner',structuredClone(planted));peer.tr=planted.ts;
      receiver._sample(remote,peer.tr,1/60);receiver.applyRemote(remote,1/60);
      assert.equal(remote.character.s3RemoteTurretPose,true,id+' remote planted presentation');
      assert.equal(remote.weaponRunner.s3Turret,false,id+' owner-authoritative gameplay state is not copied');
    }finally{receiver.dispose();sender.dispose();f.G.netm=null;time+=1000;}
  }
});
