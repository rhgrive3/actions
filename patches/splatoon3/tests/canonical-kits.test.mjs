import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {fixture} from './source-fixture.mjs';
import {CANONICAL_KITS} from '../runtime/canonical-kits-data.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
const reference=JSON.parse(fs.readFileSync(new URL('../reference/canonical-kits-1130.json',import.meta.url)));
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;}
test('all 65 canonical rows map exact catalogue IDs and source fields without alternate kits',()=>{
 assert.equal(reference.records.length,65);assert.equal(Object.keys(CANONICAL_KITS).length,65);
 for(const r of MAIN_WEAPON_CATALOG.records){const s=reference.records.find(x=>x.id===r.id),k=CANONICAL_KITS[r.id];assert.equal(s.sourceRow,r.sourceRow);assert.equal(s.rowPointer,r.rowPointer);assert.equal(k.main,s.sourceRow);assert.equal(k.specialCost,s.SpecialPoint);assert.equal(k.sub,s.sub);assert.equal(k.special,s.special);}
});
test('all 65 real Actors retain canonical kit, gear cost, respawn and switch identity',async()=>{
 const f=await setup();
 for(const [id,k]of Object.entries(CANONICAL_KITS)){
  const a=f.make(id);assert.equal(a.weapon.sub,k.sub,id);assert.equal(a.weapon.special,k.special,id);assert.equal(a.specialCost(),k.specialCost,id);
  a.s3RefreshGear();assert.equal(a.weapon.sub,k.sub,id);assert.equal(a.specialCost(),k.specialCost/(a.s3.modifiers.specialCharge||1),id);
  a.splat(null,'test');assert.equal(a.alive,false);a.reset();assert.equal(a.weapon.sub,k.sub,id);assert.equal(a.weapon.special,k.special,id);assert.equal(a.specialCost(),k.specialCost,id);
  a.setWeapon('shooter');a.setWeapon(id);assert.equal(a.weapon.special,k.special,id);assert.equal(a.specialCost(),k.specialCost,id);
 }
});
test('all 65 canonical sets release their registered sub through Actor input and pay selected cost',async()=>{
 const f=await setup();
 for(const [id,k]of Object.entries(CANONICAL_KITS)){
  f.G.projectiles.clear();f.G.actors.length=0;const a=f.make(id);a.form='kid';a.ink=100;a.invuln=0;
  const cost=(f.SUB[k.sub].inkCost??f.SUB[k.sub].inkCostFallback)*(a.s3.modifiers.inkSaverSub??1);
  a.intent.sub=true;f.tick(a,8);a.intent.sub=false;f.tick(a,2);
  assert.equal(a.weaponRunner.s3Sub.id,k.sub,id);assert.ok(Math.abs(a.ink-(100-cost))<1e-6,`${id} ${k.sub}: ${a.ink} expected ${100-cost}`);
 }
});
test('all 65 canonical sets activate their registered special via real Actor admission',async()=>{
 const f=await setup();
 for(const [id,k]of Object.entries(CANONICAL_KITS)){
  f.G.projectiles.clear();f.G.actors.length=0;const a=f.make(id);a.form='kid';a.ink=40;a.invuln=0;a.special=a.specialCost();
  a.intent.special=true;f.tick(a);
  assert.equal(a.stats.specials,1,`${id} ${k.special} admitted`);assert.ok(a.specialActive||a.special<a.specialCost(),`${id} active or deployed`);assert.equal(a.specialReady(),false,id);
  a.intent.special=false;a.splat(null,'test');a.reset();assert.equal(a.weapon.special,k.special,id);
 }
});

test('custom pairs are bound to their main and do not leak across bot/remote weapon changes',async()=>{
 const f=await setup();const {applyCatalogueChoice}=await import('../runtime/catalogue.mjs');
 const a=f.make('s3-shooter-short');applyCatalogueChoice(a,{sub:'torpedo',special:'zipcaster'},f);
 a.setWeapon('s3-shooter-first');assert.equal(a.weapon.sub,'bomb');assert.equal(a.weapon.special,'bubbler');
 assert.equal(a.s3CatalogueChoice,null);
 applyCatalogueChoice(a,{sub:'bomb',special:'bubbler'},f);assert.equal(a.weapon.kitStatus,'verified-base-kit');assert.equal(a.s3CatalogueChoice,null);
});

