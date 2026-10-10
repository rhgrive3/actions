import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
async function client(id){const f=await fixture();const nm=f.makeNetMatch(f.makeSession(id,'a',[['a','A'],['b','B']]),{id:'slosh-cap'});const actors=['a','b'].map((owner,nid)=>f.makeActor({nid,owner,remote:owner!==id,team:nid,roller:false}));f.G.match=f.bind(nm,actors);f.G.time=10;const V=(...x)=>new f.THREE.Vector3(...x);const face={id:0,paintable:true,turf:true,wall:false,block:0,origin:V(-20,0,-20),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:40,sv:40};const level={faces:[face],blocks:[{aabbMin:V(-20,-.1,-20),aabbMax:V(20,0,20),faces:[0,-1,-1,-1,-1,-1]}],pointInside:()=>false,queryBlocks:()=>[0]};class CPU extends f.PaintSystem{_initGPU(){} _pushQuad(){}}f.G.paint=new CPU(null,level,{atlasSize:1024,maxDensity:8,cell:.25});return{f,nm,actors};}

function receive(c,e){const row=JSON.parse(JSON.stringify(e));row._netSeq=e._netSeq;row._netTick=e._netTick;c.nm._peer('a');c.nm._play('a',row);}
function tick(c,rows,ts=1000){c.nm._tick('a',{k:'t',r:2,ts,u:600,a:[],e:rows.map(e=>JSON.parse(JSON.stringify(e)))});}
function drain(c){for(const e of c.nm._peer('a').events.splice(0))c.nm._play('a',e);}
function same(a,b){assert.deepEqual(Array.from(a.f.G.paint.grid),Array.from(b.f.G.paint.grid));assert.deepEqual(Array.from(a.f.G.paint.counts),Array.from(b.f.G.paint.counts));}
async function pair({ordinal=0,distance=5,drop=0}={}){
 const sender=await client('a'),receiver=await client('b'),f=sender.f,owner=sender.actors[0];
 for(const c of [sender,receiver]){c.actors[0].weapon=c.f.WEAPONS.slosher;c.actors[0].netLife=0;c.actors[0].net.lastLife=0;}
 let index=ordinal,unit;for(const u of f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit){if(index<(u.BulletNum??1)){unit=u;break;}index-=u.BulletNum??1;}
 const p=f.projectiles._new();Object.assign(p,{owner,team:0,type:'slosh',wid:'slosher',s3Weapon:owner.weapon,fidelitySloshUnit:unit,fidelitySloshIndex:index,fidelitySloshPacketIndex:ordinal,age:0,life:2.4,straight:0,delay:0,radius:.3,size:.2,grav:24,drag:0,trailEvery:0,head:false,seed:.5});
 p.start.set(0,drop,0);p.pos.copy(p.start);p.vel.set(0,-1,1);sender.nm.recProj(p);
 const birth=sender.nm.out.at(-1);p.pos.set(0,0,distance);
 const impact=()=>f.projectiles._impact(p,{hit:true,point:p.pos.clone(),normal:new f.THREE.Vector3(0,1,0),face:0});
 impact();return{sender,receiver,p,birth,impact,rows:sender.nm.out};
}
for(const options of [{},{distance:10},{distance:18},{drop:5},{ordinal:1},{ordinal:4},{ordinal:8}])test('source-derived footprint '+JSON.stringify(options),async()=>{const h=await pair(options);for(const e of h.rows)receive(h.receiver,e);same(h.sender,h.receiver);});
test('unreceived projectile birth cannot authorize a larger terrain impact',async()=>{const h=await pair();receive(h.receiver,h.rows[1]);assert.ok(h.receiver.f.G.paint.grid.every(x=>x===0));});
test('duplicate core and forged later core cannot consume a second impact',async()=>{const h=await pair();for(const e of h.rows)receive(h.receiver,e);const before=Array.from(h.receiver.f.G.paint.grid);receive(h.receiver,h.rows[1]);h.impact();const forged=h.sender.nm.out.at(-1);forged[2]=12;forged[15][7][0]=12;receive(h.receiver,forged);assert.deepEqual(Array.from(h.receiver.f.G.paint.grid),before);});
for(const change of ['radius','stretch','direction','center','origin','projectile','unit','weapon','owner','match'])test('reject mismatched '+change,async()=>{const h=await pair();const rows=h.rows.map(e=>JSON.parse(JSON.stringify(e)));for(let i=0;i<rows.length;i++){rows[i]._netSeq=h.rows[i]._netSeq;rows[i]._netTick=h.rows[i]._netTick;}
 const birth=rows[0],core=rows[1];
 if(change==='radius')core[5]+=.1;if(change==='stretch')core[12]=1;if(change==='direction'){core[9]=1;core[11]=0;}if(change==='center')core[2]=12;if(change==='origin')core[15][6][0]=12;if(change==='projectile')core[15][5]++;if(change==='unit')birth[33]=8;if(change==='weapon')h.receiver.actors[0].weapon=h.receiver.f.WEAPONS.shooter;if(change==='owner')h.receiver.actors[0].owner='intruder';if(change==='match')core[15][1]='old';
 for(const e of rows)receive(h.receiver,e);assert.ok(h.receiver.f.G.paint.grid.every(x=>x===0));});
