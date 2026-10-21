import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
const extraExports="export {getWeaponDef, animateWeapon} from './inkwave-public/src/game/character-weapons.js'; export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export {hairStats} from './patches/splatoon3/runtime/hair-cache.mjs';";
const digest=g=>{const h=crypto.createHash('sha256');for(const a of [g.index,...Object.values(g.attributes)])h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));return h.digest('hex');};
async function load(baseline=false){const f=await fixture({fullRuntime:true,includeCharacter:true,realProjectiles:true,extraExports,adaptNative:(rel,code)=>{code=adaptBuildSource(rel,code);return baseline?code.replace(' m.visible = pd.hidden !== true;',''):code;},adaptRuntime:(rel,code)=>baseline&&rel.endsWith('/weapon-models/kit.mjs')?code.replace(', hidden: true',''):code,vmMathRandom:()=>.5});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.scene=new f.THREE.Scene();return f;}
function weaponMeshes(w){const out=[];for(;w;w=w.left)for(const [name,g] of Object.entries(w.parts))out.push([name,g.userData.mesh,w.def.parts[name],g]);return out;}
function actor(f,id){const a=new f.Actor({team:0,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.character.actor=a;a.character.onEvent=null;return a;}

test('all 65 weapons preserve every geometry byte and animated channel while hiding only explicit zero-area placeholders',async()=>{
 const [A,B]=await Promise.all([load(true),load()]);let hidden=0,weapons=0;
 // Keep the first real pair alive while subsequent independent Characters use
 // the native ref-counted immutable style cache. Releasing every pair before
 // constructing the next needlessly rebuilds the same style for every weapon.
 const live=new Set(),instances=new WeakSet(),skeletons=new WeakSet();let keepers=null,sharedHashes=null,instanceCount=0,skeletonCount=0;
 try {
 for(const {id} of MAIN_WEAPON_CATALOG.records){const da=A.getWeaponDef(id),db=B.getWeaponDef(id);let n=0;
  for(const key of ['body','ink','bodyStatic','inkStatic','drum','drumCaps','glow','glass'])if(da[key])assert.equal(digest(da[key]),digest(db[key]),id+'.'+key);
  assert.deepEqual(JSON.parse(JSON.stringify(da.muzzle)),JSON.parse(JSON.stringify(db.muzzle)));
  for(const [name,p] of Object.entries(db.parts)){assert.equal(digest(da.parts[name].geo),digest(p.geo),id+'.'+name);if(p.hidden){n++;assert.equal(p.geo.index.count,3);const pos=p.geo.attributes.position;for(let k=0;k<3;k++)assert.equal(pos.getComponent(0,k),pos.getComponent(1,k));for(let k=0;k<3;k++)assert.equal(pos.getComponent(0,k),pos.getComponent(2,k));}}
  hidden+=n;if(n)weapons++;
  const aa=actor(A,id),ab=actor(B,id),ca=aa.character,cb=ab.character;const wa=ca.weapon,wb=cb.weapon;
  for(const c of [ca,cb]){assert.equal(instances.has(c),false);assert.equal(skeletons.has(c.skeleton),false);instances.add(c);instanceCount++;skeletons.add(c.skeleton);skeletonCount++;live.add(c);}
  if(!keepers)keepers=[ca,cb];
  const ma=weaponMeshes(wa),mb=weaponMeshes(wb);assert.equal(ma.length,mb.length);
  for(const near of [true,false,true,false,true])for(const dt of [1/30,1/60,1/120]){
   for(let hand=0,x=wa,y=wb;x;x=x.left,y=y.left,hand++){
    const st={t:4,dt,near,hand,color:A.G.teamColors[0],charge:.5,full:false,chargeFlash:.2,firing:true,rolling:1,grounded:true,groundSpeed:2,sinceShoot:.06,sinceFlick:.2,sinceRelease:.03,worldQuat:new A.THREE.Quaternion()};A.animateWeapon(x,st);B.animateWeapon(y,{...st,color:B.G.teamColors[0],worldQuat:new B.THREE.Quaternion()});
   }
   for(let i=0;i<mb.length;i++){const [name,m,p,g]=mb[i],[,old,,og]=ma[i];assert.equal(m.visible,p.hidden!==true,id+'.'+name);assert.equal(g.visible,og.visible);assert.deepEqual([...g.position.toArray()],[...og.position.toArray()]);assert.deepEqual([...g.quaternion.toArray()],[...og.quaternion.toArray()]);assert.deepEqual([...g.scale.toArray()],[...og.scale.toArray()]);assert.equal(m.castShadow,old.castShadow);assert.equal(m.frustumCulled,old.frustumCulled);assert.equal(m.geometry.drawRange.count,old.geometry.drawRange.count);}
  }
  cb.setColor('#244866');for(const [,m,p] of mb)assert.equal(m.visible,p.hidden!==true);
  // warmAll temporarily shows every object, then must restore placeholder visibility.
  const renderer={compileAsync:async()=>{},getRenderTarget:()=>null,setRenderTarget(){},shadowMap:{enabled:false}};
  await cb.warmAll(renderer,new B.THREE.PerspectiveCamera(),B.G.scene);for(const [,m,p]of mb)assert.equal(m.visible,p.hidden!==true);
  if(!sharedHashes)sharedHashes=keepers.flatMap(c=>(c.hairKeys483||[]).map(r=>({geo:r.entry.geo,hash:digest(r.entry.geo)})));
  for(const row of sharedHashes)assert.equal(digest(row.geo),row.hash,'shared style geometry stays immutable');
  if(ca!==keepers[0]){ca.dispose();cb.dispose();live.delete(ca);live.delete(cb);}
 }
 } finally {for(const c of live)c.dispose();}
 assert.equal(instanceCount,MAIN_WEAPON_CATALOG.records.length*2);
 assert.equal(skeletonCount,MAIN_WEAPON_CATALOG.records.length*2);
 for(const f of [A,B]){assert.equal(f.hairStats().entries,0);assert.equal(f.hairStats().liveUsers,0);}
 // 154 in 58 weapons when the census was taken; the rebuilt Bucket Slosher (#1310) hides its native 'lever' channel.
 assert.equal(hidden,155);assert.equal(weapons,59);console.log(JSON.stringify({hiddenParts:hidden,affectedWeapons:weapons}));
});
