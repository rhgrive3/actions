import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { PAINT_AUTHORITY_TAG, DEATH_PAINT_SPEC } from '../paint-authority.mjs';
function paintLevel(THREE, size = 2, origin = 0) {
  const face = {
    paintable: true, su: size, sv: size, turf: true, wall: false, block: null,
    origin: new THREE.Vector3(origin, 0, origin),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0),
  };
  const block = {
    aabbMin: new THREE.Vector3(origin, -0.1, origin), aabbMax: new THREE.Vector3(origin + size, 0.1, origin + size),
    faces: [0, -1, -1, -1, -1, -1],
  };
  face.block = block;
  return { faces: [face], blocks: [block], pointInside: () => false, queryBlocks: () => [0] };
}

function paintRenderer(THREE) {
  let target = null, clear = new THREE.Color(), alpha = 1;
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    getClearColor: out => out.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (value, opacity) => { if (value?.isColor) clear.copy(value); alpha = opacity; },
    clear() {}, render() {},
  };
}

async function client(id, memberIds = ['a', 'b', 'c'], host = 'a', large = false) {
  const f = await fixture({productionComposition:true,includeMatch:true});
  const session = f.makeSession(id, host, memberIds.map((owner, i) => [owner, `P${i}`]));
  const nm = f.makeNetMatch(session, { id: 'canonical-paint' });
  const actors = memberIds.map((owner, i) => f.makeActor({ nid: i, owner, remote: id !== owner, team: i % 2, roller: false }));
  f.G.match = f.bind(nm, actors);
  f.G.time = 12;
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE, large ? 20 : 2, large ? -10 : 0), { atlasSize: large ? 1024 : 128, maxDensity: large ? 30 : 8, cell: 0.25 });
  return { f, nm, session, actors, paint: f.G.paint };
}

const wire = row => {
  const e=JSON.parse(JSON.stringify(row)); e._netTick=e.at(-2); e._netSeq=e.at(-1); return e;
};
function stamp(c, owner=c.actors.find(a=>a.owner===c.session.myId)) {
  c.paint.splat(new c.f.THREE.Vector3(1,0,1),.42,owner.team,{seed:.31,claimOwner:owner});
  return c.nm.out.at(-1);
}
function snapshot(c, from='a') {
  const p=c.nm._peer(from);
  return {grid:Array.from(c.paint.grid),counts:Array.from(c.paint.counts),coverage:Array.from(c.paint.coverage()),
    grow:c.paint.growing.length,clock:c.nm._paintClockState.clock,receipts:Array.from(c.nm._paintClockState.applied),
    seq:p._lastEventSeq||0,paintSeq:p._lastPaintSeq||0,stats:c.actors.map(a=>({...a.stats})),queue:p.events.length};
}
function play(c,from,row) {c.nm._peer(from);c.nm._play(from,wire(row));}

test('#522 exact owner actor applies once and unknown or cosmetic local ink never enters turf',async()=>{
 const a=await client('a'),c=await client('c');
 const before=snapshot(a);
 assert.equal(a.paint.splat(new a.f.THREE.Vector3(1,0,1),.42,0,{seed:.31}),0);
 assert.deepEqual(snapshot(a),before);assert.equal(a.nm.out.length,0);
 a.paint.splat(new a.f.THREE.Vector3(1,0,1),.42,0,{seed:.31,cosmetic:true});
 assert.deepEqual(Array.from(a.paint.grid),before.grid);assert.equal(a.nm.out.length,0);
 const row=stamp(a);assert.equal(row[14][4][0],PAINT_AUTHORITY_TAG);
 play(c,'a',row);assert.deepEqual(Array.from(c.paint.grid),Array.from(a.paint.grid));
 assert.ok(c.paint.counts[0]>0);const applied=snapshot(c);play(c,'a',row);assert.deepEqual(snapshot(c),applied);
});

test('#522 sender, actor, generation, match and legacy failures precede every replay reservation',async()=>{
 const a=await client('a'),c=await client('c'),row=stamp(a),before=snapshot(c);
 const mutations=[e=>e[14][4][2]=1,e=>e[14][4][2]=999,e=>e[14][4][3]=1,
  e=>e[14][1]='old-match',e=>e[14].pop(),e=>e.splice(14,1),e=>e[14][4]=null,
  e=>e[14][4]=[PAINT_AUTHORITY_TAG,'boss','a'],e=>e[14][4]=[PAINT_AUTHORITY_TAG,'zone','a',0],
  e=>e[6]=1,e=>e[14][4].push('extra')];
 for(const mutate of mutations){const e=wire(row);mutate(e);play(c,'a',e);assert.deepEqual(snapshot(c),before);}
 // A different authenticated peer cannot replay the exact owner's row either.
 const other=snapshot(c,'b');play(c,'b',row);assert.deepEqual(snapshot(c,'b'),other);
 play(c,'a',row);assert.ok(c.paint.counts[0]>0,'a corrected same-sequence stamp remains usable');
});

