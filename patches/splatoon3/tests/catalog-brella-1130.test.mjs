import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

async function world(id='s3-shelter-focus',height=8){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 makePaintWorld(f); f.G.settings={};f.setRandom(()=>.37);
 const a=f.make(id);a.form='kid';a.pos.set(0,height,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,height+1.05,100);a.intent.fire=true;
 a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));
 return {f,a};
}
function hold(a,frames){for(let i=0;i<frames;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});}
async function launched(hz=60,seconds=1){const x=await world();hold(x.a,65);x.f.G.projectiles.list.length=0;
 for(let i=0;i<hz*seconds;i++)x.f.G.projectiles.update(1/hz);return x;}

test('F05 launched canopy falls under source gravity; rendering and defense use the same position',async()=>{
 const {f,a}=await launched(60,2);const probe={team:1,damage:20,size:.01,prev:new f.THREE.Vector3(0,8.8,20),pos:new f.THREE.Vector3(0,8.8,18)};
 assert.equal(f.G.projectiles.kitDefenseCandidate(probe),null,'shield must have fallen below its old gravity-free plane');
});

test('F06 explicit InitVelRandom changes outer pellet speed but preserves the authored centre',async()=>{
 const speeds=[];
 for(const draw of [.1,.9]){const {f,a}=await world('s3-shelter-wide');f.setRandom(()=>draw);hold(a,14);
  speeds.push(f.G.projectiles.list.filter(p=>p.catalog).map(p=>p.vel.length()));}
 assert.equal(speeds[0][0],speeds[1][0]);assert.notEqual(speeds[0][1],speeds[1][1]);
});

test('F07 shield is centered on its render plane and does not block a shot above the cloth',async()=>{
 const {f,a}=await world('s3-shelter-compact',0);hold(a,30);const c=a.weaponRunner.catalogState.canopy;
 const y=c.pos.y+2*c.radius,probe={team:1,size:.01,damage:20,prev:new f.THREE.Vector3(0,y,4),pos:new f.THREE.Vector3(0,y,-4)};
 assert.equal(f.G.projectiles.kitDefenseCandidate(probe),null);
});

test('F07 incoming online damage without a recorded trajectory is not fabricated into a shield hit',async()=>{
 const {f,a}=await world('s3-shelter-compact',0);hold(a,30);const c=a.weaponRunner.catalogState.canopy;
 const enemy=f.make('shooter');enemy.remote=true;enemy.team=1;enemy.pos.set(0,5,10);f.G.netm={_applyingHit:true,shouldApplyHit:()=> 'local'};
 const before=a.hp;f.G.projectiles.applyHit(enemy,a,20,'shooter');assert.equal(c.hp,200);assert.equal(a.hp,before-20);
});

for(const hz of [30,60,120])test('F05 fixed canopy flight at '+hz+'Hz uses source inheritance and shared visual/guard position',async()=>{
 const {f,a}=await world('s3-shelter-focus',8);a.grounded=true;a.vel.set(2,0,3);
 let mesh;f.G.scene={add(m){mesh=m;}};
 // Minimal cloth exercises the actual detached renderer and its world pose.
 a.character.weapon={def:{parts:{canopy:{geo:new f.THREE.BufferGeometry()}}}};
 hold(a,65);assert.ok(mesh);const start=mesh.position.clone();
 for(let i=0;i<hz;i++)f.G.projectiles.update(1/hz);
 assert.ok(Math.abs(mesh.position.x-(start.x+.48*2))<1e-8);
 assert.ok(Math.abs(mesh.position.z-(start.z+9+.48*3))<1e-8);
 assert.ok(Math.abs(mesh.position.y-(start.y-.75*61/120))<1e-8,'semi-implicit 60Hz gravity independent of render Hz');
 const q={team:1,size:0,damage:10,prev:mesh.position.clone().add(new f.THREE.Vector3(0,0,1)),pos:mesh.position.clone().add(new f.THREE.Vector3(0,0,-1))};
 const hit=f.G.projectiles.kitDefenseCandidate(q);assert.ok(hit?.brella);assert.ok(Math.abs(hit.point.y-mesh.position.y)<1e-9);
});

