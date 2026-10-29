import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const evidence=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.env.INKWAVE_REVIEW_ROOT||fileURLToPath(new URL('../../../',import.meta.url)));
const staged=process.env.INKWAVE_REVIEW_STAGE||root;
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/late-combat-before-20261029.json',import.meta.url),'utf8'));
const beforeSource=rel=>frozen.sources[rel];
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const {transformSync}=createRequire(path.join(root,'package.json'))('esbuild');
const {Vector3}=await import(pathToFileURL(path.join(root,'inkwave-public/vendor/three/build/three.module.js')));
const cache=new Map();
async function moduleAt(file,before,minified=false){
 const key=[file,before,minified].join(':');if(cache.has(key))return cache.get(key);
 const rel='patches/splatoon3/runtime/'+file;
 let code=before?beforeSource(rel):fs.readFileSync(path.join(staged,rel),'utf8');
 code=adaptBuildSource(rel,code);
 if(file==='stringer-charge-hud.mjs'){
  const child=await moduleAt('catalog-charge-stages.mjs',before,minified);
  code=code.replace("'./catalog-charge-stages.mjs'",JSON.stringify(child.url));
 }
 code=code.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(_s,_q,spec)=>JSON.stringify(pathToFileURL(path.resolve(root,'patches/splatoon3/runtime',spec)).href));
 if(minified)code=transformSync(code,{format:'esm',minify:true}).code;
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');const result={api:await import(url),url};cache.set(key,result);return result;
}
function drop(api,seed,salt,random=true){const g={projectiles:{}},spec={gravity:100,randomVelocity:random?{x:1.1,y:.3,zMin:.2,zMax:.4}:null};return api.spawnSplashDrop(g,{owner:{remote:false},team:0,seed,salt,from:new Vector3(2,3,4),direction:new Vector3(.3,0,.4),radius:1,spec});}
const values=d=>[d.seed,...d.pos.toArray(),...d.vel.toArray(),d.dirX,d.dirZ,d.spawnY,d.releaseX,d.releaseZ,d.frames,d.carry];
for(const minified of [false,true]){
 test(`seed bases preserve public RNG and actual four-output spawn (${minified?'minified':'composed'})`,async()=>{
  const old=(await moduleAt('blaster-flight-paint.mjs',true,minified)).api,now=(await moduleAt('blaster-flight-paint.mjs',false,minified)).api;
  const seeds=[0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,-1,.314159265,2**32,2**-32];
  const salts=[0,-0,-1,1,255,2**32-1,2**32,Number.MAX_SAFE_INTEGER,NaN,Infinity];
  for(let i=0;i<1000;i++)seeds.push(Math.sin(i*1.2345)*1e5);
  for(const seed of seeds)for(const salt of salts){assert.ok(Object.is(now.seededSplashUnit(seed,salt),old.seededSplashUnit(seed,salt)));for(const random of [true,false])assert.deepEqual(values(drop(now,seed,salt,random)),values(drop(old,seed,salt,random)));}
  const floor=Math.floor,counts=[];try{for(const api of [old,now]){let n=0;Math.floor=x=>{n++;return floor(x);};drop(api,.3,2,true);counts.push(n);}}finally{Math.floor=floor;}assert.deepEqual(counts,[4,1]);
 });
 test(`Stringer public fresh output, optional output, invalid inputs and reentrant HUD (${minified?'minified':'composed'})`,async()=>{
  const old=(await moduleAt('catalog-charge-stages.mjs',true,minified)).api,now=(await moduleAt('catalog-charge-stages.mjs',false,minified)).api;
  const weapon=(first,full)=>({catalogRecord:{parameters:{spl__WeaponStringerParam:{ChargeParam:{ChargeFrameMidCharge:first,ChargeFrameFullCharge:full}}}}});
  const out={stage:99,progress:99,first:99};
  for(const [first,full]of [[12,34],[30,60],[1,2],[0,2],[2,2],[NaN,3],[3,Infinity]])for(const c of [-1,-0,0,1e-12,12/34,12/34-1e-11,.5,1,2,NaN,Infinity]){
   const w=weapon(first,full),expected=old.catalogChargeStage(w,c),before={...out},actual=now.catalogChargeStage(w,c,out);assert.deepEqual(actual,expected);if(expected){assert.equal(actual,out);assert.notEqual(now.catalogChargeStage(w,c),now.catalogChargeStage(w,c));}else assert.deepEqual(out,before);
  }
  const w=weapon(12,34),a=(await moduleAt('stringer-charge-hud.mjs',true,minified)).api,b=(await moduleAt('stringer-charge-hud.mjs',false,minified)).api;
  function hud(api,reenter){const classes=new Set(),log=[],track={},circle={style:{}};let nested=false;
   const h={_chargeC:100,_chargeEl:circle,ret:{dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,v){v?classes.add(x):classes.delete(x);}},querySelector(){if(reenter&&!nested){nested=true;api.updateStringerChargeHud(h,w,1);}return track;}},_restart(_e,x){log.push(x);}};return{h,snapshot:()=>({offset:circle.style.strokeDashoffset,stage:h.ret.dataset.chargeStage,classes:[...classes].sort(),log:[...log]})};}
  for(const reenter of [false,true]){const x=hud(a,reenter),y=hud(b,reenter);for(const hz of [30,60,120])for(let i=0;i<=hz;i++){a.updateStringerChargeHud(x.h,w,i/hz);b.updateStringerChargeHud(y.h,w,i/hz);assert.deepEqual(y.snapshot(),x.snapshot());}a.updateStringerChargeHud(x.h,{},0);b.updateStringerChargeHud(y.h,{},0);assert.deepEqual(y.snapshot(),x.snapshot());}
 });
}
test('no-release descriptor proposal has an observable Proxy counterexample and stays unapplied',async()=>{
 const api=(await moduleAt('blaster-flight-paint.mjs',true)).api;let probes=0;
 const game=new Proxy({paint:{},physics:{},projectiles:{}},{getOwnPropertyDescriptor(target,key){if(key==='projectiles')probes++;return Reflect.getOwnPropertyDescriptor(target,key);}});
 const state=api.ownDistanceFlightState({last:new Vector3(),distance:0,index:0,spec:{count:3,first:10,spacing:10},wallSplash:null});
 assert.equal(api.paintDistanceFlight(game,{owner:{remote:false}},state,new Vector3(1,0,0)),0);assert.equal(probes,1);assert.equal(state.distance,1);
 const text=fs.readFileSync(path.join(staged,'patches/splatoon3/runtime/blaster-flight-paint.mjs'),'utf8');assert.match(text,/Object.getOwnPropertyDescriptor\(game, 'projectiles'\)/);
});
test('catalogue impact specs are independently mutable; proposed sharing changes exposed behavior',async()=>{
 const api=(await moduleAt('catalog-blaster-paint.mjs',true)).api;
 const game={projectiles:{},paint:{splat:()=>0}},owner={remote:false,addTurf(){}};
 const p={owner,team:0,seed:.5,pos:new Vector3(0,3,0),vel:new Vector3(1,0,1),catalog:{descriptor:{m:{FreeGravity:.01},b:{BlasterBurstParam:{SplashPaintRadius:0,SplashDropOn:true,SplashDropPaintRadius:1,SplashDropInitSpeed:0}}},r:{parameters:{MoveParam:{FreeGravity:.01}}}}};
 api.paintCatalogBlasterBurst(game,p);api.paintCatalogBlasterBurst(game,p);const [a,b]=game.projectiles._s3SplashDrops;assert.notEqual(a.spec,b.spec);const gravity=b.spec.gravity;a.spec.gravity=123;assert.equal(b.spec.gravity,gravity);assert.equal(Object.isFrozen(a.spec),false);
 assert.equal(fs.readFileSync(path.join(staged,'patches/splatoon3/runtime/catalog-blaster-paint.mjs'),'utf8'),beforeSource('patches/splatoon3/runtime/catalog-blaster-paint.mjs'));
});
test('actual splash integration, ordered paint and pooled reuse stay exact at 30/60/120Hz',async()=>{
 const old=(await moduleAt('blaster-flight-paint.mjs',true)).api,now=(await moduleAt('blaster-flight-paint.mjs',false)).api;
 function simulate(api,hz){const paints=[],system={},owner={remote:false,turf:0,addTurf(n){this.turf+=n;}},game={projectiles:system,paint:{splat(p,r,t,o){paints.push([p.x,p.y,p.z,r,t,o.seed,o.kind,o.face,o.stretchAmt,...(o.stretch?.toArray()||[])]);return 1;}},physics:{segment(a,b,h){h.hit=b.y<=0;if(h.hit){const t=a.y/(a.y-b.y);h.point.copy(a).lerp(b,t);h.normal.set(0,1,0);h.face=0;}return h;}}};
  const spec={gravity:57.6,drag:.02,surfaceOnly:true,depthScaleMax:1.2,depthScaleMin:1,dropHeightMax:3,dropHeightMin:10,randomVelocity:{x:.3,y:.2,zMin:.6,zMax:1.2}};
  const traces=[];for(let volley=0;volley<2;volley++){for(let i=0;i<12;i++)api.spawnSplashDrop(game,{owner,team:i%2,seed:i/13,salt:i,from:new Vector3(i*.2,2+i*.1,0),direction:new Vector3(.3,0,.8),radius:.2,spec});
   for(let block=0;block<60;block++){for(let i=0;i<hz/30;i++)api.advanceSplashDrops(system,1/hz,game);traces.push({live:(system._s3SplashDrops||[]).map(values),landings:structuredClone(system._s3SplashLandings||[]),paints:structuredClone(paints),turf:owner.turf});}}
  assert.equal(paints.length,24);assert.equal(system._s3SplashDrops.length,0);assert.ok(system._s3SplashDropPool.length<=12);return traces;
 }
 for(const hz of [30,60,120])assert.deepEqual(simulate(now,hz),simulate(old,hz),hz+'Hz old/new equality at each 1/30s boundary');
});

test('frozen phase1 source oracles match recorded digests',()=>{for(const [rel,source]of Object.entries(frozen.sources))assert.equal(createHash('sha256').update(source).digest('hex'),frozen.sha256[rel]);});
