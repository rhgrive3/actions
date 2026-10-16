import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';
import { adaptWeaponCatalog } from '../weapon-catalog-adapter.mjs';
let loaded;
const production = () => loaded ??= fixture({ fullRuntime: true, includeCharacter: true, productionComposition: true, realProjectiles: true,
  extraExports: `export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js';
export * as REG from './patches/splatoon3/runtime/weapon-models/registry.mjs';
export * as AP from './patches/splatoon3/runtime/weapon-appearance.mjs';
export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';` }).then(f => { f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile); return f; });
const list = x => Array.from(x);
const memoryStorage = () => { let value=null; return {getItem:()=>value,setItem:(_k,v)=>{value=v;},inject:v=>{value=v;}}; };
test('visual registry resolves only built variants and keeps all base IDs/callbacks/holds', async()=>{
  const {REG:R,AP,WEAPONS}=await production();
  const ids=R.registeredWeaponVariants(); assert.equal(ids.length,94);
  for (const absent of ['Shelter_Compact_02']) assert.equal(R.weaponVariantSpec(absent),null,absent+' withheld'); assert.equal(new Set(ids).size,ids.length);
  const hold={carry:{p:[1,2,3]},rc:{kick:1}};
  for(const id of ids){const spec=R.weaponVariantSpec(id),base=spec.baseId;
    assert.equal(WEAPONS[id],undefined,id+' no gameplay kit'); assert.ok(WEAPONS[base]);
    assert.equal(R.weaponModelKey(id),id);assert.equal(R.weaponBaseModelId(id),base);
    assert.equal(R.weaponModelFamily(id),R.weaponModelFamily(base));
    assert.equal(R.weaponBehaviorFamily(id),R.weaponBehaviorFamily(base));
    assert.equal(R.weaponFamilyPose(id),R.weaponFamilyPose(base));assert.equal(R.weaponFamilyTrigger(id),R.weaponFamilyTrigger(base));
    assert.equal(R.weaponModelSpec(id).baseId,base);assert.equal(R.weaponHold(id,hold),R.weaponHold(base,hold));
    assert.equal(R.weaponNeedsNativeCarry(id),R.weaponNeedsNativeCarry(base));
    assert.equal(R.weaponAppearanceKey(base,id),id);
    assert.ok(AP.weaponAppearanceOptions(base).some(o=>o.id===id));
  }
  assert.equal(R.weaponVariantSpec('absent'),null);
  for(const base of R.registeredWeaponModels()){
    assert.equal(R.weaponModelKey(base),base); assert.equal(R.weaponAppearanceKey(base,'absent'),base);
    for(const o of AP.weaponAppearanceOptions(base))assert.ok(o.id===''||o.id===base||R.weaponVariantSpec(o.id)?.baseId===base);
  }
});
test('appearance persists per base, rejects mismatches/stale data, and survives blocked storage',async()=>{
 const {REG:R,AP}=await production(),ids=R.registeredWeaponVariants(),id=ids[0],base=R.weaponVariantSpec(id).baseId;
 const other=ids.find(i=>R.weaponVariantSpec(i).baseId!==base),s=memoryStorage();
 assert.equal(AP.selectedWeaponAppearance(base,s),base);assert.equal(AP.setWeaponAppearance(base,id,s),id);
 assert.equal(AP.selectedWeaponAppearance(base,s),id);
 assert.equal(AP.setWeaponAppearance(base,other,s),base);assert.equal(AP.selectedWeaponAppearance(base,s),base);
 s.inject(JSON.stringify({[base]:'removed-row'}));assert.equal(AP.selectedWeaponAppearance(base,s),base);
 s.inject('{broken');assert.equal(AP.selectedWeaponAppearance(base,s),base);
 s.inject(JSON.stringify({[base]:id}));
 const readOnly={getItem:s.getItem,setItem(){throw Error('quota');}};
 AP.setWeaponAppearance(base,base,readOnly);assert.equal(AP.selectedWeaponAppearance(base,readOnly),base);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(AP.setWeaponAppearance(base,id,blocked),id);assert.equal(AP.selectedWeaponAppearance(base,blocked),id);
 AP.setWeaponAppearance(base,base,blocked);
});
test('every variant builds finite geometry with independent cache and base animation identity',async()=>{
 const {REG:R,getWeaponDef}=await production();
 for(const id of R.registeredWeaponVariants()){
  const base=R.weaponVariantSpec(id).baseId,b=getWeaponDef(base),d=getWeaponDef(id);
  assert.notEqual(d,b);assert.equal(getWeaponDef(id),d);assert.equal(d.modelId,base);assert.equal(d.modelVariantId,id);
  assert.equal(b.modelId,base);assert.equal(b.modelVariantId,undefined);assert.equal(d.kind,b.kind);
  assert.deepEqual(list(d.muzzle.toArray()),list(b.muzzle.toArray()));
  for(const name of ['handR','handL','inHand']){
   assert.deepEqual(list(d[name].pos.toArray()),list(b[name].pos.toArray()));assert.deepEqual(list(d[name].quat.toArray()),list(b[name].quat.toArray()));
  }
  for(const [name,g] of [['body',d.body],['ink',d.ink],['bodyStatic',d.bodyStatic],['inkStatic',d.inkStatic],...Object.entries(d.parts).map(([n,p])=>[n,p.geo])]){
   assert.ok(g?.attributes?.position,id+' '+name);
   for(const a of Object.values(g.attributes))for(const n of a.array)assert.ok(Number.isFinite(n),id+' finite '+name);
   for(const i of g.index.array)assert.ok(i>=0&&i<g.attributes.position.count,id+' valid index '+name);
  }
 }
});
test('character selection preserves behavior identity, switches appearance cache and isolates peers',async()=>{
 const f=await production(),R=f.REG;
 const id=R.registeredWeaponVariants().find(i=>R.weaponBehaviorFamily(i)==='stringer'),base=R.weaponVariantSpec(id).baseId;
 // Native constructor also builds geometry, holds, animated parts and caches.
 const ch=new f.Character({weapon:base,isLocal:true,name:'local'});
 f.AP.setWeaponAppearance(base,id,null);ch.setWeapon(base);assert.equal(ch.weaponModel,base);assert.equal(ch.weapon.def.modelId,base);
 assert.equal(ch.modelVariantId,id);const v=ch.weapon;f.AP.setWeaponAppearance(base,id,null);ch.setWeapon(base);assert.equal(ch.weapon,v);
 f.AP.setWeaponAppearance(base,base,null);ch.setWeapon(base);assert.equal(ch.modelVariantId,null);assert.notEqual(ch.weapon,v);
 f.AP.setWeaponAppearance(base,id,null);ch.setWeapon(base);assert.equal(ch.weapon,v);
 const wrong=R.registeredWeaponVariants().find(i=>R.weaponVariantSpec(i).baseId!==base);
 f.AP.setWeaponAppearance(base,wrong,null);ch.setWeapon(base);assert.equal(ch.modelVariantId,null);
 f.AP.setWeaponAppearance(base,id,null);
 ch.setWeapon(base);assert.equal(ch.modelVariantId,id);
 const peer=new f.Character({weapon:base,isLocal:false,name:'preview'});assert.equal(peer.modelVariantId,null);
 const preview=new f.Character({weapon:base,weaponAppearancePreview:true});assert.equal(preview.modelVariantId,id);
 f.AP.setWeaponAppearance(base,base,null);ch.dispose();peer.dispose();preview.dispose();
});
test('loadout selector is reachable via menu binding and touches only visual storage',()=>{
 const input=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
 const out=adaptWeaponCatalog('src/ui/menus.js',input);
 assert.match(out,/this\._bind\(appearance, \{ id: 'weapon-appearance'/);
 assert.match(out,/blurb, appearance,/);assert.match(out,/shown = id;\s+refreshAppearance\(\)/);
 assert.match(out,/appearance\.disabled = options\.length < 2/);
 const handler=out.slice(out.indexOf("this._bind(appearance"),out.indexOf('// ---- detail panel',out.indexOf('this._bind(appearance')));
 assert.doesNotMatch(handler,/setLoadout|setMe|WEAPONS\[/);
 assert.throws(()=>adaptWeaponCatalog('src/ui/menus.js',input.replace('    // ---- detail panel\n','')),/appearance selector/);
});
test('all alternate appearances retain finite native carry/attack poses and unchanged gameplay kits',async()=>{
 const f=await production(),{G,THREE,REG:R}=f;
 G.scene=new THREE.Scene();G.physics=new f.Physics(G.level);
 G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const id of R.registeredWeaponVariants()){
  const base=R.weaponVariantSpec(id).baseId;f.AP.setWeaponAppearance(base,id,null);
  const a=new f.Actor({team:0,weapon:base,isLocal:true,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  const ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];G.scene.add(ch.root);
  for(const key of ['id','sub','special','kitReference','main'])assert.equal(a.weapon[key],f.WEAPONS[base][key],id+' base kit '+key);assert.equal(a.weaponId,base);assert.equal(ch.weaponModel,base);assert.equal(ch.weapon.def.modelId,base);assert.equal(ch.modelVariantId,id);
  let attacked=0;
  for(let n=0;n<150;n++){
   const fire=n>=40&&n<120;a.intent.fire=fire;a.ink=100;
   G.time+=1/60;a.weaponRunner.update(1/60,{fire,firePressed:n===40});a._finishFrame(1/60);ch.root.updateMatrixWorld(true);
   assert.ok(list(ch.P).every(Number.isFinite),id+' finite pose');
   assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite),id+' finite muzzle');
   if(a.weaponRunner.busy?.()||a.weaponRunner.firingT>0||a.weaponRunner.charging||a.weaponRunner.rolling||a.weaponRunner.flick>=0)attacked++;
  }
  assert.ok(attacked>0,id+' admitted attack');a.weaponRunner.reset();ch.dispose();G.scene.remove(ch.root);f.AP.setWeaponAppearance(base,base,null);
 }
});
test('kit IDs retain gameplay APIs with59 reviewed defaults and36 base fallbacks',async()=>{
 const {REG:R,AP,WEAPONS,WEAPON_ORDER}=await production();
 assert.equal(WEAPON_ORDER.length,160);let implemented=0,fallback=0;
 for(const kit of ALTERNATE_WEAPON_KITS){
  assert.equal(R.weaponModelKey(kit.id),R.registeredWeaponVariantModels().includes(kit.main)?kit.main:kit.baseId);assert.equal(R.weaponBaseModelId(kit.id),kit.baseId);
  assert.equal(R.weaponModelSpec(kit.id),R.registeredWeaponVariantModels().includes(kit.main)?R.weaponVariantSpec(kit.main):R.weaponModelSpec(kit.baseId));
  assert.equal(R.weaponBehaviorFamily(kit.id),R.weaponBehaviorFamily(kit.baseId));
  const expected=R.registeredWeaponVariantModels().includes(kit.main)?kit.main:kit.baseId;if(expected===kit.main)implemented++;else fallback++;
  assert.equal(R.weaponDefaultAppearance(kit.id),expected);assert.equal(AP.selectedWeaponAppearance(kit.id,memoryStorage()),expected);
  assert.equal(WEAPONS[kit.id].sourceRow,kit.main);assert.equal(WEAPONS[kit.id].sub,kit.sub);
  assert.equal(WEAPONS[kit.id].special,kit.special);assert.equal(WEAPONS[kit.id].specialCost,kit.specialCost);
  assert.ok(AP.weaponAppearanceOptions(kit.id).some(o=>o.id===kit.baseId));
 }
 assert.equal(implemented,59);assert.equal(fallback,36);assert.equal(R.weaponDefaultAppearance('unknown-kit'),'unknown-kit');
 assert.equal(AP.selectedWeaponAppearance('unknown-kit',memoryStorage()),'unknown-kit');
});
test('explicit Base persists separately from absent kit default and does not leak to peers',async()=>{
 const f=await production(),kit=ALTERNATE_WEAPON_KITS.find(k=>k.main==='Stringer_Normal_01'),s=memoryStorage();
 assert.equal(f.AP.weaponAppearancePreference(kit.id,s),null);
 assert.equal(f.AP.selectedWeaponAppearance(kit.id,s),kit.main);
 f.AP.setWeaponAppearance(kit.id,kit.baseId,s);
 assert.equal(f.AP.weaponAppearancePreference(kit.id,s),kit.baseId);
 const reloaded={getItem:s.getItem,setItem:s.setItem};assert.equal(f.AP.selectedWeaponAppearance(kit.id,reloaded),kit.baseId);
 f.AP.setWeaponAppearance(kit.id,'',s);assert.equal(f.AP.weaponAppearancePreference(kit.id,s),null);assert.equal(f.AP.selectedWeaponAppearance(kit.id,s),kit.main);
 s.inject(JSON.stringify({[kit.baseId]:'removed-row'}));assert.equal(f.AP.selectedWeaponAppearance(kit.id,s),kit.main);
 f.AP.setWeaponAppearance(kit.id,kit.baseId,null);
 const local=new f.Character({weapon:kit.id,isLocal:true}),peer=new f.Character({weapon:kit.id,isLocal:false}),bot=new f.Character({weapon:kit.id,isLocal:false});
 assert.equal(local.weaponModel,kit.main);assert.equal(local.modelVariantId,null);
 for(const ch of [peer,bot]){assert.equal(ch.weaponModel,kit.main);assert.equal(ch.modelVariantId,kit.main);assert.equal(ch.weapon.def.modelId,kit.baseId);}
 f.AP.setWeaponAppearance(kit.id,'',null);local.setWeapon(kit.id);assert.equal(local.modelVariantId,kit.main);
 local.setWeapon('unknown-kit');assert.equal(local.weaponModel,'shooter');assert.equal(local.modelVariantId,null);
 local.dispose();peer.dispose();bot.dispose();
});
