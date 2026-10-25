import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './source-fixture.mjs';
// Actual final composed native serializer, before/after observational drawing.
// This is a packet-component regression, not relay or two-peer acceptance.
for(const id of ['shooter','splatling','dualies','s3-shooter-heavy','s3-spinner-quick','s3-maneuver-short'])test(id+' native wire bytes do not depend on cosmetic drawing',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.37,
  extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 f.G.fx={muzzle(){},_spawnDrop(){}};f.G.camera={position:new f.THREE.Vector3(0,2,-4)};
 const sys=f.G.projectiles,a=f.make(id);a.nid=7;a.owner='local';a.pos.set(0,1,0);a.aimPoint.set(0,2,50);a.intent.fire=true;f.tick(a,id.includes('splatling')||id.includes('spinner')?70:3);a.intent.fire=false;
 for(let i=0;i<90&&!sys.list.length;i++)f.tick(a);
 assert(sys.list.length);for(const p of sys.list)p.age=1/60;
 const packet=()=>{const out=[],sender={_projectileSeq:0,_rec(e){out.push(e);return e;}};for(const p of sys.list)f.NetMatch.prototype.recProj.call(sender,p);return JSON.stringify(out);};
 const before=packet();let rng=0;f.setRandom(()=>{rng++;return .37;});sys._draw();sys.syncVisuals(1);const after=packet();assert.equal(after,before);assert.equal(rng,0);
 console.log('wire-before-after '+id+' '+before);
});
