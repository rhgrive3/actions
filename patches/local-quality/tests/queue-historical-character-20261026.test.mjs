import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptHistoricalCharacter20261026} from '../queue-historical-character-20261026-adapter.mjs';
import {adaptRemainingVisualQueue20261027} from '../queue-remaining-visual-20261027-adapter.mjs';
import {adaptCombatGpuCpuPerfect} from '../combat-gpu-cpu-perfect-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const oracleBytes=fs.readFileSync(new URL('./fixtures/queue-historical-character-before-20261026.json',import.meta.url));
const oracle=JSON.parse(oracleBytes);
const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const baseline=(rel,source)=>oracle.modules[rel]?.source??adaptBuildSource(rel,source);
const candidate=(rel,source)=>adaptBuildSource(rel,source);
const pair=rel=>[baseline(rel,raw(rel)),candidate(rel,raw(rel))];
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const geometry=g=>Object.fromEntries([...Object.entries(g.attributes).map(([k,a])=>[k,bytes(a.array)]),['index',g.index?bytes(g.index.array):null]]);
function body(code){const edits=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>n.type==='ImportDeclaration'||n.type==='ExportAllDeclaration'?[[n.start,n.end]]:n.type==='ExportNamedDeclaration'?[[n.start,n.declaration?.start??n.end]]:[]);for(const[a,b]of edits.reverse())code=code.slice(0,a)+code.slice(b);return code;}
function leaf(code,names,G={},K={},math=Math){return new Function('THREE','G','K','CS','MC','PART','Math',body(code)+'\nreturn {'+names+'};')(THREE,G,K,{}, {}, {},math);}
const sha=s=>createHash('sha256').update(s).digest('hex');

test('shared limb tables preserve independent live hints, caller outputs and bounded coordinate invalidation',()=>{
 const kernels=pair('src/game/character-outfit.js').map((s,i)=>leaf(s,'limbPath'+(i?',historicalLimbTables':'')));
 const points=[new THREE.Vector3(0,.1,0),new THREE.Vector3(.1,.3,.1),new THREE.Vector3(.12,.6,.08),new THREE.Vector3(.15,.9,.02)];
 const hints=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)];
 const originals=hints.map(h=>kernels[0].limbPath(points,h));
 const native=THREE.CatmullRomCurve3.prototype.getPoint;let calls=0;
 THREE.CatmullRomCurve3.prototype.getPoint=function(...args){calls++;return native.apply(this,args);};
 let paths;
 try { paths=hints.map(h=>kernels[1].limbPath(points.map(p=>p.clone()),h));assert.equal(calls,601); }
 finally { THREE.CatmullRomCurve3.prototype.getPoint=native; }
 assert.notEqual(paths[0],paths[1]);assert.notEqual(paths[0].at,paths[1].at);
 const snap=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,v.toArray()]));
 for(const h of [0,1])for(const s of [-.1,0,.03,.21,.5,1,2]){assert.deepEqual(snap(paths[h].at(s)),snap(originals[h].at(s)));const out=paths[h].at(s);out.C.set(999,999,999);assert.deepEqual(snap(paths[h].at(s)),snap(originals[h].at(s)));}
 hints[0].set(1,.3,.4);hints[1].set(-.2,.1,1);
 for(let h=0;h<2;h++)assert.deepEqual(snap(paths[h].at(.4)),snap(originals[h].at(.4)));
 for(let i=0;i<9;i++){points[1].y+=.01;const a=kernels[0].limbPath(points,hints[0]),b=kernels[1].limbPath(points,hints[0]);assert.deepEqual(snap(b.at(.3)),snap(a.at(.3)));}
 assert.equal(kernels[1].historicalLimbTables.length,4);
});