test('F05 air launch inherits only the explicit horizontal scale and falls onto nearby ground',async()=>{
 const {f,a}=await world();a.grounded=false;a.vel.set(2,8,3);let mesh;f.G.scene={add(m){mesh=m;}};
 a.character.weapon={def:{parts:{canopy:{geo:new f.THREE.BufferGeometry()}}}};hold(a,65);const start=mesh.position.clone();
 for(let i=0;i<60;i++)f.G.projectiles.update(1/60);
 assert.ok(Math.abs(mesh.position.x-(start.x+.72*2))<1e-8);assert.ok(Math.abs(mesh.position.y-(start.y-.75*61/120))<1e-8);
});

test('F07 actual segment intersects the centered cloth; a miss, wall, or unrelated height never spends shield HP',async()=>{
 const {f,a}=await world('s3-shelter-compact',0);hold(a,30);const c=a.weaponRunner.catalogState.canopy;
 const enemy=f.make('shooter');enemy.remote=true;enemy.team=1;enemy.pos.set(99,99,99);
 f.G.netm={_applyingHit:true,shouldApplyHit:()=> 'local'};
 const run=(geometry)=>{f.G.projectiles.s3IncomingHitGeometry=geometry;return f.G.projectiles.applyHit(enemy,a,20,'shooter');};
 const through=[0,c.pos.y,4,0,c.pos.y,0,.01];
 assert.equal(run(through),'accepted');assert.equal(c.hp,180);assert.equal(a.hp,100,'actual shot interception, irrespective of attacker receipt position');
 run([4,c.pos.y,4,4,c.pos.y,0,.01]);assert.equal(c.hp,180);assert.equal(a.hp,80);
 f.G.physics.segment=(_from,_to,h)=>{h.hit=true;h.dist=.1;h.point.copy(_from);h.normal.set(0,0,-1);return h;};
 run(through);assert.equal(c.hp,180,'terrain before cloth precludes a canopy hit');assert.equal(a.hp,60);
});

test('F07 source projectile damage routing captures the actual collision segment and restores context',async()=>{
 for(const id of ['shooter','s3-shelter-focus']){
  const {f,a}=await world(id,0),target=f.make('shooter');target.team=1;target.remote=true;target.pos.set(0,0,3);target.invuln=0;
  const received=[];f.G.netm={shouldApplyHit:()=> 'send',sendHit(){received.push(f.G.projectiles.s3HitGeometry?.slice());return true;},recProj(){},_rec(){}};
  hold(a,14);for(let i=0;i<10;i++)f.G.projectiles.update(1/60);
  assert.ok(received.length>0,id);assert.ok(received.every(g=>g?.length===7&&g.every(Number.isFinite)),id);
  assert.equal(f.G.projectiles.s3HitGeometry,undefined);
 }
});

test('additional audit: squid form folds held canopy, cures it and continues source rebuild clock',async()=>{
 const {f,a}=await world('s3-shelter-compact',0);hold(a,30);const s=a.weaponRunner.catalogState,c=s.canopy;
 c.hp=50;s.naked=2;a.form='squid';a.submerged=true;
 for(let i=0;i<60;i++)a.weaponRunner.update(1/60,{fire:false});
 assert.equal(c.open,false);assert.ok(Math.abs(s.naked-1)<1e-8);assert.equal(c.hp,80,'explicit 5 source HP/F = .5 gameplay HP/F');
});

