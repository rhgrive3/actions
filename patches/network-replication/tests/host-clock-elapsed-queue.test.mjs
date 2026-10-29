import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

test('production host heartbeat tracks elapsed frames while retaining one-send-per-frame tick gate',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const hz of [4,5,10,15,30,60,120]){
    let time=0;const packets=[];
    const s={myId:'host',hostId:'host',isHost:true,_members:new Map([['host','Host'],['guest','Guest']]),tr:{broadcast(msg){packets.push({time,c:msg.c});return true;},sendTo(){return true;}}};
    const n=new f.NetMatch(s,{id:`elapsed-${hz}`,map:'map',difficulty:'normal'});s.match=n;
    n.match={actors:[],state:'playing',duration:180,time:100};
    n._sampleBoss=n._playEvents=n._voices=()=>{};
    f.G.netm=n;f.G.match=n.match;
    for(let frame=1;frame<=hz*20;frame++){time=frame/hz;n.update(1/hz);}
    assert.ok(packets.length<=Math.min(hz,20)*20+1,`${hz}: unchanged bounded tick cadence`);
    const clocks=packets.filter(p=>p.c);
    assert.ok(clocks.length>=32,`${hz}: clock remains near half-second cadence`);
    assert.ok(clocks.slice(1).every((p,i)=>p.time-clocks[i].time<=.5+.05+1/hz+1e-8));
    assert.ok(clocks.every(p=>p.c[0]==='playing'&&p.c[1]===100));
    const oldClock=n.clockT;const oldPackets=packets.length;
    n.tickT=.05;n.update(0);assert.equal(n.clockT,oldClock);assert.equal(packets.length,oldPackets);
    s.isHost=false;n.update(1/hz);assert.equal(n.clockT,oldClock);
    s.isHost=true;n.clockT=0;time+=1/hz;n.tickT=0;n.update(1/hz);
    assert.ok(packets.at(-1).c,'host takeover sends clock at existing next tick');
    n.dispose();
  }
});
