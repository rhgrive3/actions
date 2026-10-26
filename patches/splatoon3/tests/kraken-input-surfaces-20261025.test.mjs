import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
const dt=1/60;
function setup({noPaint=false,wall=false,held=false}={}){
 const {G}=f;G.netm=null;G.net=null;G.mode='match';G.time=0;G.actors=[];
 G.match={mode:'turf',state:'playing',time:100,playing:()=>true,canRespawn:()=>false};
 G.paint={sample:()=>1,splat:()=>0};
 G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,0],[40,0,0]],spawnBarrier:0,
  half:[],single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50],paint:!noPaint},
   ...(wall?[{kind:'box',min:[-20,0,2],max:[20,30,3]}]:[])]});
 G.physics=new f.Physics(G.level);
 const a=f.make();a._integrate=f.Actor.prototype._integrate;
 a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,0,30);a.aimYaw=a.yaw=0;
 a.weapon={...a.weapon,special:'krakenRoyale',specialCost:100};a.special=100;
 a.intent.fire=held;a._prevIntent={fire:held,sub:false,jump:false,squid:false};
 a._startSpecial();for(let n=0;n<60;n++)a._updateSpecial(dt);
 return a;
}
function hold(a,frames,pattern=[dt]){
 a.intent.fire=true;let elapsed=0,index=0;
 while(elapsed+1e-10<frames/60){const step=Math.min(pattern[index++%pattern.length],frames/60-elapsed);a._updateSpecial(step);elapsed+=step;}
 a.intent.fire=false;a._updateSpecial(dt);return a._s3AllSpecialState.phase;
}
for(const [name,pattern] of [['30Hz',[1/30]],['60Hz',[dt]],['120Hz',[1/120]],['irregular',[1/120,1/40,dt]]]){
 test(`Kraken press-inclusive 34F cancel / 35F dash at ${name}`,()=>{
  for(const frames of [34,35]){
   const a=setup();assert.equal(hold(a,frames,pattern),frames===35?'dash':'active');
  }
 });
}
test('holding ZR through transformation starts charging without a second press',()=>{
 const a=setup({held:true});assert.equal(a._s3AllSpecialState.phase,'charge');
 assert.ok(Math.abs(a._s3AllSpecialState.chargeT-dt)<1e-9);
 for(let i=0;i<34;i++)a._updateSpecial(dt);
 a.intent.fire=false;a._updateSpecial(dt);assert.equal(a._s3AllSpecialState.phase,'dash');
});
test('airborne spin cannot replace the charge heading with a translated world position',()=>{
 for(const origin of [[0,0,0],[14,0,-23],[-9,3,17]]){
  const a=setup();a.pos.set(...origin);a.grounded=false;a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0,0,30));
  a._s3AllSpecialState.jumpAttack=true;a.intent.fire=true;a._updateSpecial(dt);
  const dir=a._s3AllSpecialState.direction;
  assert.ok(Math.abs(dir.x)<1e-10&&Math.abs(dir.z-1)<1e-10,`heading at ${origin}`);
 }
});
for(const noPaint of [false,true])for(const hz of [30,60,120])test(`Kraken ${noPaint?'nonpaintable':'dry paintable'} floor dash speed at ${hz}Hz`,()=>{
 const a=setup({noPaint});assert.equal(hold(a,35),'dash');
 // Ordinary movement may be opposite the released charge; dash is locked.
 a.intent.move.set(1,0,-1);const before=a.pos.clone();a._updateSpecial(1/hz);
 const speed=noPaint?12.6:18;
 assert.ok(Math.abs(a.pos.z-before.z-speed/hz)<1e-8);
 assert.equal(a.pos.x,before.x);assert.deepEqual(Array.from(a.intent.move.toArray()),[1,0,-1]);
});
for(const hz of [30,60,120])test(`Kraken dash follows a real inked wall at ${hz}Hz`,()=>{
 const a=setup({wall:true});assert.equal(hold(a,35),'dash');
 a.pos.set(0,3,1.7);a.grounded=false;a._setClimb(true);a.wallN.set(0,0,-1);
 a.intent.move.set(1,0,0);const y=a.pos.y;a._updateSpecial(1/hz);
 assert.equal(a.climbing,true);assert.ok(Math.abs(a.pos.y-y-13.2/hz)<1e-8);
 assert.equal(a.pos.x,0,'stick cannot steer a wall dash sideways');
 assert.deepEqual(Array.from(a.intent.move.toArray()),[1,0,0],'temporary wall input is restored');
});
test('source total includes startup and keeps the vulnerable swim-only recovery',()=>{
 const a=setup();a.invuln=0;const state=a._s3AllSpecialState;
 a.damage(20,null,'shooter');assert.equal(a.hp,100,'active Kraken rejects damage');
 for(let n=60;n<480;n++)a._updateSpecial(dt);
 assert.equal(state.phase,'finish');assert.equal(a.specialActive.id,'krakenRoyale');
 a.damage(20,null,'shooter');assert.equal(a.hp,80,'recovery is vulnerable');
 a.intent.move.set(0,0,1);a.intent.jump=true;const before=a.pos.z;
 for(let n=0;n<59;n++)a._updateSpecial(dt);
 assert.ok(a.pos.z>before,'recovery permits normal squid travel');assert.equal(a.grounded,true,'recovery does not permit a jump');
 a._updateSpecial(dt);assert.equal(a.specialActive,null);
});