test('all four bases and six alternate kits inherit pellet groups, launch envelope and squid-time rebuild',async()=>{
 const {f}=await world();const bases=['s3-shelter-normal','s3-shelter-wide','s3-shelter-compact','s3-shelter-focus'];
 const checked=[];
 for(const baseId of bases){
  const base=f.WEAPONS[baseId],ids=Object.values(f.WEAPONS).filter(w=>w.id===baseId||w.variantOf===baseId).map(w=>w.id);
  const expected=base.catalogRecord.parameters.spl__BulletShelterShotgunParam.GroupParams.reduce((n,g)=>n+g.TotalNum,0);
  for(const id of ids){
   const a=f.make(id);a.form='kid';a.intent.fire=true;const before=f.G.projectiles.list.length;hold(a,14);
   assert.equal(a.weapon.catalogRecord,base.catalogRecord,id+' uses shared source');
   const rounds=f.G.projectiles.list.slice(before);assert.equal(rounds.length,expected,id+' source group count');
   assert.ok(rounds.every(p=>Number.isFinite(p.vel.length())&&p.vel.length()>0));
   const s=a.weaponRunner.catalogState;s.naked=1;a.form='squid';a.submerged=true;
   for(let i=0;i<60;i++)a.weaponRunner.update(1/60,{fire:false});
   assert.equal(s.naked,0,id+' rebuild in squid');assert.equal(s.canopy?.open,false,id+' folds in squid');checked.push(id);
  }
 }
 assert.equal(checked.length,10);
});

test('F05 canopy follows a shallow slope and a low step, stops at a high step, and lands from nearby air',async()=>{
 for(const terrain of ['slope','step','wall','landing']){
  const {f,a}=await world('s3-shelter-focus',terrain==='landing'?1.2:0);let mesh;f.G.scene={add(m){mesh=m;}};
  a.character.weapon={def:{parts:{canopy:{geo:new f.THREE.BufferGeometry()}}}};
  const floor=z=>terrain==='slope'?z*.04:terrain==='step'&&z>=4?.3:0;
  f.G.physics.raycast=(from,direction,len,h)=>{const y=floor(from.z),distance=(from.y-y)/Math.max(1e-9,-direction.y);h.hit=distance>=0&&distance<=len;if(h.hit){h.point.copy(from).addScaledVector(direction,distance);h.normal.set(0,1,0);h.dist=distance;h.face=0;}return h;};
  f.G.physics.segment=(from,to,h)=>{h.hit=terrain==='wall'&&from.z<4&&to.z>=4;if(h.hit){const t=(4-from.z)/(to.z-from.z);h.point.copy(from).lerp(to,t);h.dist=from.distanceTo(h.point);h.normal.set(0,0,-1);h.face=-1;}return h;};
  hold(a,65);f.G.projectiles.list.length=0;
  for(let i=0;i<120;i++)f.G.projectiles.update(1/60);
  assert.ok(mesh,terrain);
  if(terrain==='wall')assert.ok(mesh.position.z<4&&mesh.position.z>3.9,'center stops at the terrain plane');
  else assert.ok(Math.abs(mesh.position.y-floor(mesh.position.z)-.8)<1e-8,terrain+' support stays local to the canopy');
 }
});

test('F07 local and incoming projectile boundaries agree at every 0.1 across the guard rim',async()=>{
 const {f,a}=await world('s3-shelter-compact',0);hold(a,30);const c=a.weaponRunner.catalogState.canopy;
 const enemy=f.make('shooter');enemy.remote=true;enemy.team=1;f.G.netm={_applyingHit:true,shouldApplyHit:()=> 'local'};
 for(const radius of [0,.1,.3])for(let ix=-12;ix<=12;ix++){
  const x=ix/10,from=new f.THREE.Vector3(x,c.pos.y,4),to=new f.THREE.Vector3(x,c.pos.y,0);
  const local=!!f.G.projectiles.kitDefenseCandidate({prev:from,pos:to,team:1,size:radius,damage:1})?.brella;
  c.hp=200;a.hp=100;a.alive=true;
  f.G.projectiles.s3IncomingHitGeometry=[from.x,from.y,from.z,to.x,to.y,to.z,radius];
  f.G.projectiles.applyHit(enemy,a,1,'shooter');assert.equal(c.hp===199,local,`${radius} / ${x}`);
 }
});