test('canonical bot policy admits all newly equipped special families without free gauge or effects',async()=>{
 const {driveCanonicalBotSpecial}=await import('../runtime/canonical-kits.mjs');const f=await setup();makePaintWorld(f);
 for(const [id,k]of Object.entries(CANONICAL_KITS)){
  if(['trizooka','bubbler','inkVac','storm'].includes(k.special))continue;
  f.G.projectiles.clear();f.G.actors.length=0;const a=f.make(id),enemy=f.make('shooter');enemy.team=1;enemy.pos.set(0,0,5);a.special=a.specialCost();a.invuln=0;
  driveCanonicalBotSpecial(a,a.intent,1/60,enemy);assert.equal(a.intent.special,true,id);f.tick(a);assert.equal(a.stats.specials,1,id);
  for(let frame=0;frame<180;frame++){driveCanonicalBotSpecial(a,a.intent,1/60,enemy);f.tick(a);}
  assert.ok(Number.isFinite(a.special),id);
 }
});

test('canonical Splat Bomb paint credits floor owner and exact kit gauge, then death applies saver',async()=>{
 const f=await setup(),{paint,face}=makePaintWorld(f);f.setRandom(()=>.37);
 const a=f.make('s3-shooter-first');a.form='kid';a.invuln=0;a.special=0;
 a.intent.sub=true;f.tick(a,8);a.intent.sub=false;f.tick(a,2);
 const bomb=f.G.projectiles.bombs.at(-1);assert.ok(bomb);bomb.pos.set(0,.1,8);
 f.G.projectiles._explodeBomb(bomb);
 for(let i=0;i<200;i++)paint.advanceSimulation(1/60);
 assert.ok(a.stats.turf>0);assert.equal(a.stats.turf,paint.counts[0]*face.cu*face.cv);
 assert.equal(a.special,Math.min(180,a.stats.turf));
 const before=a.special;a.splat(null,'test');assert.equal(a.special,before*.5);
});

test('canonical Ink Storm delayed paint adds turf but never recharges its special after it ends',async()=>{
 const f=await setup(),{paint}=makePaintWorld(f);f.setRandom(()=>.37);
 const a=f.make('s3-slosher-bathtub');a.form='kid';a.invuln=0;a.special=a.specialCost();a._startSpecial();
 assert.equal(a.stats.specials,1);assert.equal(a.weapon.special,'storm');
 a.intent.sub=true;f.tick(a);a.intent.sub=false;f.tick(a,2);
 for(let i=0;i<900;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);}
 assert.ok(a.stats.turf>0);assert.equal(a.special,0);
});

test('all 65 canonical pairs cross real JSON ticks and reject foreign or stale loadout substitutions',async()=>{
 const f=await setup();let message;
 const session=id=>({myId:id,isHost:false,_members:new Map([['A',{}],['B',{}]]),tr:{broadcast:m=>{message=JSON.parse(JSON.stringify(m));}}});
 for(const [id,k]of Object.entries(CANONICAL_KITS)){
  const owner=f.make(id),proxy=f.make(id);Object.assign(owner,{nid:1,owner:'A'});Object.assign(proxy,{nid:1,owner:'A',remote:true});
  const sender=new f.NetMatch(session('A'),{}),receiver=new f.NetMatch(session('B'),{});sender.bind({actors:[owner]});sender._sendTick();
  receiver._setupActor(proxy);receiver.byNid.set(1,proxy);f.G.netm=receiver;receiver._tick('A',message);
  assert.equal(proxy.weapon.sub,k.sub,id);assert.equal(proxy.weapon.special,k.special,id);assert.equal(proxy.specialCost(),owner.specialCost(),id);assert.equal(proxy.weapon.kitStatus,'verified-base-kit',id);
  const foreign=JSON.parse(JSON.stringify(message));foreign.ts++;foreign.ck[1][1]='torpedo';receiver._tick('foreign',foreign);assert.equal(proxy.weapon.sub,k.sub,id);
  const stale=JSON.parse(JSON.stringify(message));stale.ck[1][1]='torpedo';receiver._tick('A',stale);assert.equal(proxy.weapon.sub,k.sub,id);sender.dispose();
 }
});

test('unchanged custom kit update preserves weapon identity, while gear refresh restores the custom pair',async()=>{
 const f=await setup();const {applyCatalogueChoice}=await import('../runtime/catalogue.mjs');const a=f.make('s3-shooter-short');
 applyCatalogueChoice(a,{sub:'torpedo',special:'zipcaster'},f);const weapon=a.weapon,choice=a.s3CatalogueChoice;
 f.tick(a,120);assert.equal(a.weapon,weapon);assert.equal(a.s3CatalogueChoice,choice);
 a.s3RefreshGear();assert.equal(a.weapon.sub,'torpedo');assert.equal(a.weapon.special,'zipcaster');assert.equal(a.specialCost(),190/(a.s3.modifiers.specialCharge||1));
});
