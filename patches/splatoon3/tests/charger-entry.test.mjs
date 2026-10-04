import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
async function setup() {
 const f=await fixture(),a=f.make('charger'),p=new f.Projectiles(new f.THREE.Scene()),hits=[];
 p._muzzle=(_a,out)=>out.set(0,1,0);p._aimFrom=(_a,_m,out)=>out.set(0,0,1);
 p.applyHit=(_a,e)=>hits.push(e);f.G.physics.raycast=(_a,_b,_c,h)=>{h.hit=false;return h;};
 function enemy(x,z){const e=f.make();e.team=1;e.pos.set(x,0,z);e.smoothY=0;return e;}
 return {f,a,p,hits,enemy};
}
test('partial beam chooses hurt-volume entry, not actor centre or roster order',async()=>{
 const {f,a,p,hits,enemy}=await setup(),nearCentre=enemy(.5,3.7),earlyEntry=enemy(0,3.8);
 for(const list of [[nearCentre,earlyEntry],[earlyEntry,nearCentre]]) {
  f.G.actors=[a,...list];hits.length=0;p.fireCharger(a,a.weapon,.5);
  assert.deepEqual(hits,[earlyEntry]);
 }
});
test('full piercing beam orders every victim by first entry with unchanged hit radius',async()=>{
 const {f,a,p,hits,enemy}=await setup(),nearCentre=enemy(.5,3.7),earlyEntry=enemy(0,3.8),miss=enemy(.53,3);
 for(const list of [[nearCentre,earlyEntry,miss],[miss,earlyEntry,nearCentre]]) {
  f.G.actors=[a,...list];hits.length=0;p.fireCharger(a,a.weapon,1);
  assert.deepEqual(hits,[earlyEntry,nearCentre]);
 }
});
test('wall truncates piercing beam before actors whose volumes start behind it',async()=>{
 const {f,a,p,hits,enemy}=await setup(),visible=enemy(0,2),occluded=enemy(0,5);
 f.G.actors=[a,occluded,visible];f.G.physics.raycast=(origin,dir,range,h)=>{
  h.hit=dir.z>.9 && range>=3; if(h.hit){h.dist=3;h.point.copy(origin).addScaledVector(dir,3);h.normal.set(0,0,-1);}return h;
 };
 p.fireCharger(a,a.weapon,1);assert.deepEqual(hits,[visible]);
});
