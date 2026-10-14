import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {MAIN_WEAPON_CATALOG as C} from '../runtime/main-weapon-catalog-data.mjs';
test('all 65 actual main Actors paint reachable floor and credit exactly its ownership',async()=>{
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"}); f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile); const rows=[];
for(const r of C.records){
 f.G.projectiles.clear();f.G.actors=[]; const {paint,V}=makePaintWorld(f); // each weapon uses a fresh battle; detached canopies survive owner resets
f.G.settings={};f.setRandom(()=>.37);
 const a=f.make(r.id);a.form='kid';a.aimDir.set(0,-.12,1).normalize();a.aimPoint.set(0,0,12);a.pos.set(0,0,0);a.ink=100;
 let stamps=0,ownerless=0,invalid=0;const raw=paint.splat;
 paint.splat=function(at,R,team,opts={}){stamps++;if(!opts.cosmetic&&!opts.claimOwner&&!this._paintNextOwner)ownerless++;if(!Number.isFinite(R)||R<=0)invalid++;return raw.call(this,at,R,team,opts);};
 let error=null;
 try{for(let i=0;i<360;i++){a.intent.fire=i<150;f.G.time+=1/60;a.update(1/60);f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);}}catch(e){error=e.stack;}
 rows.push({id:r.id,family:r.family,legacy:r.legacy,stamps,ownerless,invalid,cells:paint.counts[0],turf:a.stats.turf,special:a.special,error});assert.equal(error,null,r.id);assert.ok(stamps>0,r.id+' emits real paint');assert.ok(paint.counts[0]>0,r.id+' owns floor');assert.equal(ownerless,0,r.id+' owner association');assert.equal(invalid,0,r.id+' finite positive radii');assert.ok(Math.abs(a.stats.turf-paint.counts[0]*.0625/3.305785)<1e-7,r.id+' turf points counted once');
}
assert.equal(rows.length,65);
});
