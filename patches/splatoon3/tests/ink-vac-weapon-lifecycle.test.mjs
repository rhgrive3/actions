import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './kit-composed-fixture.mjs';
import {installKitInkVac} from '../runtime/kit-ink-vac.mjs';
async function setup(){
 const f=await fixture();installKitInkVac(f,f.profile);const a=f.make('charger');
 f.G.scene=new f.THREE.Scene();f.G.projectiles=new f.Projectiles(f.G.scene);f.G.actors=[a];
 a.weapon={...a.weapon,special:'inkVac',specialCost:190};a.special=190;
 a.intent.special=true;f.tick(a);a.intent.special=false;
 assert.equal(a.specialActive?.id,'inkVac');assert.ok(f.inkVacState(a));
 return {f,a};
}
test('different-weapon switch retires held intake once without restoring gauge or emitting an old countershot',async()=>{
 const {f,a}=await setup(),state=f.inkVacState(a),mesh=state.mesh;let events=0;
 f.on('special:inkvac-dispose',({actor})=>{if(actor===a)events++;});
 a.ink=41;const hp=a.hp;a.setWeapon('shooter');
 assert.equal(a.specialActive,null);assert.equal(f.inkVacState(a),null);assert.equal(mesh.parent,null);
 assert.equal(events,1);assert.equal(a.special,0);assert.equal(a.ink,41);assert.equal(a.hp,hp);
 f.tick(a,40);a.intent.fire=true;f.tick(a,4);
 assert.equal(f.G.projectiles.list.some(p=>p.wid==='inkVac'),false);
 assert.ok(f.G.projectiles.list.some(p=>p.wid==='shooter'),'new weapon receives ordinary input');
 a.setWeapon('roller');assert.equal(events,1,'cancelled state cannot dispose twice');
});
test('same-weapon refresh keeps its active intake and paid gauge state',async()=>{
 const {f,a}=await setup(),state=f.inkVacState(a);a.setWeapon('charger');
 assert.equal(f.inkVacState(a),state);assert.equal(a.specialActive?.id,'inkVac');assert.equal(a.special,0);
 f.tick(a);assert.equal(f.inkVacState(a),state);
});
test('switch inside native update cannot restore the cancelled token in Ink Vac finally',async()=>{
 const {f,a}=await setup();let switched=false;
 a._finishFrame=()=>{if(!switched){switched=true;a.setWeapon('shooter');}};
 f.tick(a);assert.equal(a.weaponId,'shooter');assert.equal(a.specialActive,null);assert.equal(f.inkVacState(a),null);
 f.tick(a);assert.equal(a.specialActive,null);
});
test('weapon change leaves an already-released native countershot owned by Projectiles',async()=>{
 const {f,a}=await setup();f.tick(a,40);a.intent.fire=true;f.tick(a);
 const p=f.G.projectiles.list.find(p=>p.wid==='inkVac');assert.ok(p);assert.equal(f.inkVacState(a),null);
 a.setWeapon('shooter');assert.ok(f.G.projectiles.list.includes(p));assert.equal(p.wid,'inkVac');assert.equal(a.special,0);
});
test('existing reset and actual death retire the held state without refund',async()=>{
 for(const end of ['reset','death']){
  const {f,a}=await setup();
  if(end==='reset')a.reset();else a.splat(null,'water');
  assert.equal(f.inkVacState(a),null);assert.equal(a.specialActive,null);assert.equal(a.special,0);
 }
});
