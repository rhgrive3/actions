import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fixture } from './source-fixture.mjs';
const IDS = ['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'];
const MUZZLE = [.62,.872,.622], LEFT = [.09,.14,.08];
let promise;
const prod = () => promise ??= fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js';\nexport * as REG from './patches/splatoon3/runtime/weapon-models/registry.mjs';\nexport { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"})
  .then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;});
function geometryHash(d) {
  const h=crypto.createHash('sha256');
  for(const g of[d.body,d.ink]){for(const [name,a]of Object.entries(g.attributes)){h.update(name);h.update(new Uint8Array(a.array.buffer));}h.update(new Uint8Array(g.index.array.buffer));}
  return h.digest('hex');
}
test('the uncircled Undercover geometry remains byte-for-byte identical to main b078c379',async()=>{
  const f=await prod();assert.equal(geometryHash(f.getWeaponDef('s3-shelter-compact')),'32d6a447e302a3c2e2d670152f70a71250207535d2723536560610146495c021');
});
test('rebuilt canopies preserve grips, shot sockets, merged geometry and cached definitions',async()=>{
  const f=await prod(),report=[];
  for(let i=0;i<IDS.length;i++){
    const id=IDS[i],d=f.getWeaponDef(id);assert.equal(f.getWeaponDef(id),d);
    assert.deepEqual(Array.from(d.muzzle.toArray()),[0,.075,MUZZLE[i]]);assert.deepEqual(Array.from(d.gripL.pos.toArray()),[0,.075,LEFT[i]]);
    let triangles=0,bytes=0;
    for(const g of[d.body,d.ink]){
      triangles+=g.index.count/3;bytes+=g.index.array.byteLength;assert.equal(g.groups.length,0,'one material class per merged draw');
      for(const a of Object.values(g.attributes)){bytes+=a.array.byteLength;for(const v of a.array)assert.ok(Number.isFinite(v));}
    }
    assert.ok(triangles<=10000,id+' model triangle budget '+triangles);assert.ok(bytes<=300000,id+' rest-geometry budget '+bytes);
    for(const name of['trigger','bolt','can','led','canopy','canopyInk'])assert.ok(d.parts[name],id+' channel '+name);
    // Every visible canopy has separate paper/cloth colour and framing parts.
    assert.ok(d.parts.canopy.geo.index.count>300);assert.ok(d.parts.canopyInk.geo.index.count>300);
    report.push({id,triangles,bytes});
  }
  console.log('BRELLA_REBUILD_METRICS '+JSON.stringify(report));
});
test('30/60/120 Hz open, fold, launch, break and reappear remain read-only finite animations',async()=>{
  const f=await prod();
  for(const id of IDS)for(const hz of[30,60,120]){
    const d=f.getWeaponDef(id),parts={};for(const name of['canopy','canopyInk'])parts[name]=new f.THREE.Object3D();
    const w={def:d,parts,ps:{}};
    const step=(canopy,naked=0)=>{const cs=Object.freeze({canopy:canopy&&Object.freeze(canopy),naked});const st=Object.freeze({runner:Object.freeze({catalogState:cs}),dt:1/hz});for(let j=0;j<hz;j++){f.REG.weaponModelSpec(id).animate(w,st);for(const p of Object.values(parts))assert.ok(p.scale.toArray().every(Number.isFinite));}};
    step({open:true,launched:false});assert.ok(parts.canopy.scale.x>9.08&&parts.canopy.scale.x<9.10);assert.equal(parts.canopy.visible,true);
    step({open:false,launched:false});assert.ok(parts.canopy.scale.x<1.001);
    step({open:true,launched:true});assert.equal(parts.canopy.visible,false);assert.equal(parts.canopyInk.visible,false);
    step(null,3);assert.equal(parts.canopy.visible,false);
    step(null,0);assert.equal(parts.canopy.visible,true);assert.ok(parts.canopy.scale.x>.999&&parts.canopy.scale.x<1.001);
  }
});
test('all three real runners still emit, open shields, block hostile shots and launch at 30/60/120 Hz',async()=>{
  const f=await prod();f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  for(const id of IDS)for(const hz of[30,60,120]){
    f.G.projectiles.clear();f.G.actors=[];const a=f.make(id);a.form='kid';a.intent.fire=true;a.ink=100;
    let sawOpen=false,sawLaunch=false,hit=false;
    for(let j=0;j<7*hz;j++){
      f.G.time+=1/hz;a.ink=100;a.weaponRunner.update(1/hz,{fire:true,firePressed:j===0});
      const c=a.weaponRunner.catalogState.canopy;
      if(c?.open&&!c.launched){sawOpen=true;if(!hit){const p=f.G.projectiles._new();p.team=1;p.damage=10;p.owner={remote:false};p.prev.copy(c.pos).add(new f.THREE.Vector3(0,0,3));p.pos.copy(c.pos).sub(new f.THREE.Vector3(0,0,3));const guard=f.G.projectiles.kitDefenseCandidate(p);assert.ok(guard,id+' live shield');const hp=c.hp;guard.onHit(p);assert.equal(c.hp,hp-10);hit=true;}}
      if(c?.launched)sawLaunch=true;
    }
    assert.ok(sawOpen&&sawLaunch&&hit,id+' lifecycle at '+hz);assert.ok(f.G.projectiles.list.some(p=>p.wid===id),id+' real shot');a.weaponRunner.reset();
  }
});
