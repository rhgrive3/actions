import assert from 'node:assert/strict';
import test from 'node:test';
import {catalogPaintEllipse} from '../runtime/catalog-splash-paint.mjs';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

for(const depth of [.25,.5,.8,1,1.25,2.62])test(`explicit paint depth ${depth} keeps nominal width, depth, area and centre`,()=>{
 const radius=2,shape=catalogPaintEllipse(radius,depth),r=shape.radius,sa=shape.stretchAmt;
 const front=r*(1+sa)-shape.centreBack,back=r*(1+sa/4)+shape.centreBack;
 assert.ok(sa>=0&&Number.isFinite(sa));assert.ok(Math.abs(front-back)<1e-12);
 const length=(front+back)/2;
 assert.ok(Math.abs((shape.rotate?r:length)-radius*depth)<1e-12);
 assert.ok(Math.abs((shape.rotate?length:r)-radius)<1e-12);
 assert.ok(Math.abs(Math.PI*r*length-Math.PI*radius*radius*depth)<1e-10);
});

test('catalog impact seeds vary and full-precision replay preserves the real CPU paint',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export{installMainWeaponCatalogRuntime}from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 const{paint}=makePaintWorld(f);f.G.settings={};let random=.13;f.setRandom(()=>random=(random+.137)%1);
 const a=f.make('s3-shooter-short');a.form='kid';a.pos.set(0,0,0);a.aimDir.set(0,-.2,1).normalize();a.aimPoint.set(0,0,12);
 const stamps=[],native=paint.splat;paint.splat=function(at,r,team,o={}){stamps.push({at:at.clone(),r,team,opts:{...o,stretch:o.stretch?.clone()}});return native.call(this,at,r,team,o);};
 for(let i=0;i<180;i++){f.G.time+=1/60;a.intent.fire=i<30;a.weaponRunner.update(1/60,{fire:i<30,firePressed:i===0,sub:false});f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);}
 const impact=stamps.filter(s=>s.opts.kind==='source-shot');assert.ok(impact.length>1);assert.ok(new Set(impact.map(s=>s.opts.seed)).size>1,'each impact no longer repeats seed zero');
 const expected=Array.from(paint.grid),receiver=makePaintWorld(f).paint;
 for(const s of stamps){const o={...s.opts};delete o.claimOwner;delete o.claimMode;receiver.splat(s.at,s.r,s.team,o);}
 for(let i=0;i<240;i++)receiver.advanceSimulation(1/60);
 assert.deepEqual(Array.from(receiver.grid),expected,'same canonical wire scalars reproduce CPU paint');
});