test('owned strap blocks retain all near-boundary distances and exact tee displacement; unowned mutable polylines retain full distances',()=>{
 const K={TANK:{center:new THREE.Vector3(0,.848,-.176),tilt:-.1}},kernels=pair('src/game/character-outfit.js').map(s=>leaf(s,'distToPoly,strapPaths,teeFold',{},K));
 const paths=kernels.map(k=>k.strapPaths());assert.deepEqual(paths[1].map(x=>x.poly),paths[0].map(x=>x.poly));
 let comparisons=0;
 for(let j=0;j<paths[0].length;j++)for(let i=0;i<1200;i++){
  const base=paths[0][j].poly[i%paths[0][j].poly.length],edge=[-.030000001,-.03,-.029999999,0,.029999999,.03,.030000001][i%7];
  const p=base.clone();p[['x','y','z'][i%3]]+=edge;
  const a=kernels[0].distToPoly(p,paths[0][j].poly),b=kernels[1].distToPoly(p,paths[1][j].poly);
  assert.equal(b<=.03,a<=.03);if(a<=.03)assert.equal(b,a);comparisons++;
 }
 for(let i=0;i<600;i++){
  const p=new THREE.Vector3(Math.sin(i*.3)*.2,.65+(i%73)*.005,Math.cos(i*.3)*.2);
  assert.equal(kernels[1].teeFold(p,[.4,.55,.7,1][i%4],i%3),kernels[0].teeFold(p,[.4,.55,.7,1][i%4],i%3));
 }
 const poly=[new THREE.Vector3(),new THREE.Vector3(.1,.2,.3),new THREE.Vector3(.2,.5,.1)];
 for(let i=0;i<50;i++){poly[1].x+=.02;const p=new THREE.Vector3(i*.01,-i*.02,1);assert.equal(kernels[1].distToPoly(p,poly),kernels[0].distToPoly(p,poly));}
 console.log(JSON.stringify({scope:'owned strap cutoff and actual teeFold',boundaryComparisons:comparisons,teeComparisons:600}));
});

test('plate tilt slots keep exact scalar/nonfinite values and nonnumeric coercion order',()=>{
 const K={TANK:{center:new THREE.Vector3(0,.8,-.1),tilt:.2}},counts=[{sin:0,cos:0},{sin:0,cos:0}];
 const kernels=pair('src/game/character-outfit.js').map((s,i)=>{const math=Object.create(Math);for(const name of ['sin','cos'])math[name]=x=>{counts[i][name]++;return Math[name](x);};return leaf(s,'plateMask',{},K,math);});
 for(const tilt of [.2,.2,0,-0,.7,NaN,Infinity,-Infinity,undefined,null])for(const p of [new THREE.Vector3(.04,.8,-.1),new THREE.Vector3(.1,.9,-.07)]){K.TANK.tilt=tilt;assert.equal(kernels[1].plateMask(p),kernels[0].plateMask(p));}
 const changing=()=>{let n=0;return{valueOf(){return ++n*.01;}};};
 for(let j=0;j<5;j++){const v=kernels.map(k=>{K.TANK.tilt=changing();return k.plateMask(new THREE.Vector3(.04,.81,-.1));});assert.equal(v[1],v[0]);}
 K.TANK.tilt=.4;const p=new THREE.Vector3(.04,.81,-.1);kernels.forEach(k=>k.plateMask(p));counts.forEach(x=>{x.sin=0;x.cos=0;});
 for(let j=0;j<1000;j++)kernels.forEach(k=>k.plateMask(p));assert.deepEqual(counts,[{sin:1000,cos:1000},{sin:0,cos:0}]);
});

test('eyeball ring reuse observes cornea mutation between eyes and preserves accessor read order',()=>{
 for(const accessor of [false,true]){
  const outputs=pair('src/game/character-face.js').map(s=>{
   const k=leaf(s,'addEyeballs,EYEB',{settings:{quality:'high'}});let reads=0;
   if(accessor)Object.defineProperty(k.EYEB,'cornea',{get(){reads++;return .045+reads*1e-8;},configurable:true});
   const out=[];k.addEyeballs({add(g,o){out.push({geometry:geometry(g),ex:o.ex,sphere:Array.from({length:g.attributes.position.count},(_,i)=>o.v3(null,i))});g.dispose();if(!accessor)k.EYEB.cornea=.07;}},'hero');
   return{out,reads};
  });assert.deepEqual(outputs[1],outputs[0]);
 }
});

