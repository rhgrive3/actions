import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';
import {applyCatalogueChoice} from '../runtime/catalogue.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));

// Real production-composed NetSession._begin, NetMatch and Actor/WeaponRunner.
// Only transport and stage/display allocation are this CPU fixture's boundary.
async function sessionPair(){
  const clients=new Map(),wire=[],history=[];
  for(const [index,id]of ['A','B'].entries()){
    const f=await fixture({productionComposition:true,includeSession:true});
    f.clock.set(id==='A'?500:1000);
    f.G.game={settings:{},netMatchGo(){}};
    const s=new f.NetSession();
    assert.equal(s.ownerClockVersion,1);
    Object.assign(s,{myId:id,hostId:'A',state:'lobby',_members:new Map([['A','A'],['B','B']])});
    s.lobby.players=[{id:'A',ready:false},{id:'B',ready:false}];
    const send=(to,data)=>{const row={from:id,to,data:clone(data)};wire.push(row);history.push(row);return true;};
    s.tr={sendTo:send,broadcast:data=>send(id==='A'?'B':'A',data),lock(){},close(){}};
    const c={f,s,nm:null,actors:[]};clients.set(id,c);f.G.net=s;
    f.G.game.startNetMatch=async(_cfg,nm)=>{
      c.nm=nm;
      class Display{
        constructor(){this.root=new f.THREE.Group();}
        trigger(){} setVisible(v){this.root.visible=v;} setHurt(){} setWeapon(){} _owner(){return null;}
      }
      c.actors=['A','B'].map((owner,i)=>{
        const a=new f.Actor({team:i,name:owner,weapon:'shooter',CharacterClass:Display});
        Object.assign(a,{nid:i+1,owner,isLocal:owner===id,invuln:0});
        a.pos.set(i*2,0,0);a._nearCamera=()=>false;a._finishFrame=()=>{};
        return a;
      });
      c.local=c.actors[index];c.remote=c.actors[1-index];
      const match={actors:c.actors,state:'playing',time:180,playing:()=>true,follower:false};
      f.G.match=match;f.G.actors=c.actors;nm.bind(match);
    };
  }
  const a=clients.get('A'),b=clients.get('B');
  const cfg={id:'catalogue-proof-round',proto:a.f.PROTO,compat:a.f.COMPAT,
    mode:'turf',map:'reef',difficulty:'normal',roster:[
      {owner:'A',nid:1,bot:false,weapon:'shooter',team:0,slot:0},
      {owner:'B',nid:2,bot:false,weapon:'shooter',team:1,slot:0},
    ]};
  try{
    await a.s._begin(clone(cfg));await b.s._begin(clone(cfg));
    assert.ok(a.nm?.match);assert.ok(b.nm?.match);
  }catch(error){for(const c of clients.values())clearTimeout(c.s._goT);throw error;}
  return {a,b,history,
    flush(){
      let count=0;
      while(wire.length){assert.ok(count++<200,'actual proof/codec negotiation converges');
        const m=wire.shift();clients.get(m.to).s._message(m.from,clone(m.data));}
    },
    tick(sub,special,x=0){
      assert.equal(applyCatalogueChoice(a.local,{sub,special},a.f),true);
      a.local.pos.x=x;a.nm._sendTick();
      const i=wire.findIndex(m=>m.from==='A'&&m.data.k==='t');
      assert.ok(i>=0,'actual sender emits a tick');return wire.splice(i,1)[0].data;
    },
    dispose(){for(const c of clients.values()){
      clearTimeout(c.s._goT);c.s._goT=null;c.nm?.dispose();c.s.match=null;c.f.G.net=null;
    }},
  };
}

function view(c){
  const p=c.nm.peers.get('A'),a=c.remote;
  return clone({kit:[a.weapon.sub,a.weapon.special],choice:a.s3CatalogueChoice,
    clock:p?{lastTs:p.lastTs,lastReceiveAt:p.lastReceiveAt}:null,in:c.nm.stats.in,
    body:a.net.buf,pos:a.pos.toArray(),life:a.netLife});
}

test('catalogue sidecars use actual admitted v1 session ticks after nonce proof and preserve rejected state',async()=>{
  const p=await sessionPair();
  try{
    const {a,b}=p,initial=view(b),first=p.tick('torpedo','zipcaster');
    assert.equal(first.oc,1);assert.equal(first.ocm,'catalogue-proof-round');
    b.s._message('A',clone(first));
    assert.deepEqual(view(b),initial,'unproven startup tick cannot change kit, clock or body');
    p.flush();
    assert.ok(p.history.some(m=>m.data.k==='ocq'&&/^[a-f0-9]{32}$/.test(m.data.n)));
    assert.ok(p.history.some(m=>m.data.k==='oca'),'real peer answered the receiver nonce');
    assert.equal(b.nm.peers.get('A').lastTs,500);
    assert.equal(b.nm.stats.in,1);
    assert.deepEqual([b.remote.weapon.sub,b.remote.weapon.special],['torpedo','zipcaster']);
    const accepted=view(b);

    a.f.clock.set(514);const future=p.tick('bomb','inkjet',99);a.f.clock.set(500);
    for(const [label,from,message]of [
      ['future','A',future],
      ['stale','A',{...clone(first),ck:{1:[0,'bomb','inkjet']}}],
      ['foreign','outsider',{...clone(first),ts:500.025,ck:{1:[0,'bomb','inkjet']}}],
      ['malformed-envelope','A',{...clone(first),ts:500.025,e:{bad:true},ck:{1:[0,'bomb','inkjet']}}],
    ]){
      b.s._message(from,message);
      assert.deepEqual(view(b),accepted,label+' rejects kit, accepted clock and body together');
    }

    a.f.clock.advance(.05);b.f.clock.advance(.05);a.f.G.time+=.05;b.f.G.time+=.05;
    const next=p.tick('burst','trizooka',.05);b.s._message('A',clone(next));
    assert.equal(b.nm.peers.get('A').lastTs,500.05);
    assert.equal(b.nm.stats.in,2);
    assert.deepEqual([b.remote.weapon.sub,b.remote.weapon.special],['burst','trizooka']);
    assert.equal(b.remote.net.buf.at(-1).x,.05,'normal body admission still progresses');

    // A valid tick does not waive the existing actor-life/choice checks.
    a.f.clock.advance(.05);b.f.clock.advance(.05);a.f.G.time+=.05;b.f.G.time+=.05;
    const wrongLife=p.tick('bomb','inkjet',.1);wrongLife.ck[1][0]++;
    b.s._message('A',clone(wrongLife));
    assert.equal(b.nm.peers.get('A').lastTs,500.1,'the containing tick itself remains legal');
    assert.deepEqual([b.remote.weapon.sub,b.remote.weapon.special],['burst','trizooka']);
  }finally{p.dispose();}
});