test('#522 malformed authority cannot exploit queue overflow, deadline commits or queued ownership changes',async()=>{
 const a=await client('a'),c=await client('c',undefined,'c'),row=stamp(a),p=c.nm._peer('a');
 const invalid=wire(row);invalid[14][4][2]=1;
 p.events=Array.from({length:512},()=>[0,'unused']);const before=snapshot(c);
 c.nm._tick('a',{ts:row[0],u:720,r:2,e:[invalid]});assert.deepEqual(snapshot(c),before);
 invalid._netPeer='a';invalid._deadlineEligible=true;
 assert.equal(c.nm._applyRemoteSplatEvent(invalid),false);assert.deepEqual(snapshot(c),before);
 p.events=[invalid];const deadlineBefore=snapshot(c);
 assert.equal(c.nm.commitDeadlinePaint(),0);assert.deepEqual(snapshot(c),deadlineBefore);
 p.events=[];c.nm._tick('a',{ts:row[0]+.1,u:720,r:2,e:[wire(row)]});assert.equal(p.events.length,1);
 c.session.hostId='b';c.nm.onLeave('a',true);
 assert.equal(c.nm._applyRemoteSplatEvent(p.events[0]||{_netPeer:'a',...wire(row)}),false);
 assert.ok(!c.paint.grid.some(Boolean));
});

test('#522 host adoption stamps retain generation across NetMatch recreation and reject former owners',async()=>{
 const a=await client('a'),c=await client('c'),old=stamp(a);
 c.session.hostId='c';c.session.isHost=true;c.nm.onLeave('a',true);
 const adopted=c.actors[0];assert.equal(adopted.owner,'c');
 const row=stamp(c,adopted);assert.equal(row[14][4][3],1);
 const replacement=new c.f.NetMatch(c.session,c.nm.cfg);replacement.match=c.nm.match;
 for(const actor of c.actors)replacement.byNid.set(actor.nid,actor);
 const proofBefore=row[14][4];c.f.G.netm=replacement;c.nm=replacement;
 const again=stamp(c,adopted);assert.deepEqual(Array.from(again[14][4]),Array.from(proofBefore));
 // Old generation is also invalid if the relay identity returns later.
 c.session._members.set('a','A');adopted.owner='a';adopted.remote=true;
 const before=snapshot(c);play(c,'a',old);assert.deepEqual(snapshot(c),before);
});

test('#522 death-wire geometry is pinned to the existing gameplay profile',async()=>{
 const c=await client('c');
 for(const [key,value] of Object.entries(DEATH_PAINT_SPEC))assert.equal(c.f.profile.deathBlast[key],value,key);
});

test('#522 actual Match judge counts admitted paint and publishes its winner',async()=>{
 const b=await client('b'),host=await client('a'),row=stamp(b);
 play(host,'b',row);assert.ok(host.paint.coverage()[1]>0);
 const forged=wire(row);forged[6]=0;forged[5]=3.74;forged[14][4][2]=0;
 play(host,'b',forged);
 let published;host.session.tr.broadcast=d=>{published=d;};
 const m=host.nm.match;m.mode='turf';m.setState=s=>{m.state=s;};
 host.f.Match.prototype._judge.call(m);
 assert.equal(m.result.winner,1);assert.equal(m.state,'judge');
 assert.deepEqual(Array.from(m.result.coverage),Array.from(host.paint.coverage()));
 assert.equal(published.k,'res');assert.equal(published.win,1);
});

test('#522 actual Boss hazard producer retains explicit host authority for foreign-team ink',async()=>{
 const host=await client('a'),observer=await client('c');
 host.nm.match.boss={};observer.nm.match.boss={};
 host.f.G.physics.raycast=(at,dir,range,hit)=>{
   hit.hit=true;hit.point.set(at.x,0,at.z);hit.normal.set(0,1,0);return hit;
 };
 const hz={boss:{nav:{inPad:()=>false}},_live:()=>true,
   moves:[{id:'slam',t0:0,d:[1.15,1.9,1],p:{x:1,y:0,z:1,rings:[]}}]};
 host.f.BossHazards.prototype.paint.call(hz,0,1.16);
 const rows=host.nm.out.filter(e=>e[1]==='s');assert.equal(rows.length,8);
 assert.ok(rows.every(e=>e[14][4][1]==='boss'));
 for(const row of rows)play(observer,'a',row);
 assert.ok(host.paint.counts[1]>0);assert.deepEqual(Array.from(observer.paint.grid),Array.from(host.paint.grid));
});

test('#522 actual zone capture producer validates the exact host-owned cell stamp',async()=>{
 const host=await client('a'),observer=await client('c');
 for(const c of [host,observer]){
   const face=c.paint.paintFaces[0];face.id=0;const entry={face,cell:face.grid,center:new c.f.THREE.Vector3(.125,0,.125)};
   c.nm.match.ranked={mode:'zones'};c.nm.match.rankedWorld={paint:c.paint,_zoneCells:[[entry]]};
 }
 host.f.RankedWorld.prototype.captureZone.call(host.nm.match.rankedWorld,0,1);
 const row=host.nm.out.find(e=>e[1]==='s');assert.equal(row[14][4][1],'zone');
 const before=snapshot(observer),forged=wire(row);forged[2]+=.25;play(observer,'a',forged);
 assert.deepEqual(snapshot(observer),before);
 play(observer,'a',row);assert.ok(host.paint.counts[1]>0);
 assert.deepEqual(Array.from(observer.paint.grid),Array.from(host.paint.grid));
});