for(const change of ['weapon','death'])test('approved flight survives owner '+change,async()=>{const h=await pair();receive(h.receiver,h.birth);if(change==='weapon'){h.receiver.actors[0].weapon=h.receiver.f.WEAPONS.shooter;h.sender.actors[0].weapon=h.sender.f.WEAPONS.shooter;}else{h.receiver.actors[0].alive=false;h.receiver.actors[0].netLife=1;h.receiver.actors[0].net.lastLife=1;h.sender.actors[0].alive=false;h.sender.actors[0].netLife=1;}h.sender.nm.out=[];h.impact();assert.ok(h.sender.nm.out[0][15]);receive(h.receiver,h.sender.nm.out[0]);same(h.sender,h.receiver);});
for(const order of ['reverse','newer','older'])test('causal playback '+order,async()=>{const h=await pair();if(order==='reverse')tick(h.receiver,[...h.rows].reverse());else{tick(h.receiver,[h.rows[1]],1000.1);drain(h.receiver);tick(h.receiver,[h.birth],order==='older'?1000:1000.2);}drain(h.receiver);same(h.sender,h.receiver);});
test('real delayed Slosher fire emits its birth before impact with no trail or splash permit reuse',async()=>{
 const sender=await client('a'),receiver=await client('b');for(const c of [sender,receiver]){c.actors[0].weapon=c.f.WEAPONS.slosher;c.actors[0].netLife=0;c.actors[0].net.lastLife=0;}
 const f=sender.f,owner=sender.actors[0];owner.character.getMuzzle=out=>out.copy(owner.pos).add(new f.THREE.Vector3(0,1.2,0));owner.grounded=true;f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
 f.projectiles.fireSlosh(owner,owner.weapon);const p=f.projectiles.list.find(p=>p.type==='slosh'&&p.fidelitySloshPacketIndex===0);assert.ok(p);assert.ok(!p._s3SlosherPaintBirth);
 p.delay=0;f.projectiles._step(p,1/60);assert.ok(p._s3SlosherPaintBirth);const at=p.start.clone().add(new f.THREE.Vector3(0,0,5));p.pos.copy(at);
 f.projectiles._impact(p,{hit:true,point:at,normal:new f.THREE.Vector3(0,1,0),face:0});
 const tagged=sender.nm.out.filter(e=>e[1]==='s'&&e[15]?.[0]==='inkwave-slosher-impact-v1');assert.equal(tagged.length,1);
 for(const e of sender.nm.out)receive(receiver,e);same(sender,receiver);
});
test('expired missing birth remains closed and no longer blocks unrelated paint',async()=>{const h=await pair();tick(h.receiver,[h.rows[1]],1000.1);h.receiver.f.clock.advance(3);tick(h.receiver,[h.birth],1000);drain(h.receiver);assert.ok(h.receiver.f.G.paint.grid.every(x=>x===0));h.sender.nm.out=[];h.sender.f.G.paint.splat(new h.sender.f.THREE.Vector3(12,0,0),1,0,{seed:.5});tick(h.receiver,h.sender.nm.out,1000.2);drain(h.receiver);assert.ok(h.receiver.f.G.paint.grid.some(x=>x!==0));});
test('predeadline core recovers from older birth envelope and commits once',async()=>{const h=await pair();h.receiver.nm.s.hostId='b';h.receiver.nm.s.isHost=true;tick(h.receiver,[h.rows[1]],1000.1);tick(h.receiver,[h.birth],1000);assert.equal(h.receiver.nm.commitDeadlinePaint(),1);same(h.sender,h.receiver);const counts=Array.from(h.receiver.f.G.paint.counts);drain(h.receiver);assert.deepEqual(Array.from(h.receiver.f.G.paint.counts),counts);});
test('same projectile ID on a new birth sequence cannot grant a second impact',async()=>{const h=await pair();for(const e of h.rows)receive(h.receiver,e);const before=Array.from(h.receiver.f.G.paint.grid);const fake=JSON.parse(JSON.stringify(h.birth));fake._netSeq=3;fake._netTick=h.birth._netTick;fake[fake.length-1]=3;receive(h.receiver,fake);const core=JSON.parse(JSON.stringify(h.rows[1]));core._netSeq=4;core._netTick=h.rows[1]._netTick;core[core.length-1]=4;core[15][4]=3;core[2]=12;core[15][7][0]=12;receive(h.receiver,core);assert.deepEqual(Array.from(h.receiver.f.G.paint.grid),before);});
test('births without terrain impact stay bounded without disabling later Slosher paint',async()=>{const h=await pair();for(let i=0;i<140;i++){h.p.pos.copy(h.p.start);h.sender.nm.out=[];h.sender.nm.recProj(h.p);receive(h.receiver,h.sender.nm.out[0]);}h.sender.nm.out=[];h.p.pos.set(0,0,5);h.impact();receive(h.receiver,h.sender.nm.out[0]);same(h.sender,h.receiver);});
test('ghost impact cannot produce a new authored impact permit',async()=>{const h=await pair();h.sender.nm.out=[];h.p.ghost=true;h.impact();assert.equal(h.sender.nm.out.filter(e=>e[1]==='s'&&e[15]?.[0]==='inkwave-slosher-impact-v1').length,0);});
test('unreceived old-life birth cannot be relabelled with the current life',async()=>{const h=await pair();h.receiver.actors[0].netLife=h.receiver.actors[0].net.lastLife=1;h.rows[1][15][3]=1;for(const e of h.rows)receive(h.receiver,e);assert.ok(h.receiver.f.G.paint.grid.every(x=>x===0));});
test('unreceived old-match birth cannot be relabelled by changing only impact epoch',async()=>{const h=await pair();h.receiver.nm.cfg.id='next';h.rows[1][15][1]='next';for(const e of h.rows)receive(h.receiver,e);assert.ok(h.receiver.f.G.paint.grid.every(x=>x===0));});
test('near-vertical native heading fallback remains a valid sourced impact',async()=>{const h=await pair();const receiver=await client('b');receiver.actors[0].weapon=receiver.f.WEAPONS.slosher;receiver.actors[0].netLife=receiver.actors[0].net.lastLife=0;h.p.start.set(0,0,0);h.p.pos.copy(h.p.start);h.p.vel.set(1,0,0);h.sender.nm.out=[];h.sender.nm.recProj(h.p);h.p.pos.set(0,0,5);h.p.vel.set(.001,-100,0);h.impact();for(const e of h.sender.nm.out)receive(receiver,e);same(h.sender,receiver);});
import {kitBombExplosionPaint,SUCTION,resolveSubAtCharge} from '../../splatoon3/runtime/kit-subs.mjs';
test('a rapid Slosher owner cannot evict its already-flying kit bomb',async()=>{const h=await pair();for(const c of [h.sender,h.receiver])c.actors[0].weapon={...c.f.WEAPONS.slosher,sub:'suction'};
 const b={owner:h.sender.actors[0],kind:'bomb',team:0,pos:new h.sender.f.THREE.Vector3(12,.21,0),vel:new h.sender.f.THREE.Vector3(),s3Sub:SUCTION,s3Charge:0,s3Resolved:resolveSubAtCharge(SUCTION,0)};
 h.sender.nm.out=[];h.sender.nm.recBomb(b);receive(h.receiver,h.sender.nm.out[0]);
 for(let i=0;i<140;i++){h.sender.nm.out=[];h.p.pos.copy(h.p.start);h.sender.nm.recProj(h.p);receive(h.receiver,h.sender.nm.out[0]);}
 assert.ok(h.receiver.f.G.paint.grid.every(x=>x===0));h.sender.nm.out=[];kitBombExplosionPaint({},b,h.sender.f.G.paint);
 for(const e of h.sender.nm.out)receive(h.receiver,e);assert.ok(h.receiver.f.G.paint.counts[0]>900,'the radius-5 kit core, not just its small satellites, survives');
});
test('actor-hit terminal retires an unused impact while ordinary impact-before-terminal remains valid',async()=>{for(const terrainFirst of [false,true]){const h=await pair();receive(h.receiver,h.birth);if(terrainFirst)receive(h.receiver,h.rows[1]);h.sender.nm.out=[];const terminal=h.sender.nm._rec(['pe',0,h.p._netId,1,0,0,5]);receive(h.receiver,terminal);h.sender.nm.out=[];h.impact();receive(h.receiver,h.sender.nm.out[0]);if(terrainFirst)same(h.sender,h.receiver);else assert.ok(h.receiver.f.G.paint.grid.every(x=>x===0));}});
test('native complete volley flight preserves full terrain paint on the receiving peer',async()=>{
 const sender=await client('a'),receiver=await client('b');for(const c of [sender,receiver]){c.actors[0].weapon=c.f.WEAPONS.slosher;c.actors[0].netLife=0;c.actors[0].net.lastLife=0;}
 const f=sender.f,owner=sender.actors[0];owner.character.getMuzzle=out=>out.copy(owner.pos).add(new f.THREE.Vector3(0,1.2,0));owner.grounded=true;owner.pos.set(0,0,0);
 f.projectiles.fireSlosh(owner,owner.weapon);
 for(let i=0;i<180;i++){f.G.time+=1/60;f.clock.advance(1/60);f.projectiles.update(1/60);}
 assert.ok(sender.nm.out.some(e=>e[1]==='s'&&e[5]>3.744&&e[15]?.[0]==='inkwave-slosher-impact-v1'));
 for(const e of sender.nm.out)receive(receiver,e);same(sender,receiver);
});
