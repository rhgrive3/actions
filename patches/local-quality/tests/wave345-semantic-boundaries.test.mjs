import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptCombatWave345} from '../combat-gpu-cpu-perfect-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';

if(!vm.SourceTextModule){
 test('Wave 3–5 native source semantic boundaries',()=>execFileSync(process.execPath,
  ['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{stdio:'pipe'}));
}else{
 if(process.env.INKWAVE_BUILT_SITE)throw Error('Wave source counterfactual must not substitute for an emitted artifact');
 const composerURL=new URL('../../../scripts/inkwave-source-composition.mjs',import.meta.url);
 const context=vm.createContext({console}),imports=new Map();
 const composer=new vm.SourceTextModule(fs.readFileSync(composerURL,'utf8'),{context,identifier:fileURLToPath(composerURL)});
 await composer.link(async spec=>{
  if(imports.has(spec))return imports.get(spec);
  const actual=await import(new URL(spec,composerURL)),names=Object.keys(actual);
  const imported=new vm.SyntheticModule(names,function(){for(const name of names)
   this.setExport(name,name==='adaptCombatWave345'?(_rel,code)=>code:actual[name]);},{context});
  imports.set(spec,imported);return imported;
 });await composer.evaluate();
 const pairs=new Map();
 const incoming=new Function(fs.readFileSync(new URL('./fixtures/wave345-incoming-db7.mjs.txt',import.meta.url),'utf8'))();
 function pair(rel){
  if(pairs.has(rel))return pairs.get(rel);
  const raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
  const before=composer.namespace.adaptBuildSource(rel,raw),after=adaptBuildSource(rel,raw);
  assert.equal(adaptCombatWave345(rel,before,replaceOnce),after,'only the final Wave pass differs: '+rel);
  const result={before,after};pairs.set(rel,result);return result;
 }
 function nodes(source,predicate){
  const found=[];function visit(n){if(!n||typeof n!=='object')return;if(predicate(n))found.push(n);
   for(const value of Object.values(n))if(Array.isArray(value)){for(const item of value)visit(item);}else if(value&&typeof value==='object')visit(value);}
  visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));return found;
 }
 function method(source,name){const found=nodes(source,n=>n.type==='MethodDefinition'&&n.key.name===name);
  assert.equal(found.length,1,'one native method '+name);return source.slice(found[0].start,found[0].end);}
 function declarations(source,names){return names.map(name=>{
  const found=nodes(source,n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===name));
  assert.equal(found.length,1,'one native declaration '+name);return source.slice(found[0].start,found[0].end);
 }).join('\n');}
 function owner(source,name,globals=''){return new Function('THREE',globals+'\nreturn class {\n'+method(source,name)+'\n}')(THREE);}
 function eye(source,connected,{invalid=false,empty=false,morph=false,custom=false}={}){
  const C=owner(source,'deformEyes'),o=new C(),geometry=new THREE.BufferGeometry();
  const base=new Float32Array(empty?[]:[-1,0,0,0,1,0,1,0,0]);if(invalid)base[0]=NaN;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(base.slice(),3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(empty?[]:[0,0,1,0,0,1,0,0,1],3));
  if(morph)geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(base.map(v=>v*2+3),3)];
  let computed=0;
  if(custom)geometry.computeBoundingSphere=function(){computed++;THREE.BufferGeometry.prototype.computeBoundingSphere.call(this);this.boundingSphere.radius+=.125;};
  Object.assign(o,{eyeGeometry:geometry,eyeBase:base,eyeNormals:geometry.attributes.normal.array.slice(),
   eyeData:connected?{headIds:[0,1,2],headSegments:[0,1,1],headWeights:[.2,.3,.7]}:{},
   matrices:Array.from({length:3},(_,i)=>new THREE.Matrix4().compose(new THREE.Vector3(i*.1,.2,-.1),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,i*.1,-.3)),new THREE.Vector3(1+i*.1,.9,1.1))),
   eyeHeadNormals:Array.from({length:3},()=>new THREE.Matrix3()),eyeDeform:[new THREE.Matrix4(),new THREE.Matrix4()],
   index:{Sqd_eye_L:0,Sqd_eye_R:1},v:new THREE.Vector3(),n:new THREE.Vector3(),eyeV2:new THREE.Vector3(),eyeN2:new THREE.Vector3()});
  const error=console.error;try{console.error=()=>{};o.deformEyes();}finally{console.error=error;}
  const sphere=geometry.boundingSphere,result={position:Array.from(geometry.attributes.position.array),normal:Array.from(geometry.attributes.normal.array),
   center:sphere.center.toArray(),radius:sphere.radius,computed};geometry.dispose();return result;
 }
 test('actual final pass retains native finite and invalid eye positions, normals and bounds',()=>{
  const p=pair('src/game/motion/squid-rig.js');assert.notEqual(p.after,p.before);
  for(const connected of [false,true])for(const invalid of [false,true]){
   const before=eye(p.before,connected,{invalid}),after=eye(p.after,connected,{invalid});
   if(invalid)assert.ok(Number.isNaN(before.radius),'native Three bounds expose the invalid geometry');
   assert.deepEqual(after,before,JSON.stringify({connected,invalid}));
   const old=eye(incoming('src/game/motion/squid-rig.js',p.before,replaceOnce),connected,{invalid});
   if(invalid)assert.notDeepEqual(old,before,'incoming scalar bounds concealed a native invalid vertex');
   else assert.deepEqual(old,before,'finite native deformation remains an independent positive');
  }
 });
 test('native empty eye geometry and optional bounds owners keep their existing behavior',()=>{
  const p=pair('src/game/motion/squid-rig.js');
  for(const options of [{empty:true},{morph:true},{custom:true}]){
   const before=eye(p.before,false,options),after=eye(p.after,false,options);assert.deepEqual(after,before,JSON.stringify(options));
   if(options.empty){assert.deepEqual(before.center,[0,0,0]);assert.equal(before.radius,0);}
   if(options.custom)assert.equal(before.computed,1);
  }
 });
 function growth(source){
  const C=owner(source,'_emitGrowth',declarations(source,['REACH','DRIP_REACH'])),o=new C(),face={wall:false};
  const g={entries:[face,0,0,0,0,0,0,face,1,1,0,0,0,0],R:2,kind:0,team:0,seed:1,netOrderId:0};
  const output=[],orders=[];
  o._paintOrderRuns=(_f,id,u0,u1,v0,v1)=>{orders.push(id);o._paintOrderRunScratch=[u0,u1,v0,v1];return 1;};
  o._pushQuad=(...args)=>{output.push([args[9],args[10]]);if(output.length===1){g.team=1;g.seed=9;g.netOrderId=42;}};
  o._emitGrowth(g,0,1,false);return{output,orders};
 }
 test('native growth emission observes owner/team changes at each actual draw callback boundary',()=>{
  const p=pair('src/world/paint.js'),before=growth(p.before);assert.deepEqual(before,{output:[[0,1],[1,9]],orders:[42]});
  assert.deepEqual(growth(p.after),before);
  assert.notDeepEqual(growth(incoming('src/world/paint.js',p.before,replaceOnce)),before,'incoming hoist misses the next native draw state');
 });
 function locomotion(source,profile=(_bank,name)=>({axis:[1,0,0],stride:name==='ClipB'?4:2})){
  const body=method(source,'advance'),start=body.indexOf('  const list=this._locoList'),end=body.indexOf('\n',body.indexOf('  let nominalCadence='));
  assert.ok(start>=0&&end>start,'actual native locomotion construction and cadence block');
  return new Function('locomotionProfile','HOST_MOTION','return function(walkClips,runClips,run){let stride=0;'+body.slice(start,end)+';return {stride,nominalCadence};}')(
   profile,{fps:60});
 }
 function clipRun(source,change){
  const run=locomotion(source),item={name:'ClipA'},clips=Array.from({length:2},()=>Array.from({length:4},()=>item));
  const bank={clips:new Map([['ClipA',{frames:2}],['ClipB',{frames:8}]])},o={bank,direction:[1,0,0,0],shootBlend:0,
   retarget:{lateralScale:1,scale:1},walk:{stride:2},run:{stride:2}};
  run.call(o,clips,clips,0);change(bank,item);return run.call(o,clips,clips,0);
 }
 test('native locomotion observes replacement clips and renamed direction records after a warm frame',()=>{
  const p=pair('src/game/motion/source-controller.js');
  for(const change of [(bank)=>bank.clips.set('ClipA',{frames:4}),(_bank,item)=>{item.name='ClipB';}]){
   assert.deepEqual(clipRun(p.after,change),clipRun(p.before,change));
   assert.notDeepEqual(clipRun(incoming('src/game/motion/source-controller.js',p.before,replaceOnce),change),clipRun(p.before,change));
  }
 });
 test('native locomotion cannot retain a clip deleted from the accepted bank Map',()=>{
  const p=pair('src/game/motion/source-controller.js'),remove=bank=>bank.clips.delete('ClipA');
  assert.throws(()=>clipRun(p.before,remove),TypeError);assert.throws(()=>clipRun(p.after,remove),TypeError);
  assert.doesNotThrow(()=>clipRun(incoming('src/game/motion/source-controller.js',p.before,replaceOnce),remove),'incoming cache retained a deleted native clip');
 });
 test('an equivalent earlier locomotion owner cannot leave item.clip consumers without their producer',()=>{
  const p=pair('src/game/motion/source-controller.js');
  const changed=p.before.replace('entry.name=item.name;entry.weight=weight;entry.profile=p;list.push(entry);',
   'entry.name=(item.name);entry.weight=weight;entry.profile=p;list.push(entry);');
  assert.notEqual(changed,p.before,'unique real native producer anchor');
  const after=adaptCombatWave345('src/game/motion/source-controller.js',changed,replaceOnce);
  assert.deepEqual(clipRun(after,()=>{}),clipRun(changed,()=>{}),'no partial dependency rewrite');
  assert.throws(()=>clipRun(incoming('src/game/motion/source-controller.js',changed,replaceOnce),()=>{}),TypeError,'incoming partial cache has no clip producer');
 });
 test('profile failure cannot publish a cache hit before its actual native retry succeeds',()=>{
  const p=pair('src/game/motion/source-controller.js');
  const run=source=>{let calls=0;const invoke=locomotion(source,()=>{if(++calls===1)throw Error('profile retry');return{axis:[1,0,0],stride:2};});
   const item={name:'ClipA'},clips=Array.from({length:2},()=>Array.from({length:4},()=>item));
   const o={bank:{clips:new Map([['ClipA',{frames:2}]])},direction:[1,0,0,0],shootBlend:0,
    retarget:{lateralScale:1,scale:1},walk:{stride:2},run:{stride:2}};
   assert.throws(()=>invoke.call(o,clips,clips,0),/profile retry/);
   const result=invoke.call(o,clips,clips,0);assert.equal(calls,2);return result;};
  assert.deepEqual(run(p.after),run(p.before));
  assert.deepEqual(run(incoming('src/game/motion/source-controller.js',p.before,replaceOnce)),run(p.before),'incoming throw/retry already worked and remains preserved');
 });
 test('level hash and OBB scalar arithmetic retain native boundary and nonfinite query results',()=>{
  const p=pair('src/world/level.js'),classes=[p.before,p.after].map(source=>new Function('THREE',
   'const _v2=new THREE.Vector3();return class{'+['_hxi','_hzi','pointInBlock'].map(name=>method(source,name)).join('\n')+'}')(THREE));
  const owners=classes.map(C=>Object.assign(new C(),{hw:17,hd:11,hx0:-4,hz0:2,hashCell:3}));
  for(const x of [-Infinity,-100,-4,-0,0,2,5,100,Infinity,NaN])for(const name of ['_hxi','_hzi'])
   assert.ok(Object.is(owners[0][name](x),owners[1][name](x)),name+':'+x);
  for(let i=0;i<100;i++){
   const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.01,i*.03,-i*.02));
   const b={center:new THREE.Vector3(.3,-.2,.8),half:new THREE.Vector3(1,2,3),
    axes:[new THREE.Vector3(1,0,0).applyQuaternion(q),new THREE.Vector3(0,1,0).applyQuaternion(q),new THREE.Vector3(0,0,1).applyQuaternion(q)]};
   for(const scale of [-1.001,-1,0,1,1.001,NaN]){const at=b.center.clone().addScaledVector(b.axes[0],scale);
    assert.equal(owners[1].pointInBlock(b,at),owners[0].pointInBlock(b,at));}
  }
 });
 test('a tilted top within the native support skin cannot be rejected by its unpadded AABB height',()=>{
  const p=pair('src/world/level.js'),s=Math.SQRT1_2,top=2*s;
  const tilted={solid:true,center:new THREE.Vector3(),half:new THREE.Vector3(1,1,1),
   axes:[new THREE.Vector3(s,s,0),new THREE.Vector3(-s,s,0),new THREE.Vector3(0,0,1)],aabbMax:new THREE.Vector3(top,top,1)};
  const flat={solid:true,center:new THREE.Vector3(0,top+.001-.1,0),half:new THREE.Vector3(10,.1,10),
   axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMax:new THREE.Vector3(10,top+.001,10)};
  const height=source=>{const C=new Function('THREE','const _v=new THREE.Vector3(),_v2=new THREE.Vector3();return class{'+
   ['groundHeight','pointInBlock'].map(name=>method(source,name)).join('\n')+'}')(THREE);
   return Object.assign(new C(),{blocks:[flat,tilted],queryBlocks:()=>[0,1]}).groundHeight(.002,0);};
  const expected=height(p.before);assert.ok(expected>top+.001,'native padded containment accepts the tilted support');
  assert.notEqual(height(incoming('src/world/level.js',p.before,replaceOnce)),expected,'incoming unpadded AABB guard missed that support');
  assert.equal(height(p.after),expected);
 });
 test('native OBB ray and closest-point outputs retain finite, grazing and invalid geometry semantics',()=>{
  const p=pair('src/game/physics.js'),classes=[p.before,p.after].map(source=>new Function('THREE',
   declarations(source,['_o'])+'\nreturn class{'+['raycast','closestOnBlock'].map(name=>method(source,name)).join('\n')+'}')(THREE));
  const b={id:0,solid:true,center:new THREE.Vector3(0,0,4),half:new THREE.Vector3(1,1,1),
   axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:Array(6).fill(-1),
   aabbMin:new THREE.Vector3(-1,-1,3),aabbMax:new THREE.Vector3(1,1,5)};
  const owners=classes.map(C=>Object.assign(new C(),{level:{blocks:[b],queryBlocks:()=>[0]},_ids:[]}));
  const cast=(o,origin,dir,max)=>{const h={point:new THREE.Vector3(),normal:new THREE.Vector3()};o.raycast(origin,dir,max,h);return h;};
  for(const x of [-1.00001,-1,-0,0,1,1.00001,NaN])for(const max of [0,2,3,4,8,Infinity,NaN]){
   const point=new THREE.Vector3(x,.2,0),direction=new THREE.Vector3(0,0,1);
   assert.deepEqual(cast(owners[1],point,direction,max),cast(owners[0],point,direction,max));
   const actual=owners[1].closestOnBlock(b,point,new THREE.Vector3()),expected=owners[0].closestOnBlock(b,point,new THREE.Vector3());
   assert.deepEqual(actual.toArray(),expected.toArray());
  }
 });
 test('native Character and retarget quaternion chains preserve arithmetic through genuine Three bones',()=>{
  const c=pair('src/game/character.js'),r=pair('src/game/motion/retarget.js');
  const character=[c.before,c.after].map(source=>new (owner(source,'_kidXform'))()),retarget=[r.before,r.after].map(source=>new (owner(source,'_kidQuat'))());
  for(let i=0;i<100;i++){
   const kid=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone();kid.add(a);a.add(b);
   a.position.set(i*.01,-.2,.3);b.position.set(.3,i*.02,-.1);
   a.quaternion.setFromEuler(new THREE.Euler(i*.01,.1,-.2));b.quaternion.setFromEuler(new THREE.Euler(.2,-i*.02,.4));
   const results=character.map(o=>{o.kid=kid;const pos=new THREE.Vector3(),q=new THREE.Quaternion();o._kidXform(b,pos,q);return[pos.toArray(),q.toArray()];});
   assert.deepEqual(results[1],results[0]);
   const rotations=retarget.map(o=>{o.character={kid};return o._kidQuat(b,new THREE.Quaternion()).toArray();});assert.deepEqual(rotations[1],rotations[0]);
  }
 });
}
