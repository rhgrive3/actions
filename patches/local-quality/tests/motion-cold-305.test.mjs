import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const composed=rel=>adaptBuildSource(rel,read(rel));
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
function method(s,name,indent=' '){const a=s.indexOf(indent+name+'('),b=s.indexOf('\n'+indent+'}',a);assert.ok(a>=0&&b>a,name);return s.slice(a,b+indent.length+2).trim();}
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const geometry=g=>Object.fromEntries([...Object.entries(g.attributes).map(([k,a])=>[k,[a.constructor.name,a.itemSize,a.normalized,a.array.constructor.name,bytes(a.array)]]),['index',[g.index.array.constructor.name,bytes(g.index.array)]]]);

test('Builder streams exact final component types, lazy face/vector defaults, callbacks and repeat builds',()=>{
 const source=composed('src/game/character-geo.js'),a=source.indexOf('class BuilderAttribute {'),b=source.indexOf('\n}\n',source.indexOf('class Builder {'))+2;
 const old=fs.readFileSync(new URL('./fixtures/character-builder-before-queue.mjs.txt',import.meta.url),'utf8');
 const compile=code=>new Function('THREE','V3','BONE_INDEX','_c',code+'\nreturn Builder;')(THREE,THREE.Vector3,{hips:0,a:1,b:2,c:3,d:4,e:5},new THREE.Color()),kernels=[compile(old),compile(source.slice(a,b))];
 const buildInput=n=>{const g=new THREE.BufferGeometry(),p=new Float32Array(n*3),norm=new Float32Array(n*3),uv=new Float32Array(n*2);for(let i=0;i<n;i++){p[i*3]=i*.000001;p[i*3+1]=i%7*.03;p[i*3+2]=-0;norm[i*3+1]=1;uv[i*2]=i*.001;}g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(norm,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;};
 for(const n of [0,1,4095,4096,65535,65536]){
  const states=kernels.map(K=>new K()),calls=[[],[]],input=buildInput(n),late=buildInput(3);
  states.forEach((B,k)=>{
   B.add(input,{uv:true,bone:'hips',readTransform(p,n,i){calls[k].push('read'+i);p.x+=.0000000123456789;},color(p,i){calls[k].push('color'+i);return new THREE.Color(.2,.4,.6);},ex(p,i){calls[k].push('ex'+i);return .125;}});
   assert.equal(k===1?B.fc:null,null,'no face staging before first face callback');assert.equal(k===1?B.v3:null,null,'no vector staging before first vector callback');
   B.add(late,{weights(p,i){calls[k].push('weights'+i);return[['a',.4],['b',.4],['c',.1],['d',.05],['e',.05]];},v3(p,i){calls[k].push('v3'+i);return[p.x*3,1/3,-0];},face(p,i){calls[k].push('face'+i);return[.1,.2,.3,1];}});
  });
  assert.deepEqual(calls[1],calls[0]);
  for(const v3Name of [null,'aHead']){const out=states.map(B=>B.build('aEx',v3Name));assert.deepEqual(geometry(out[1]),geometry(out[0]),'Builder '+n+'/'+v3Name);out.forEach(g=>g.attributes.position.array.fill(9));const again=states.map(B=>B.build('aEx',v3Name));assert.deepEqual(geometry(again[1]),geometry(again[0]),'independent repeat build');out.forEach(g=>g.dispose());again.forEach(g=>g.dispose());}
  states.forEach(B=>B.add(late,{bone:'hips'}));const out=states.map(B=>B.build());assert.deepEqual(geometry(out[1]),geometry(out[0]),'add after build');out.forEach(g=>g.dispose());
 }
 const input=buildInput(30000),times=[[],[]];for(const k of [0,1,1,0,0,1,1,0]){const start=performance.now(),B=new kernels[k]();B.add(input,{bone:'hips'});B.build().dispose();times[k].push(performance.now()-start);}
 console.log(JSON.stringify({scope:'actual Builder kernel, isolated Node timings; no device peak heap/FPS',verticesPerWindow:30000,timesMs:times}));
});

test('rest transfer retains exact Float64/flags and irregular-shape failure state',()=>{
 const source=read('src/game/motion/source-bank.js'),next=method(source,'rest','  '),old=`rest(){for(let i=0;i<this.bank.bones.length;i++){const b=this.bank.bones[i];this.raw.set([...b.scale,...b.translation,...b.rotation],i*10);this.flags[i]=b.flags;}return this.fromRaw('eulerXYZ');}`;
 const run=(code,bones)=>{const state={bank:{bones},raw:new Float64Array(bones.length*10),flags:new Uint32Array(bones.length),fromRaw(){return this;}},fn=new Function('STRIDE','return function '+code)(10);let error;try{fn.call(state);}catch(e){error=e.constructor.name;}return{raw:state.raw,flags:state.flags,error};};
 for(let n=0;n<100;n++){const bones=Array.from({length:4},(_,i)=>({scale:[1,-0,n*.1],translation:[NaN,Infinity,-Infinity],rotation:[i*.03,-.4,0,1],flags:i}));assert.deepEqual(run(next,bones),run(old,bones));}
 for(let length=0;length<8;length++){const b={scale:[1,1,1],translation:[0,0,0],rotation:Array.from({length},(_,i)=>i*.1),flags:7};assert.deepEqual(run(next,[b]),run(old,[b]));}
});

test('HairTargets owns only hair quaternions and retains independent blend outputs',()=>{
 const next=composed('src/game/motion/hair-targets.js'),old=next.replace('this.q=new Array(bank.bones.length);for(const i of this.indices)this.q[i]=new THREE.Quaternion();','this.q=bank.bones.map(()=>new THREE.Quaternion());');
 const make=code=>new Function('THREE','clamp',code.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn HairTargets;')(THREE,clamp),classes=[make(old),make(next)];
 const bones=[{name:'root',parent:-1},{name:'head',parent:0},{name:'Hair1_L',parent:1},{name:'Hair2_L',parent:2},{name:'Hair1_R',parent:1},{name:'Hair2_R',parent:4},{name:'toe',parent:0}],index=Object.fromEntries(bones.map((b,i)=>[b.name,i])),bank={bones,index,rest:{wp:bones.map((_,i)=>new THREE.Vector3(i*.1,i*.2,0)),wq:bones.map(()=>new THREE.Quaternion())}};
 const objects=classes.map(K=>new K(bank)),pose={wp:bank.rest.wp.map(p=>p.clone().add(new THREE.Vector3(.01,0,.02))),wq:bank.rest.wq.map(q=>q.clone())},profile={hairMean:bones.map(()=>new THREE.Vector3(0,1,0))};
 objects.forEach(o=>o.add(pose,profile,.4).add(pose,profile,.6));assert.deepEqual(objects[1].indices.map(i=>objects[1].q[i].toArray()),objects[0].indices.map(i=>objects[0].q[i].toArray()));
 assert.equal(objects[1].q.filter(Boolean).length,4);assert.equal(objects[0].q.filter(Boolean).length,7);assert.equal(objects[1].q.length,7);
 const another=new classes[1](bank);assert.notEqual(another.q[2],objects[1].q[2]);another.copy(objects[1]);assert.deepEqual(another.q[2].toArray(),objects[1].q[2].toArray());
});

test('constructor hair lengths retain accessory order/gains while resolving each side once',()=>{
 const s=read('src/game/motion/retarget.js'),a=s.indexOf('  const head=ix.head;'),b=s.indexOf('  this.groundInverse=',a),next=s.slice(a,b),old=next.replace('  const hairSourceLengths=new Map();\n','').replace('let sourceLength=hairSourceLengths.get(side);if(sourceLength===undefined){sourceLength=0;','let sourceLength=0;').replace('hairSourceLengths.set(side,sourceLength);}','');
 function run(code,missing){let distances=0;const ix={head:0,Hair1:1},wp=[new THREE.Vector3()];for(const side of ['L','R'])for(let i=1;i<=4;i++){if(side+i===missing)continue;ix['Hair'+i+'_'+side]=wp.length;const p=new THREE.Vector3(i*.04,side==='L'?i*.1:-i*.1,i*.01),base=p.distanceTo;p.distanceTo=function(q){distances++;return base.call(this,q);};wp.push(p);}
  const character={hairMeta:Array.from({length:6},(_,i)=>({len:.2+i*.04,K:.5+i*.1})),rest:Object.fromEntries(Array.from({length:6},(_,i)=>['hair'+i+'_0',new THREE.Vector3(i%2?-.1:.1,0,0)]))},out=[],obj={scale:1.2,addAccessory(...a){out.push(a);}};
  new Function('character','ix','R','clamp',code).call(obj,character,ix,{wp},clamp);return{out,distances};}
 for(const missing of [null,'L1','L2','R3']){const a=run(old,missing),b=run(next,missing);assert.deepEqual(b.out,a.out);assert.ok(b.distances<=6);assert.ok(b.distances<a.distances);}
});

test('actual CCD joint loop retains real bone rotations, clearance and visitation order',()=>{
 const next=method(composed('src/game/motion/retarget.js'),'liftFreeFoot'),old=next.replace('   for(let pass=0;pass<2;pass++){\n    const joint=pass===0?f.limb.lo:f.limb.up;','   for(const joint of [f.limb.lo,f.limb.up]){');
 const run=(code,clearance,angle)=>{const kid=new THREE.Group(),up=new THREE.Bone(),lo=new THREE.Bone(),end=new THREE.Bone();kid.add(up);up.add(lo);lo.add(end);up.position.set(.1,.9,0);lo.position.set(0,-.4,.04);end.position.set(0,-.4,.02);up.rotation.z=angle;kid.updateWorldMatrix(true,true);const trace=[];for(const [name,b]of [['lo',lo],['up',up]]){const base=b.getWorldPosition;b.getWorldPosition=function(out){trace.push(name);return base.call(this,out);};}
  const state={character:{kid,_ground(x,z,n){n.set(0,1,0);return 0;}},_kidQuat(b,q){return b.getWorldQuaternion(q);}};for(const key of ['ccdTarget','ccdA','ccdB','ccdC'])state[key]=new THREE.Vector3();for(const key of ['ccdWorld','ccdLocal','ccdParent'])state[key]=new THREE.Quaternion();const f={limb:{up,lo,end},endQ:end.getWorldQuaternion(new THREE.Quaternion()),offset:new THREE.Vector3(0,-.03,0)};
  new Function('clamp','return function '+code)(clamp).call(state,f,clearance);return{trace,bones:[up,lo,end].map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.matrixWorld.elements])};};
 for(const clearance of [.1,-.002,-.003,-.04,-.3])for(const angle of [0,.2,-.7])assert.deepEqual(run(next,clearance,angle),run(old,clearance,angle));
});

