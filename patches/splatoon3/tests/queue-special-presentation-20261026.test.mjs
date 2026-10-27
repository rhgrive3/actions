import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { MUZZLE_SPLASH, INK_RING } from '../runtime/s3-sweps-assets.mjs';
import { S3_SHAPE } from '../runtime/s3-projectile-shapes.mjs';
import { createInkSheets } from '../runtime/s3-ink-sheets.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const read = rel => fs.readFileSync(new URL(rel,import.meta.url),'utf8');
const frozen = JSON.parse(read('./fixtures/queue-special-presentation-before-1878.json'));
function declaration(source,name) {
  let result;
  function visit(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name===name)result=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
  visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));assert.ok(result,name);return result;
}
function meshSnapshot(mesh) {
  return {count:mesh.count,visible:mesh.visible,matrix:[...mesh.instanceMatrix.array],color:mesh.instanceColor?[...mesh.instanceColor.array]:null,
    attrs:Object.fromEntries(Object.entries(mesh.geometry.attributes).filter(([k])=>k.startsWith('aSheet')||k==='aDrill').map(([k,v])=>[k,[...v.array]]))};
}
test('Wail updates a shared scene once, retaining exact instance matrices and separate-parent fallback',()=>{
  const source=read('../runtime/wail-speaker-batch.mjs');
  const make=old=>new Function(source.replace(declaration(source,'updateWailSpeakerBatch'),old?frozen.wailUpdate:declaration(source,'updateWailSpeakerBatch')).replace(/^export /gm,'')+';return {createWailSpeakerBatch,updateWailSpeakerBatch};')();
  function world(api){
    const scene=new T.Scene(),outer=new T.Group(),other=new T.Group();outer.add(scene);scene.add(other);
    outer.position.set(7,2,-3);outer.rotation.set(.2,.4,-.1);outer.scale.set(1.1,.8,1.2);
    let calls=0;const update=scene.updateWorldMatrix;scene.updateWorldMatrix=function(...args){calls++;return update.apply(this,args);};
    const material=new T.MeshStandardMaterial({color:0x123456}),geometry=new T.BoxGeometry(1,2,3);
    const devices=Array.from({length:6},(_,i)=>{const holder=new T.Group(),root=new T.Group();holder.add(root);scene.add(holder);holder.position.set(i,2,i/2);const mesh=new T.Mesh(geometry,material);root.add(mesh);return{holder,model:{root}};});
    const batch=api.createWailSpeakerBatch(T,scene,devices);
    return{scene,outer,other,devices,batch,reset(){calls=0;},get calls(){return calls;}};
  }
  const apis=[make(true),make(false)],worlds=apis.map(world);
  for(let frame=0;frame<60;frame++){
    for(let i=0;i<2;i++){
      const w=worlds[i];w.outer.rotation.y=frame*.03;w.scene.position.y=Math.sin(frame*.1);w.other.rotation.x=.3;
      if(frame===10)w.other.add(w.devices[2].holder);
      if(frame===20)w.scene.add(w.devices[2].holder);
      if(frame===30)w.batch.root.removeFromParent();
      if(frame===40)w.scene.add(w.batch.root);
      for(let j=0;j<6;j++){w.devices[j].holder.rotation.set(frame*.01,j*.02,frame*.005);w.devices[j].holder.visible=(frame+j)%5!==0;}
      w.reset();apis[i].updateWailSpeakerBatch(w.batch);
    }
    const [a,b]=worlds;
    for(let j=0;j<a.batch.parts.length;j++)assert.deepEqual(meshSnapshot(b.batch.parts[j].mesh),meshSnapshot(a.batch.parts[j].mesh));
    if(frame<10||frame>=20&&frame<30||frame>=40){assert.equal(a.calls,7);assert.equal(b.calls,1);}
    else if(frame>=10&&frame<20){assert.equal(a.calls,7);assert.equal(b.calls,2);}
    else {assert.equal(a.calls,6);assert.equal(b.calls,6);}
  }
});
test('Zipcaster refreshes only paired mesh branches, preserving coat transforms, skin bindings, visibility and reparent fallback',()=>{
  const next=declaration(read('../runtime/special-presentation.mjs'),'inkCoat');
  const compile=source=>new Function('THREE','inv','keep','colorOf',source+';return inkCoat;')(T,new T.Matrix4(),new T.Matrix4(),()=>new T.Color(0x123456));
  const apis=[compile(frozen.inkCoat),compile(next)];
  function rig(){
    const scene=new T.Scene(),kid=new T.Group(),nested=new T.Group(),bone=new T.Bone();scene.add(kid);kid.add(nested,bone);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(12),4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
    const skeleton=new T.Skeleton([bone]);const meshes=Array.from({length:5},(_,i)=>{const m=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial());m.name='kid:body-'+i;m.position.set(i*.1,i*.2,-i*.1);(i%2?nested:kid).add(m);m.bind(skeleton);return m;});
    const unused=new T.Group();kid.add(unused);let visits=0;for(let i=0;i<60;i++){const n=new T.Group();unused.add(n);const update=n.updateWorldMatrix;n.updateWorldMatrix=function(...args){visits++;return update.apply(this,args);};}
    return{scene,kid,nested,bone,meshes,ch:{kid,color:new T.Color(0x123456)},s:{},reset(){visits=0;},get visits(){return visits;}};
  }
  const states=[rig(),rig()];
  for(let i=0;i<2;i++)apis[i](states[i].ch,states[i].s,true);
  for(let frame=0;frame<90;frame++){
    for(let i=0;i<2;i++){
      const r=states[i];r.kid.rotation.set(frame*.005,frame*.02,-frame*.003);r.kid.scale.set(1.2,.8,1.1);r.nested.rotation.z=frame*.01;r.bone.rotation.x=.3;
      for(let j=0;j<5;j++){r.meshes[j].position.y=2+Math.sin(frame*.1+j);r.meshes[j].visible=(frame+j)%9!==0;}
      if(frame===30)r.scene.add(r.meshes[1]);if(frame===40)r.nested.add(r.meshes[1]);
      if(frame===50)r.scene.add(r.s.coatGroup);if(frame===60)r.kid.add(r.s.coatGroup);
      r.reset();apis[i](r.ch,r.s,frame%7!==0);
    }
    const [a,b]=states;
    const snapshot=r=>({visible:r.s.coatGroup.visible,pairs:r.s.coatPairs.map(([o,t])=>({visible:t.visible,position:t.position.toArray(),quaternion:t.quaternion.toArray(),scale:t.scale.toArray(),binding:t.skeleton===o.skeleton,bind:[...t.bindMatrix.elements]}))});
    assert.deepEqual(snapshot(b),snapshot(a),`frame ${frame}`);
    if(frame<30||frame>=40&&frame<50||frame>=60){assert.equal(a.visits,60);assert.equal(b.visits,0);}
    else assert.equal(b.visits,60);
    // The normal renderer update still refreshes all bones/children, after
    // which the entire original and optimized hierarchy has the same pose.
    for(const r of states){r.scene.updateMatrixWorld(true);r.s.coatPairs[0][0].skeleton.update();}
    assert.deepEqual(b.s.coatPairs.map(([,t])=>t.matrixWorld.elements),a.s.coatPairs.map(([,t])=>t.matrixWorld.elements));
  }
});
test('restored ink-sheet basis sharing and drill slots retain all Float32 matrices/attributes and release prior frame owners',()=>{
  const oldSource=frozen.inkSheets.replace(/^import .*;\n/m,'').replace(/^export /gm,'');
  const Old=new Function('MUZZLE_SPLASH','INK_RING',oldSource+';return createInkSheets;')(MUZZLE_SPLASH,INK_RING);
  const old=Old(T,new T.Scene(),{}),next=createInkSheets(T,new T.Scene(),{}),direction=new T.Vector3(),slots=[];
  const types=['shot','pellet','arrow','slash-v','slash-h'];
  for(let frame=0;frame<180;frame++){
    const time=frame/60;
    if(frame%3===0)for(let j=0;j<types.length;j++)for(const sheet of [old,next]){
      const b=sheet.add(types[j],new T.Vector3(j,1,-2),new T.Vector3(.2,.4,1),new T.Color(.2,.4,.6),frame*.13+j,time);
      b.horizontalSweep=j===2&&frame%2===0;
    }
    for(let j=0;j<20;j++){
      direction.set(Math.sin(frame+j),.1+j*.04,Math.cos(frame+j)).normalize();const at=new T.Vector3(j,2,3),color=new T.Color(.4,.2,.7);
      old.drill(at,direction.clone(),color,j*.1,time,.01+frame*.1);next.drill(at,direction,color,j*.1,time,.01+frame*.1);
      if(j<16){if(frame)assert.equal(next.drills[j],slots[j]);else slots[j]=next.drills[j];}
      direction.set(99,88,77);
    }
    const cam=frame%11===0?new T.Vector3(1000,0,0):null;
    assert.deepEqual(next.draw(time,cam),old.draw(time,cam));
    assert.deepEqual(meshSnapshot(next.mesh),meshSnapshot(old.mesh));assert.deepEqual(meshSnapshot(next.drillMesh),meshSnapshot(old.drillMesh));
    for(const slot of slots){assert.equal(slot.at,null);assert.equal(slot.color,null);}
  }
  next.drill(new T.Vector3(),new T.Vector3(0,0,1),new T.Color(),.2,4,1);next.clear();assert.equal(next.drills.length,0);
  for(const slot of slots){assert.equal(slot.at,null);assert.equal(slot.color,null);}
  old.dispose();next.dispose();assert.equal(next.mesh.parent,null);assert.equal(next.drillMesh.parent,null);
});
function sparkleBody(source){const at=source.indexOf("    } else if (kind === 'explosher') {\n")+"    } else if (kind === 'explosher') {\n".length;return source.slice(at,source.indexOf('\n    }\n  }\n  bodyData',at));}
function sparkleProgram(body){
  let trig=0;const math=Object.create(Math);for(const key of ['sin','cos'])math[key]=x=>{trig++;return Math[key](x);};
  const fract=x=>x-Math.floor(x),hash=(a,b)=>fract(Math.sin(a*127.1+b*311.7)*43758.5453);
  const fn=new Function('R','p','sparkPos','sparkSize','nk','f','S3_SHAPE','hash','fract','v','sp','cam','MAX_SPARK','Math','for(let once=0;once<1;once++){'+body+'}return nk;');
  const R={sparkleCoefficients:new WeakMap()},p={seed:.2,age:0,pos:new T.Vector3(2,3,4)},pos={array:new Float32Array(480)},size={array:new Float32Array(160)},f=new T.Vector3(.3,.4,.5),v=new T.Vector3();
  return{R,p,pos,size,reset(){trig=0;},get trig(){return trig;},draw(initial=0,cam=null){return fn(R,p,pos,size,initial,f,S3_SHAPE,hash,fract,v,12,cam,160,math);}};
}
function sameFloat32(a,b){
  // IEEE NaN payload/sign bits are not a rendered value. All finite cells and
  // signed zeros are compared exactly, including Float32 rounding boundaries.
  for(let i=0;i<a.length;i++)assert.ok(Object.is(a[i],b[i]),`Float32 cell ${i}: ${a[i]} vs ${b[i]}`);
}
test('Explosher harmonic phase retains every Float32 size/position with seed reuse, capacities and nonfinite/large-angle fallbacks',t=>{
  const a=sparkleProgram(frozen.sparkles),b=sparkleProgram(sparkleBody(read('../runtime/s3-projectile-shapes.mjs')));
  let word=23;const random=()=>((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);
  const seeds=[0,-0,1,-1,.0001,NaN,Infinity,4294967295,...Array.from({length:96},random)];
  for(const seed of seeds)for(const hz of [30,60,120])for(let frame=0;frame<32;frame++){
    a.p.seed=b.p.seed=seed;a.p.age=b.p.age=frame/hz;
    const initial=[0,0,0,150,158,160][frame%6],cam=frame%29===0?new T.Vector3(1000,0,0):null;
    assert.equal(b.draw(initial,cam),a.draw(initial,cam));sameFloat32(b.pos.array,a.pos.array);sameFloat32(b.size.array,a.size.array);
  }
  for(const age of [-1,NaN,Infinity,1e20,61]){a.p.age=b.p.age=age;a.p.seed=b.p.seed=.5;assert.equal(b.draw(),a.draw());sameFloat32(b.size.array,a.size.array);}
  a.p.seed=b.p.seed=.7;a.p.age=b.p.age=.1;for(let i=0;i<3;i++){a.draw();b.draw();}a.reset();b.reset();
  for(let i=0;i<300;i++){a.p.age=b.p.age=i/120; a.draw();b.draw();assert.deepEqual(b.size.array,a.size.array);}
  assert.equal(a.trig,8400);assert.ok(b.trig<1000,`warm phase trig ${b.trig} instead of ${a.trig}`);
  t.diagnostic(JSON.stringify({warmFrames:300,originalPhaseTrig:a.trig,optimizedPhaseTrig:b.trig,finiteFloat32Difference:0}));
});
test('heading cull remains rejected: an invisible moving frame supplies the stopped projectile heading on reappearance',()=>{
  const direction=new Function(frozen.direction+';return direction;')();
  const a={vel:new T.Vector3(1,0,0)},b={vel:new T.Vector3(1,0,0)},out=new T.Vector3();direction(a,out);direction(b,out);
  a.vel.set(0,1,0);b.vel.set(0,1,0);direction(a,out); // b models the proposed hidden-frame skip.
  a.vel.set(0,0,0);b.vel.set(0,0,0);direction(a,out);const current=out.clone();direction(b,out);
  assert.deepEqual(current.toArray(),[0,1,0]);assert.deepEqual(out.toArray(),[1,0,0]);
});
test('muzzle cache remains rejected without a purity contract: an actual muzzle LOS callback can change the next sheet pose',()=>{
  const source=adaptBuildSource('src/game/weapons.js',read('../../../inkwave-public/src/game/weapons.js'));
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),cls=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name==='Projectiles'),node=cls.body.body.find(n=>n.key.name==='_muzzle');
  const shapes=read('../runtime/s3-projectile-shapes.mjs'),start=shapes.indexOf('  for (const b of R.sheets.bursts)');
  const body=shapes.slice(start,shapes.indexOf('  const ink = R.sheets.draw',start));
  const run=new Function('system','R',body);
  const constrainMuzzle=new Function('dir','muzzleHit',declaration(read('../runtime/camera-aim-controls.mjs'),'constrainMuzzle')+';return constrainMuzzle;')(new T.Vector3(),{hit:false,dist:0,point:new T.Vector3(),normal:new T.Vector3()});
  function trial(cached){
    let z=1;
    const G={physics:{los(){z=1.5;return true;}}};
    const muzzle=new Function('G','_v2','_v3','constrainMuzzle','return ({'+source.slice(node.start,node.end)+'})._muzzle;')(G,new T.Vector3(),new T.Vector3(),constrainMuzzle);
    const owner={pos:new T.Vector3(),form:'kid',aimDir:new T.Vector3(0,0,1),character:{getMuzzle(out){out.set(0,1.05,z);},aimReady:()=>1}};
    const R={v2:new T.Vector3(),sheets:{bursts:[0,1].map(()=>({owner,at:new T.Vector3(0,1.05,1),dir:new T.Vector3(0,0,1)}))}},system={_muzzle:muzzle};
    if(cached){let first;system._muzzle=function(a,out){if(first)return out.copy(first);muzzle.call(this,a,out);first=out.clone();return out;};}
    run(system,R);return R.sheets.bursts.map(b=>b.at.z);
  }
  assert.deepEqual(trial(false),[1,1.5]);assert.deepEqual(trial(true),[1,1]);
});