// Independently pin the later character weapon presentation extraction rather
// than discarding historical parity when the compositor adds reviewed changes.
const characterWeaponBefore="  _animWeapon(dt, s, w) {\n    let near = true;\n    if (this.inWorld && !this.isLocal && G.camera) near = G.camera.position.distanceToSquared(this.root.position) < 15 * 15;\n    // a far-tier kid holds the merged weapon, decimated like the body (a 4–6k-tri gun on a 60 px kid is all waste)\n    const farT = this.lod.tier === T_FAR && this.lod.to < 0;\n    if (farT) near = false;\n    for (let x = w; x; x = x.left) {\n      if (x.farDec === farT) continue;\n      x.farDec = farT;\n      x.bodyFar.geometry = farT ? farGeometry(x.def.body, 700) : x.def.body; x.inkFar.geometry = farT ? farGeometry(x.def.ink, 300) : x.def.ink;\n    }\n";
const characterWeaponAfter="  // Weapon contact poses also need this frame's representation before anchor\n  // application. Keep the native selection and far geometry preparation here.\n  _weaponPresentationNear(w) {\n    let near = true;\n    if (this.inWorld && !this.isLocal && G.camera) near = G.camera.position.distanceToSquared(this.root.position) < 15 * 15;\n    // a far-tier kid holds the merged weapon, decimated like the body (a 4–6k-tri gun on a 60 px kid is all waste)\n    const farT = this.lod.tier === T_FAR && this.lod.to < 0;\n    if (farT) near = false;\n    for (let x = w; x; x = x.left) {\n      if (x.farDec === farT) continue;\n      x.farDec = farT;\n      x.bodyFar.geometry = farT ? farGeometry(x.def.body, 700) : x.def.body; x.inkFar.geometry = farT ? farGeometry(x.def.ink, 300) : x.def.ink;\n    }\n    return near;\n  }\n\n  _animWeapon(dt, s, w) {\n    const near = this._weaponPresentationNear(w);\n";
test('historical character source retains independently pinned input and both later owner anchors (text only)',()=>{
 assert.equal(sha(oracleBytes),'8a9fb6e48fb8078e73e6a8a0a7156ac97792378390409dba063113abaceddf77','frozen fixture bytes');
 for(const[rel,entry]of Object.entries(oracle.modules)){
  assert.equal(sha(entry.source),entry.sha256,rel);const next=candidate(rel,raw(rel));parse(next,{ecmaVersion:'latest',sourceType:'module'});
  if(rel==='src/game/character-outfit.js'){
   assert.equal(next,raw(rel),'current direct outfit source remains authoritative');assert.equal(adaptHistoricalCharacter20261026(rel,next),next);
  }else{
   const historical=adaptHistoricalCharacter20261026(rel,entry.source);
   let expected=historical;
   if(rel==='src/game/character.js'){
    // Exact two-anchor movement owned by the later weapon-presentation pass;
    // do not execute Character or rewrite the frozen 5ca fixture.
    expected=replaceOnce(expected,'  _animWeapon(dt, s, w) {',"  // Weapon contact poses also need this frame's representation before anchor\n  // application. Keep the native selection and far geometry preparation here.\n  _weaponPresentationNear(w) {",'presentation owner start');
    expected=replaceOnce(expected,'    const st = this._wst;','    return near;\n  }\n\n  _animWeapon(dt, s, w) {\n    const near = this._weaponPresentationNear(w);\n    const st = this._wst;','presentation owner end');
    // Reject missing or duplicated owner anchors instead of silently adapting drift.
    for(const anchor of ['  _animWeapon(dt, s, w) {','    const st = this._wst;']){
     assert.throws(()=>replaceOnce(historical.replace(anchor,''),anchor,'','missing owner anchor'),/expected exactly one/);
     assert.throws(()=>replaceOnce(historical+anchor,anchor,'','duplicate owner anchor'),/expected exactly one/);
    }
   }
   expected=adaptCombatGpuCpuPerfect(rel,adaptRemainingVisualQueue20261027(rel,expected),replaceOnce);
   // Independently reconstruct the incoming side's complete extraction after
   // the GPU/CPU pass, and require the two owner-order paths to agree.
   let incoming=adaptCombatGpuCpuPerfect(rel,adaptRemainingVisualQueue20261027(rel,historical),replaceOnce);
   if(rel==='src/game/character.js'){
    assert.throws(()=>replaceOnce(incoming.replace(characterWeaponBefore,''),characterWeaponBefore,characterWeaponAfter,'missing full presentation owner'),/expected exactly one/);
    assert.throws(()=>replaceOnce(incoming+characterWeaponBefore,characterWeaponBefore,characterWeaponAfter,'duplicate full presentation owner'),/expected exactly one/);
    incoming=replaceOnce(incoming,characterWeaponBefore,characterWeaponAfter,'native weapon near/far presentation extraction');
   }
   assert.equal(expected,incoming,rel+' independent owner reconstructions agree');
   assert.equal(next,expected,rel+' exact owner composition');
   assert.throws(()=>adaptHistoricalCharacter20261026(rel,next),/anchor/);assert.throws(()=>adaptHistoricalCharacter20261026(rel,''),/anchor/);
  }
 }
 assert.equal(adaptHistoricalCharacter20261026('unrelated','same'),'same');
});
test('actual Three.js surfaces, tube attributes and suction geometry preserve exact bytes with half as many arc mappings',()=>{
 const kernels=pair('src/game/character-hair.js').map(s=>leaf(s,'TentacleSurface,tentacleTube,suctionCups'));
 const points=[[[0,0,0],[0,.3,0],[0,.7,0],[0,1,0]],[[0,0,0],[.05,.2,.03],[.1,.5,-.02],[-.03,.8,.07]],[[0,0,0],[0,0,0],[0,0,0],[0,0,0]]];
 let cases=0;
 for(const pts of points)for(const N of [1,3,48,240])for(const section of [false,true]){
  const count=[0,0],surfaces=kernels.map((k,i)=>{const native=THREE.CatmullRomCurve3.prototype.getUtoTmapping;THREE.CatmullRomCurve3.prototype.getUtoTmapping=function(...a){count[i]++;return native.apply(this,a);};try{return new k.TentacleSurface(pts,{samples:N,radius:t=>.09*(1-t*.8),flat:t=>.6+t*.2,twist:t=>t*.7,section:section?(c,s,t)=>[c*(1+t*.1),s*.8]:undefined});}finally{THREE.CatmullRomCurve3.prototype.getUtoTmapping=native;}});
  assert.deepEqual(count,[2*(N+1),N+1]);
  for(const key of ['P','T','O','B'])assert.deepEqual(surfaces[1][key],surfaces[0][key]);
  for(const radial of [6,11])for(const capStart of [false,true]){
   const tubes=kernels.map((k,i)=>k.tentacleTube(surfaces[i],{radial,rings:12,capStart,tipSteps:3}));assert.deepEqual(geometry(tubes[1].geo),geometry(tubes[0].geo));for(const key of ['t','cs','sn','thick'])assert.deepEqual(tubes[1][key],tubes[0][key]);tubes.forEach(t=>t.geo.dispose());
  }
  if(pts!==points[2]){const cups=kernels.map((k,i)=>k.suctionCups(surfaces[i],{radial:6,prof:'lo',rows:[{th:.3,phase:0}],from:.2,to:.7,size:()=>.016}));assert.deepEqual(geometry(cups[1].geo),geometry(cups[0].geo));cups.forEach(c=>c.geo.dispose());}cases++;
 }
 console.log(JSON.stringify({scope:'real Three.js construction; no GPU/device speed claim',surfaceVariants:cases}));
});
test('all 12 actual face LOD/quality variants and both eyeballs remain byte exact',()=>{
 const G={settings:{quality:'high'}},kernels=pair('src/game/character-face.js').map(s=>leaf(s,'buildFaceSkin,addEyeballs',G));let verts=0;
 for(const quality of ['low','medium','high','ultra'])for(const lod of ['hero','game','far']){
  G.settings.quality=quality;const faces=kernels.map(k=>k.buildFaceSkin(lod));assert.deepEqual(geometry(faces[1].geo),geometry(faces[0].geo));assert.deepEqual(bytes(faces[1].ao),bytes(faces[0].ao));
  for(const key of ['w','sub','hd','part','uv','lid','mw'])assert.deepEqual(faces[1].acc[key],faces[0].acc[key],key);
  const eyes=kernels.map(k=>{const out=[];k.addEyeballs({add(g,o){out.push({geometry:geometry(g),ex:o.ex,sphere:Array.from({length:g.attributes.position.count},(_,i)=>o.v3(null,i))});g.dispose();}},lod);return out;});assert.deepEqual(eyes[1],eyes[0]);verts+=faces[0].geo.attributes.position.count;faces.forEach(f=>f.geo.dispose());
 }
 console.log(JSON.stringify({scope:'real face/eye geometry and AO',variants:12,faceVertices:verts}));
});
test('real source-loaded actor poses, all mesh attributes and RNG match at 30/60/120 Hz',async()=>{
 const calls=[0,0],apis=await Promise.all([baseline,candidate].map((transform,i)=>sourceLoadedActorFixture({sourceOnly:true,transform,random:()=>{calls[i]++;return .4;}})));
 const snapshot=ch=>{ch.root.updateMatrixWorld(true);ch.skeleton.update();return structuredClone({bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),spring:Array.from(ch.sp),hair:Array.from(ch.sourceMotion.rootHair.state),phase:ch.phase,stance:Array.from(ch.stance),skeleton:Array.from(ch.skeleton.boneMatrices),muzzle:ch.getMuzzle(new THREE.Vector3()).toArray()});};
 let checks=0;try{for(const hz of [30,60,120]){const actors=await Promise.all(apis.map(a=>a.make())),chars=actors.map(a=>a.character);chars.forEach(ch=>{ch.onEvent=null;ch.setLod('hero');});for(const weapon of ['shooter','roller','slosher','charger'])for(let frame=0;frame<24;frame++){
  const dt=frame===3?0:frame===9?.1:1/hz;chars.forEach((ch,i)=>{if(frame===0)ch.setWeapon(weapon);apis[i].G.time+=dt;ch.root.position.x+=dt*(frame%3);ch.root.position.z+=dt*3;ch.root.rotation.y+=dt*.4;if(frame===5)ch.trigger('jump');if(frame===15)ch.trigger('land');ch.update(dt,{form:'kid',grounded:frame<5||frame>=15,speed:3,localMove:{x:.2,z:1},ink:1,hp:1,firing:frame%4===0,aimPitch:.15,aimDist:10,vy:frame<10?2:-2});});assert.deepEqual(snapshot(chars[1]),snapshot(chars[0]),`${hz}/${weapon}/${frame}`);checks++;
 }for(const tier of ['hero','game','far']){chars.forEach(ch=>ch.setLod(tier));const sets=chars.map(ch=>ch.lodSets.map(set=>set?.list.map(m=>({name:m.name,geometry:geometry(m.geometry)}))));assert.deepEqual(structuredClone(sets[1]),structuredClone(sets[0]));}apis.forEach(a=>a.reset());}assert.equal(calls[1],calls[0]);console.log(JSON.stringify({scope:'source-loaded actual Character; no browser/GPU/retail claim',poseComparisons:checks,randomCalls:calls}));}finally{apis.forEach(a=>a.reset());}
});
