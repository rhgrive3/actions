import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {spawnSplashDrop} from '../../splatoon3/runtime/blaster-flight-paint.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-combat-three-20261029-before.json',import.meta.url),'utf8')),root=new URL('../../splatoon3/runtime/',import.meta.url),read=n=>fs.readFileSync(new URL(n+'.mjs',root),'utf8');
async function module(n,old=false,edit=s=>s,extra=''){const s=edit(old?frozen[n]:read(n)).replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,root).href));return import('data:text/javascript;base64,'+Buffer.from(s+'\n'+extra+'\n//# sourceURL=combat-three-fixture-'+n+'-'+old+'.mjs').toString('base64'));}
test('actual hit presentation keeps all Float32/Float64 channels, overlap order and early pole getter reads',async()=>{
 const functions=[(await module('weapon-hit-reaction',true,s=>s,'export {applyPresentation};')).applyPresentation,(await module('weapon-hit-reaction',false,s=>s,'export {applyPresentation};')).applyPresentation];let comparisons=0;
 function run(f,kind,dual,held,age,overlap,Type,observable=false){const values=new Type(100);for(let i=0;i<values.length;i++)values[i]=Math.sin(i*.4);const events=[],C={SPINE:0,CHEST:3,NECK:6,HEAD:9,HIPS:12,HIPS_P:15,CLAVL:18,CLAVR:21,UARML:24,UARMR:27,ANC:30,ANCR:33,ANL:36,ANLR:overlap?33:39,IKL:70,IKR:71,LTW:72};let poleR=overlap?33:42,poleL=45;
 Object.defineProperties(C,{POLER:{get(){events.push('R');return poleR;}},POLEL:{get(){events.push('L');return poleL;}}});values[70]=held&1?1:0;values[71]=held&2?1:0;values[72]=0;
 const P=observable?new Proxy(values,{get(t,k){return t[k];},set(t,k,v){events.push('P'+k);t[k]=v;poleR=60;poleL=63;return true;}}):values;
 const pre=Float32Array.from({length:100},(_,i)=>Math.cos(i*.7)),s={k:kind,t:0,e:0,on:false,pre,a:1.3,m:true,x:.7,z:-.6},ch={P,tr:[age],kidForm:true,dual,bombSwap:0,root:{visible:true},_owner:()=>({alive:true})};f(ch,{T_HIT:0},C,s);return {values:Array.from(values),events,state:{t:s.t,e:s.e,on:s.on,mv:s.mv}};}
 for(const Type of [Float32Array,Float64Array])for(let kind=0;kind<7;kind++)for(const dual of [false,true])for(let held=0;held<4;held++)for(const overlap of [false,true])for(const hz of [30,60,120])for(const frame of [0,1,3,8,18,40]){const args=[kind,dual,held,frame/hz,overlap,Type];assert.deepEqual(run(functions[1],...args),run(functions[0],...args));comparisons++;}
 for(const held of [0,1,2,3])assert.deepEqual(run(functions[1],2,true,held,.08,true,Float32Array,true),run(functions[0],2,true,held,.08,true,Float32Array,true));console.log(JSON.stringify({actualHitPoseComparisons:comparisons,observableChannelCases:4}));
});
test('Roller native-impact wrapper observes normal mutation from the explicit height getter; naive norm sharing changes paint',async()=>{
 const actual=await module('roller-impact-paint');const candidate=await module('roller-impact-paint',true,s=>s
 .replace('rollerImpactAngleDegrees(velocity, normal) {','rollerImpactAngleDegrees(velocity, normal, cached) {')
 .replace('nl=Math.hypot(normal.x,normal.y,normal.z);','nl=cached??Math.hypot(normal.x,normal.y,normal.z);')
 .replace('rollerImpactDepthScaleForPhase(projectile, normal, straight, height) {','rollerImpactDepthScaleForPhase(projectile, normal, straight, height, cached) {')
 .replace('rollerImpactAngleDegrees(projectile?.vel,normal);','rollerImpactAngleDegrees(projectile?.vel,normal,cached);')
 .replace('rollerImpactDepthScale(projectile, normal, height) {','rollerImpactDepthScale(projectile, normal, height, cached) {')
 .replace("(projectile?.fidelityPhase??0)===0,height);","(projectile?.fidelityPhase??0)===0,height,cached);")
 .replace('  const height=rollerImpactHeight(projectile,hit,scale);','  const cached=Math.hypot(hit.normal.x,hit.normal.y,hit.normal.z);\n  const height=rollerImpactHeight(projectile,hit,scale);')
 .replace('rollerImpactDepthScale(projectile,hit?.normal,height);','rollerImpactDepthScale(projectile,hit?.normal,height,cached);'));
 function run(api,mutate){const normal=new T.Vector3(0,1,0),point=new T.Vector3(2,0,0),p={type:'drop',fidelityPhase:0,fidelityRollerUnit:{UnitParam:{PaintParam:{WidthHalfNear:1,WidthHalfFar:1,DistanceNear:0,DistanceFar:10,DepthScaleMaxStraight:2.4,DepthScaleMinStraight:1.4,DegreeUseDepthScaleMax:0,DegreeUseDepthScaleMin:90}}},start:new T.Vector3(),vel:new T.Vector3(1,-.2,0)};let reads=0;Object.defineProperty(p,'fidelityImpactHeight',{get(){reads++;if(mutate)normal.set(1,1,0);return 1;}});const rows=[],game={paint:{splat(at,r,team,opts){rows.push([at.toArray(),r,opts.stretchAmt]);}}};api.withRollerImpactPaint(game,p,{point,normal},1,()=>game.paint.splat(point,9,0,{}));return {rows,reads};}
 assert.deepEqual(run(candidate,false),run(actual,false));assert.notDeepEqual(run(candidate,true).rows,run(actual,true).rows);assert.equal(run(actual,true).reads,2);
});
test('Brella borrowed-centre opt-in preserves exact releases and native copied drops while default callbacks own separate centres',async()=>{
 const old=(await module('added-family-paint',true)).collectBrellaSplashes,next=(await module('added-family-paint')).collectBrellaSplashes;
 function run(collect,optin,retain=false){let clones=0;class V extends T.Vector3{clone(){clones++;return new V(this.x,this.y,this.z);}}const volley={next:0,plan:{first:0,spacing:1,count:6,source:{SplashPaintWidthOneActive:.2,SplashPaintWidthFullActive:.6,SplashPaintDepthScaleOneActive:1,SplashPaintDepthScaleFullActive:2}},nodes:[]},owner={remote:false},game={projectiles:{}},rows=[],centres=[];volley.nodes=Array.from({length:3},()=>({volley,distance:0,ended:false,samples:new Map()}));
 for(let i=0;i<3;i++){const node=volley.nodes[i];collect(node,{prev:new V(i,4,0),age:.1},new V(i,4,7),false,(centre,radius,spec,salt,birth)=>{rows.push([centre.toArray(),radius,spec,salt,birth]);centres.push(centre);spawnSplashDrop(game,{owner,team:0,seed:.3,from:centre,radius,spec,salt});},optin);}
 const result={rows,drops:game.projectiles._s3SplashDrops.map(d=>[d.pos.toArray(),d.releaseX,d.releaseZ,d.spawnY,d.seed,d.vel.toArray()]),next:volley.next,samples:volley.nodes.map(n=>n.samples.size),clones,centres};if(optin)assert.equal(volley._centreDepth,0);return result;}
 const a=run(old,false),b=run(next,true),c=run(next,false);assert.deepEqual(b.rows,a.rows);assert.deepEqual(b.drops,a.drops);assert.deepEqual(c.rows,a.rows);assert.deepEqual(c.drops,a.drops);assert.equal(a.clones-b.clones,5);assert.equal(new Set(c.centres).size,6);assert.equal(new Set(b.centres).size,1);assert.notDeepEqual(b.centres.map(v=>v.toArray()),a.centres.map(v=>v.toArray()),'negative control: retaining borrowed refs is observably unsafe');
});
test('Brella leases isolate nested synchronous release and restore depth after an exception without consuming failed slot',async()=>{
 const collect=(await module('added-family-paint')).collectBrellaSplashes;
 const volley={next:0,plan:{first:0,spacing:1,count:2,source:{SplashPaintWidthOneActive:.2,SplashPaintWidthFullActive:.6,SplashPaintDepthScaleOneActive:1,SplashPaintDepthScaleFullActive:2}},nodes:[]};const node={volley,distance:0,ended:false,samples:new Map()};volley.nodes=[node];let nested=false,outer;
 assert.throws(()=>collect(node,{prev:new T.Vector3(0,1,0),age:0},new T.Vector3(0,1,3),false,centre=>{outer=centre;const copy=centre.clone();if(!nested){nested=true;collect(node,{prev:new T.Vector3(0,1,3),age:0},new T.Vector3(0,1,3),false,inner=>{assert.notEqual(inner,outer);throw Error('nested fail');},true);}assert.deepEqual(centre,copy);},true),/nested fail/);
 assert.equal(volley._centreDepth,0);assert.equal(volley.next,0);assert.ok(node.samples.has(0));
});
test('composed native Brella release borrows one centroid; replacement callbacks retain distinct values',async()=>{
 const {fixture}=await import('../../splatoon3/tests/source-fixture.mjs'),{makePaintWorld}=await import('../../splatoon3/tests/paint-authority-fixture.mjs');
 for(const custom of [false,true]){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
  const a=f.make('s3-shelter-normal');a.form='kid';a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,9.05,100);a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));
  a.weaponRunner.update(1/60,{fire:true,firePressed:true});for(let i=0;i<50;i++)a.weaponRunner.update(1/60,{fire:false});
  const rounds=f.G.projectiles.list.filter(p=>p.catalog),volley=rounds[0].catalog.brellaFlight.volley,retained=[],values=[];
  if(custom)for(const p of rounds)p.catalog.brellaSplashRelease=(centre)=>{retained.push(centre);values.push(centre.toArray());};
  let maxLiveDrops=0;for(let i=0;i<60;i++){f.G.projectiles.update(1/60);maxLiveDrops=Math.max(maxLiveDrops,f.G.projectiles._s3SplashDrops?.length||0);}
  assert.ok(volley.next>1,'actual flight releases multiple source thresholds');
  if(custom){assert.equal(volley._centres,undefined);assert.equal(new Set(retained).size,retained.length);assert.deepEqual(retained.map(v=>v.toArray()),values);}
  else {assert.equal(volley._centres.length,1);assert.equal(volley._centreDepth,0);assert.ok(maxLiveDrops>0);}
 }
});
