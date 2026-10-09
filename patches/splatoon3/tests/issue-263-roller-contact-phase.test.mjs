import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const DT=1/60;
let production;
function setup(){return production??=(async()=>{const f=await fixture("export { install } from './patches/splatoon3/runtime/install.mjs';");return {f,api:f.install(f.profile)};})();}
async function trace(held=true,hz=60){
 const {f,api}=await setup();
 const {Actor,Character,G,THREE}=api;
 f.setRandom(()=>.5);G.time=0;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.boss=G.fx=G.audio=null;
 const a=new Actor({team:0,name:'roller contact phase',weapon:'roller',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 const c=a.character,r=a.weaponRunner;c.actor=a;G.scene.add(c.root);a.grounded=a.ground.hit=true;a.ink=100;
 const enemy={team:1,alive:true,pos:new THREE.Vector3(0,0,1),hp:100};G.actors=[a,enemy];
 let tick=-90,painted=false,hit=false,shots=0;
 G.projectiles.fireFlick=()=>shots++;G.projectiles.applyHit=()=>{hit=true;};
 G.paint.splat=(_p,_r,_t,o)=>{if(o?.kind==='roll')painted=true;return 0;};
 const rows=[],v=new THREE.Vector3();
 function step(fire,pressed=false,moving=false){
  painted=hit=false;a.intent.fire=fire;a.intent.move.set(0,0,moving?1:0);a.vel.set(0,0,moving?r.moveSpeed():0);a.pos.addScaledVector(a.vel,DT);enemy.pos.copy(a.pos);enemy.pos.z+=1;
  G.time+=DT;r.update(DT,{fire,firePressed:pressed});a._finishFrame(DT);c.root.updateMatrixWorld(true);
  let bottom=Infinity;c.weapon.drum.traverse(m=>{
   if(!m.isMesh||!m.visible)return;const p=m.geometry.attributes.position,idx=m.geometry.index;
   const end=Math.min(idx?.count??p.count,m.geometry.drawRange.start+m.geometry.drawRange.count);
   for(let i=m.geometry.drawRange.start;i<end;i++){v.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(m.matrixWorld);bottom=Math.min(bottom,v.y-c.root.position.y);}
  });
  if(tick>=0)rows.push({tick,rolling:r.rolling,wRoll:c.wRoll,bottom,painted,hit,shots});tick++;
 }
 for(let i=0;i<90;i++)step(false);c.fidget=-1;c.idleT=0;c.shufT=99;
 const clock=new f.FixedClock();let elapsed=0;
 for(let rendered=0;elapsed<75;rendered++)clock.advance(1/hz,()=>{if(elapsed<75){step(held||elapsed===0,elapsed===0,true);elapsed++;}});
 c.dispose();return rows;
}
test('#263 native contact and stripe onset agree with the posed drum at60Hz',async()=>{
 for(const hz of [30,60,120]){
 const rows=await trace(true,hz);const roll=rows.find(x=>x.rolling),paint=rows.find(x=>x.painted),hit=rows.find(x=>x.hit);
 assert.ok(roll&&paint&&hit,'native runner reaches rolling/contact/stripe');
 console.log(JSON.stringify({issue:263,hz,firstRolling:roll,firstContact:hit,firstStripe:paint,firstGround:rows.find(x=>x.rolling&&x.bottom<.055)}));
 assert.ok(rows.every(x=>x.bottom>=-.006),`actual indexed drum vertices never penetrate below the existing floor bound: ${JSON.stringify(rows.reduce((a,b)=>a.bottom<b.bottom?a:b))}`);
 assert.ok(hit.bottom<.055,'contact damage begins with the existing settled contact target');
 assert.ok(rows.filter(x=>x.rolling).every(x=>x.wRoll>0),'no hard-disabled roll pose while contact is authoritative');
 assert.ok(rows.filter(x=>x.tick>=paint.tick&&x.tick<=paint.tick+1).some(x=>x.bottom<.055),'drum reaches existing .055 ground-contact bound within one tick of first stripe');
 }
});
test('#263 release before roll admission completes flick without a push phase',async()=>{
 const rows=await trace(false);assert.ok(rows.every(x=>!x.rolling&&!x.painted&&!x.hit&&x.wRoll<1e-9));assert.equal(rows.at(-1).shots,1);
});
