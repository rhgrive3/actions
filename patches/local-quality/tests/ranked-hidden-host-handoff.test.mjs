import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../reliability/tests/controls-fixture.mjs';
import { RoomDurableObject } from '../../reliability/tests/hidden-host-harness.mjs';
import { installDisconnectFidelity } from '../../splatoon3/runtime/disconnect-fidelity.mjs';
import { installPlatformGame } from '../platform-game.mjs';
import { releaseHiddenRankedHost } from '../platform-ranked-handoff.mjs';
import { RankedEngine } from '../../splatoon3/runtime/ranked/engine.mjs';
import { installRankedDocument } from '../../splatoon3/tests/ranked-dom-fixture.mjs';

const stage = { id:'hidden-ranked', zones:[{center:[0,0,0],size:[6,6]}],
  tower:{path:[[0,0,-10],[0,0,0],[0,0,10]],centerIndex:1,checkpoints:[[],[]],speed:1.2,halfSize:1.4},
  rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[[0,0,5]],[[0,0,-5]]],retreatZ:[-8,8]},
  clams:{spawns:[],goals:[[0,0,10],[0,0,-10]]} };
const plain = value => JSON.parse(JSON.stringify(value));
class Socket {
  constructor(queue){this.handlers=new Map();this.sent=[];this.live=true;this.queue=queue;}
  send(data){this.sent.push(data);if(this.deliver)this.queue.push(()=>{if(this.live)this.deliver(data);});}
  addEventListener(k,fn){this.handlers.set(k,fn);}
  receive(data){if(this.live)this.handlers.get('message')?.({data});}
  close(){if(!this.live)return;this.live=false;this.handlers.get('close')?.();}
}
async function room(mode, count=3) {
  const relay=new RoomDurableObject({},{}), peers=[],delivery=[];
  const flush=()=>{for(let n=0;delivery.length;n++){assert(n<10000);delivery.shift()();}};
  for(let i=0;i<count;i++) {
    const socket=new Socket(delivery);assert.notEqual(relay.handleSession(socket,'peer'+i),false);
    const welcome=JSON.parse(socket.sent.find(x=>x.startsWith('{')&&JSON.parse(x).t==='welcome'));
    const f=await fixture({match:true,network:true,session:true,ranked:true,production:true,clock:{now:()=>1000000}});
    f.context.structuredClone=structuredClone;installRankedDocument(f.context.document);installDisconnectFidelity(f);f.installRanked(f);
    f.G.projectiles=new f.Projectiles(new f.THREE.Scene());
    const s=new f.NetSession();Object.assign(s,{myId:welcome.id,hostId:welcome.host,state:'match',code:'room',_members:new Map(welcome.members.map(x=>[x.id,x.name]))});
    s.lobby.players=welcome.members.map(x=>({...x,host:x.id===s.hostId,team:0,ready:true}));
    const m=new f.Match({duration:300,mode,roster:[],host:s.isHost});m.follower=!s.isHost;m.setState('playing');
    Object.assign(m,{ranked:new f.RankedEngine(mode,stage),rankedGains:[0,0],rankedBarrierHits:[],rankedWorld:{update(){},floorAt:()=>0},rankedEffects:{update(){},event(){}}});
    const a=f.make('shooter');Object.assign(a,{nid:1,owner:welcome.host,slot:0});m.actors=[a];f.G.actors=m.actors;
    const nm=new f.NetMatch(s,{id:'epoch-1',map:'reef',mode});s.match=nm;nm.bind(m);
    let aborted=0,ended=0;
    const transport=new f.Transport();transport.ws={get readyState(){return socket.live?1:3;},bufferedAmount:0,send:data=>socket.receive(data),close:()=>socket.close()};
    // Native close delegates to the closure created by its socket connection.
    // The relay bridge supplies that socket lifetime, not a game/leave policy.
    transport._disconnect=()=>{transport.ws=null;socket.close();};s.tr=transport;
    socket.deliver=data=>{if(data.startsWith('m|')){const k=data.indexOf('|',2);s._message(data.slice(2,k),JSON.parse(data.slice(k+1)));}else if(data!=='pong')s._control(JSON.parse(data));};
    const env=new EventTarget();env.document=new EventTarget();Object.assign(env.document,{hidden:false,hasFocus:()=>true});
    Object.assign(env,{performance:{now:()=>1000000},Date:{now:()=>1000000},screen:{orientation:new EventTarget()},console,queueMicrotask,
      requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout,clearTimeout});
    class Game { _loop(){} _frame(){} _dynRes(){} }
    const game=new Game();Object.assign(game,{match:m,settings:{frameRate:'display'},input:{padPressed:new Set()},fpsAcc:0,fpsN:0,menus:{setPlatformDriven(){}},
      netMatchAborted(){aborted++;this.match=null;},netMatchEnd(){ended++;}});
    Object.assign(f.G,{game,match:m,net:s,netm:nm,mode:'match'});f.G.paint.coverage=()=>[.5,.5];
    installPlatformGame(Game,f.G,env);game._loop();
    peers.push({f,s,m,nm,a,game,env,socket,transport,aborted:()=>aborted,ended:()=>ended,
      hide(){env.document.hidden=true;env.document.dispatchEvent(new Event('visibilitychange'));},
      show(){env.document.hidden=false;env.document.dispatchEvent(new Event('visibilitychange'));}});
  }
  const members=[...relay.members].map(([id,m])=>({id,name:m.name}));
  for(const p of peers){p.s._members=new Map(members.map(x=>[x.id,x.name]));p.s.lobby.players=members.map(x=>({...x,host:x.id===relay.hostId,team:0,ready:true}));}
  flush();return {relay,peers,flush,close(){for(const p of peers){p.game.disposePlatform();p.game.platform?.owner?.dispose();p.nm.dispose();p.socket.close();}delivery.length=0;}};
}
function seed(p,time=1) {
  const e=p.m.ranked;e.time=time;e.elapsed=300-time;e.revision=Math.round(e.elapsed*60);e.setCount(0,40);e.setCount(1,60);e.events.length=0;p.m.time=e.time;
  return plain(e.snapshot());
}
for(const mode of ['zones','tower','rainmaker','clams']) test(`hidden ${mode} host publishes completed legal state and yields once to a real relay election`,async()=>{
  const r=await room(mode);const [host,next,guest]=r.peers;
  try {
    const expected=seed(host),physics=host.m.ranked.revision;
    host.hide();r.flush();assert.equal(host.s.state,'offline');assert.equal(host.aborted(),1);assert.equal(host.socket.live,false);
    assert.equal(r.relay.hostId,next.s.myId);assert.equal(next.s.isHost,true);assert.equal(guest.s.isHost,false);
    assert.deepEqual(plain(next.m.ranked.snapshot()),expected);assert.deepEqual(plain(guest.m.ranked.snapshot()),expected);
    assert.equal(host.m.ranked.revision,physics,'no hidden clock-only or synthetic physics update');
    assert.equal(next.m.s3NoContest,undefined,'a late disconnect retains the ordinary result policy');
    assert.equal(host.game.platform.lastHiddenRankedHandoff.snapshotAccepted,true);
    host.hide();host.show();assert.equal(host.aborted(),1,'duplicate visibility and return cannot revive old authority');
    const control=new RankedEngine(mode,stage);assert.equal(control.restore(expected),true);
    const frame={actors:[],inputs:{},zoneCoverage:[[0,0]],floorAt:()=>0};
    for(let i=0;i<180;i++){next.m.ranked.update(1/60,frame);control.update(1/60,frame);}
    assert.deepEqual(plain(next.m.ranked.snapshot()),plain(control.snapshot()),'remaining legal ticks and result match retained snapshot continuation');
  } finally {r.close();}
});
test('early hidden host departure uses native no-contest; an already hidden elected peer yields after the ownership stack',async()=>{
  const r=await room('zones',3);const [host,next,last]=r.peers;
  try {
    seed(host,299);next.env.document.hidden=true;host.hide();r.flush();await Promise.resolve();r.flush();await Promise.resolve();r.flush();
    assert.equal(host.s.state,'offline');assert.equal(next.s.state,'offline');assert.equal(r.relay.hostId,last.s.myId);
    assert.equal(last.s.isHost,true);assert.equal(last.m.s3NoContest,true);assert.equal(last.nm.s3NoContestRemaining,6);
    assert.equal(last.m.ranked.winner,null,'departure cannot fabricate a scored result');
  } finally {r.close();}
});
test('backpressure failure and the last participant still close through normal leave without inventing a winner',async()=>{
  for(const count of [1,2]) {
    const r=await room('clams',count);const host=r.peers[0];
    try {
      seed(host,60);host.transport.ws.bufferedAmount=1024*1024;host.hide();r.flush();
      assert.equal(host.s.state,'offline');assert.equal(host.socket.live,false);assert.equal(host.aborted(),1);
      assert.equal(host.game.platform.lastHiddenRankedHandoff.snapshotAccepted,false);assert.equal(host.m.ranked.winner,null);
      assert.equal(r.relay.members.size,count-1);if(count===2)assert.equal(r.peers[1].s.isHost,true);
    } finally {r.close();}
  }
});
test('all regulation boundaries and overtime use snapshots; queued old ownership cannot close a replacement or a returned tab',async()=>{
  for(const mode of ['zones','tower','rainmaker','clams'])for(const time of [300,60,10,1,0])for(const overtime of [false,true]) {
    const sent=[],m={mode,ranked:new RankedEngine(mode,stage)},G={mode:'match'},env={document:{hidden:true},queueMicrotask:fn=>sent.push(fn)},runtime={};
    m.ranked.time=time;m.ranked.elapsed=300-time;m.ranked.overtime=overtime;
    const session={isHost:true,state:'match',hostId:'host',leave(){this.state='offline';this.match=null;this.left=(this.left||0)+1;}},net={isHost:true,match:m,cfg:{id:'one'},out:[],_sendTick:()=>true,_sendNow:d=>{sent.push(d);return true;}};
    const game={match:m,platform:runtime,netMatchAborted(){this.aborted=true;}};Object.assign(G,{net:session,netm:net});session.match=net;
    assert.equal(releaseHiddenRankedHost(game,G,env,runtime),true);assert.equal(session.left,1);assert.equal(sent[0].rk.state.time,time);assert.equal(sent[0].rk.state.overtime,overtime);
    session.state='match';session.match=net;runtime.hiddenRankedHandoff=null;releaseHiddenRankedHost(game,G,env,runtime,true);
    const callback=sent.at(-1);net.cfg.id='replacement';callback();assert.equal(session.left,1);
    net.cfg.id='one';releaseHiddenRankedHost(game,G,env,runtime,true);env.document.hidden=false;sent.at(-1)();assert.equal(session.left,1);
  }
});