test('paired Hermite basis retains separate-foot arithmetic and malformed-path fallback',()=>{
 const code=read('src/game/motion/run-foot-path.js'),functions=new Function('THREE','mod',code.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn {sampleRunFoot,prepareRunFootBasis};')(THREE,(x,n)=>((x%n)+n)%n);
 for(const n of [1,2,8,17,100])for(const phase of [0,-0,-1,1,1/3,1-1e-14,12.3]){const paths=[0,1].map(side=>Array.from({length:n},(_,i)=>new THREE.Vector3(Math.sin(i*.3+side),Math.cos(i*.2),i*.01))),profile={runFootPaths:paths},basis={};assert.equal(functions.prepareRunFootBasis(profile,phase,basis),true);for(const side of [0,1]){const a=new THREE.Vector3(),b=new THREE.Vector3();functions.sampleRunFoot(profile,side,phase,a);functions.sampleRunFoot(profile,side,phase,b,basis);assert.deepEqual(b.toArray(),a.toArray());}}
 for(const profile of [null,{}, {runFootPaths:[[],[]]},{runFootPaths:[[new THREE.Vector3()],[]]},{runFootPaths:[null,[new THREE.Vector3()]]}])assert.equal(functions.prepareRunFootBasis(profile,0,{}),false);
});

test('aim memoization detects external edits, signed zero, reset and nonfinite angles',()=>{
 const s=read('src/game/actor.js'),a=s.indexOf('    const dir=this.aimDir,yaw='),b=s.indexOf('\n\n    // ---- super jump',a),next=s.slice(a,b),old='const cp=Math.cos(this.aimPitch);this.aimDir.set(Math.sin(this.aimYaw)*cp,Math.sin(this.aimPitch),Math.cos(this.aimYaw)*cp);';
 const build=code=>{let count=0;const math=Object.create(Math);for(const name of ['sin','cos'])math[name]=x=>{count++;return Math[name](x);};return{run:new Function('Math','return function(){'+code+'}')(math),get count(){return count;}};};
 const pair=[build(old),build(next)],actors=pair.map(()=>({aimDir:new THREE.Vector3(),aimYaw:0,aimPitch:0}));
 for(let i=0;i<1000;i++){actors.forEach(actor=>{actor.aimYaw=i<500?0:i<700?-0:i===990?NaN:.2;actor.aimPitch=i===991?Infinity:.1;if(i===800)actor.aimDir.x=77;if(i===900)actor.aimDir=new THREE.Vector3();});pair.forEach((k,i)=>k.run.call(actors[i]));assert.deepEqual(actors[1].aimDir.toArray(),actors[0].aimDir.toArray());}
 assert.equal(pair[0].count,4000);assert.ok(pair[1].count<100);console.log(JSON.stringify({aimTrigBefore:pair[0].count,aimTrigAfter:pair[1].count}));
});
