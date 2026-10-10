import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
import {installDisconnectFidelity} from '../runtime/disconnect-fidelity.mjs';
import {retireDisconnectedMainProjectiles} from '../runtime/disconnect-fidelity.mjs';
const fire=(f,a)=>{
 const P=f.projectiles,w=a.weapon;
 if(w.kind==='charger')P.fireCharger(a,w,1);
 else if(w.kind==='roller')P.fireFlick(a,w);
 else if(w.kind==='slosher')P.fireSlosh(a,w);
 else if(w.kind==='dualies')P.fireDualies(a,w,0,0);
 else P['fire'+w.kind[0].toUpperCase()+w.kind.slice(1)](a,w,0);
};
for(const kind of ['shooter','dualies','splatling','roller','slosher','blaster','charger'])test(`#955 ${kind}: native owner-leave cancels all in-flight work and cannot replay stale births/paint`,async()=>{
 const f=await fixture({network:true,fidelity:true}),a=f.make(kind,{y:10}),b=f.make(kind,{y:10,team:1,x:30});
 Object.assign(a,{nid:0,owner:'gone'});Object.assign(b,{nid:1,owner:'connected'});
 fire(f,a);fire(f,b);for(let i=0;i<3;i++){f.G.time+=1/60;f.projectiles.update(1/60);}
 const work=P=>[...P.list,...P.inkFlight.drops,...P._fidelityChargerFlights||[]];assert.ok(work(f.projectiles).some(p=>p.owner===a));const other=work(f.projectiles).filter(p=>p.owner===b).length;
 const session={myId:'host',hostId:'host',isHost:true,_members:new Map([['host',true],['gone',true],['connected',true]]),tr:{broadcast(){},sendTo(){}}};
 installDisconnectFidelity(f);const nm=new f.NetMatch(session,{id:'departing-'+kind,map:'tidewater'});
 f.G.match={mode:'turf',state:'playing',duration:180,time:100,actors:[a,b],playing:()=>true};nm.bind(f.G.match);
 const peer=nm._peer('gone');peer.events.push([0,'s',0,0,0,20,0,.5,'trail']);
 f.paints.length=0;session._members.delete('gone');nm.onLeave('gone',false);
 assert.equal(work(f.projectiles).filter(p=>p.owner===a).length,0);assert.equal(work(f.projectiles).filter(p=>p.owner===b).length,other);
 assert.equal(peer.events.length,0);assert.equal(a.s3.disconnected,true);assert.equal(a.isBot,false);
 const pools=f.projectiles.pool.length+f.projectiles.inkFlight.pool.length;nm.onLeave('gone',false);assert.equal(f.projectiles.pool.length+f.projectiles.inkFlight.pool.length,pools);
 nm.onMessage('gone',{k:'t',ts:999999,e:[[0,'s',0,0,0,20,0,.5,'trail']]});
 for(let i=0;i<180;i++){f.G.time+=1/60;f.projectiles.update(1/60);}assert.equal(f.paints.filter(p=>p.team===0&&!p.cosmetic).length,0);
 f.projectiles.clear();nm.dispose();
});
test('#955 detached queues and finite ghost beams retire without adopting ghost damage or removing another owner',()=>{
 const a={},b={},mesh={visible:true},control={owner:b},beam={mesh};
 const P={list:[],pool:[],inkFlight:{drops:[{owner:a,ghost:true},control],pool:[]},_fidelityChargerFlights:[{owner:a,ghost:true,beam}],beams:[beam],beamPool:[],
 _s3DetachedWallDrops:[{owner:a},control],_s3SplashDrops:[{owner:a},control],_s3ChargerWallDrops:[{owner:a},control],s3BlastQueue:[{p:{owner:a}},{p:{owner:b}}]};
 retireDisconnectedMainProjectiles(P,a,{ghostOnly:true});assert.equal(P.inkFlight.drops.length,1);assert.equal(P._fidelityChargerFlights.length,0);assert.equal(P.beams.length,0);assert.equal(mesh.visible,false);
 retireDisconnectedMainProjectiles(P,a);for(const k of ['_s3DetachedWallDrops','_s3SplashDrops','_s3ChargerWallDrops'])assert.deepEqual(P[k],[control]);assert.equal(P.s3BlastQueue.length,1);
});
