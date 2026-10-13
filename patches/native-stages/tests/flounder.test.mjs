import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeStageCatalog,prepareNativeStageBuild} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {parseSourceOBJ} from '../runtime/source-convert.mjs';
import {nativeFixture,readStage} from './fixture.mjs';
const definition=JSON.parse(fs.readFileSync(new URL('../definitions/flounder.json',import.meta.url)));
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS,source=process.env.INKWAVE_NATIVE_STAGE_SOURCE,available=root&&fs.existsSync(path.join(root,'flounder/manifest.json'));
test('Flounder is pinned, opt-in and explicit about inferred placement',()=>{
 const actual=nativeStageCatalog().stages.find(s=>s.id==='flounder');assert.deepEqual(actual,definition);assert.equal(actual.internal,'Vss_Jyoheki03');assert.equal(actual.sourceSha256,'2cd34230fe9858e9651f0a597f8a8c740ca1067595379158dcaf64943fea384b');assert.equal(actual.tree,'dd181a9d2772d8858f7c73245716639bee97f932');assert.equal(actual.version1130Verified,false);assert.equal(actual.sourceNavigation.wallClimb,true);assert.match(actual.placementStatus,/unverified/);
 const built=prepareNativeStageBuild(null);assert.equal(built.root,null);assert.equal(built.config.mode,'browser-direct');assert.ok(built.config.stages.some(s=>s.id===actual.id));
});
test('Flounder keeps complete source buffers and omits exactly five unresolved BG vehicle records',{skip:!available||!source},()=>{
 const data=readStage(root,'flounder'),obj=fs.readFileSync(path.join(source,definition.internal,definition.internal+'.obj'),'utf8'),raw=parseSourceOBJ(obj),selected=parseSourceOBJ(obj,definition.sourceSemantics);
 for(const key of ['vertices','indices']){assert.deepEqual(Buffer.from(selected[key].buffer),Buffer.from(raw[key].buffer));assert.deepEqual(Buffer.from(data[key].buffer),Buffer.from(raw[key].buffer));}
 assert.equal(raw.vertices.length/8,855868);assert.equal(raw.indices.length/3,633427);assert.equal(raw.objects.length,790);
 const omitted=raw.objects.filter((o,i)=>o.background&&o.active&&!selected.objects[i].active);assert.equal(omitted.length,5);
 for(const o of omitted){assert.match(o.name,/^FldBG_Jyoheki03_(?:SedanBase_1|Tire1_2|Tire2_2|Tire3_2|Tire4_3)__CarSet$/);assert.equal(o.collidable,false);assert.ok(o.bounds[1][1]>290);}
 for(let i=0;i<raw.objects.length;i++){const a=selected.objects[i],b=data.manifest.objects[i];for(const k of ['name','material','vo','vc','io','ic','active','collidable','paintable','sourceHasUV'])assert.equal(a[k],b[k],a.name+' '+k);if(raw.objects[i].background)assert.equal(a.collidable,false);}
 console.log(JSON.stringify({id:'flounder',vertices:855868,triangles:633427,sourceFloat32AndUint32Identical:true,omittedBgVehicles:omitted.map(o=>o.name),bufferGeometryUnmodified:true}));
});
test('Flounder source grass supports opposing pads, grounded movement and initial squid landing',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,'flounder')),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const pads=[];
 for(let team=0;team<2;team++){const pad=L.spawnPads[team],hit=P.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);assert.ok(hit.hit&&hit.normal.y>.68);assert.ok(Math.abs(hit.point.y+ .08-pad.y)<1e-6);assert.match(L.manifest.objects[L.data.objectIds[hit.triangle]].name,/PackPnt_Floor_Grass/);assert.ok(P.bodyFits(hit.point.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));assert.ok(G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.005),1.5,team,{instant:true,seed:.125})>0);assert.equal(G.paint.sample(hit.face,hit.u,hit.v),team+1);pads.push({team,pad:pad.toArray(),support:hit.point.toArray()});}
 const movement=[];
 for(let team=0;team<2;team++)for(const hz of [30,60,120]){const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(L.spawnPads[team],team?Math.PI:0);a.intent.move.set(0,0,team?-1:1);a.intent.fire=false;const before=a.pos.clone();for(let i=0;i<hz;i++){G.time+=1/hz;a.update(1/hz);}assert.ok(a.alive&&a.grounded);assert.ok(a.pos.distanceTo(before)>1);movement.push({team,hz,distance:a.pos.distanceTo(before),end:a.pos.toArray()});}
 for(const team of [0,1]){const distances=movement.filter(m=>m.team===team).map(m=>m.distance);assert.ok(Math.max(...distances)-Math.min(...distances)<.25);}
 G.nav=new f.NavGraph(L,P);G.match.mode='turf';G.match.opts={};const landings=[];
 for(let team=0;team<2;team++){const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;assert.equal(f.beginInitialSquidSpawn(a),true);assert.ok(a.s3.squidSpawn.target);a.intent.fire=true;a.update(1/60);a.intent.fire=false;for(let i=0;i<90;i++)a.update(1/60);assert.equal(a.s3.squidSpawn,undefined);assert.equal(a.grounded,true);const brain=new f.BotBrain(a,'normal'),goals=f.nativePaintGoalIds(brain,G),from=G.nav.nearest(a.pos,1.2);assert.ok(goals.length>0);for(const to of goals.slice(0,5))assert.ok(G.nav.path(from,to,team,50000));landings.push({team,position:a.pos.toArray(),paintGoals:goals.length});}
 for(let k=0;k<G.paint.grid.length;k++)if(G.paint.dead[k])assert.equal(G.paint.grid[k],0);
 console.log(JSON.stringify({id:'flounder',pads,movement,landings,maskedHolesUnowned:true,navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,version1130Verified:false}));
});
