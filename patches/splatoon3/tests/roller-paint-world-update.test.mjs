import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {register} from 'node:module';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
register(new URL('../../../scripts/composer-target-three-loader.mjs',import.meta.url),import.meta.url);
const THREE=await import('three');
const relative='patches/splatoon3/runtime/main-weapon-catalog.mjs';
const current=fs.readFileSync(process.env.INKWAVE_BUILT_SITE?path.join(process.env.INKWAVE_BUILT_SITE,relative):new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
const control=fs.readFileSync(new URL('./fixtures/roller-paint-world-before-03523329.mjs.txt',import.meta.url),'utf8');
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const child of Object.values(node)){if(Array.isArray(child))child.forEach(c=>walk(c,visit));else if(child&&typeof child==='object')walk(child,visit);}}
function extract(code){
  const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const imported=ast.body.flatMap(n=>n.type==='ImportDeclaration'?n.specifiers:[]).find(s=>s.imported?.name==='installRollerContactPaint');
  assert.ok(imported,'retain the actual contact-install import');
  const names=[];walk(ast,n=>{if(n.type==='CallExpression'&&n.callee.name===imported.local.name){assert.equal(n.arguments[1].type,'Identifier');names.push(n.arguments[1].name);}});
  assert.equal(names.length,1);
  const methods=[];walk(ast,n=>{if(n.type==='FunctionDeclaration'&&n.id.name===names[0])methods.push(n);});
  assert.equal(methods.length,1,'one actual production paint callback');
  return code.slice(methods[0].start,methods[0].end);
}
const candidate=extract(current);
function compile(code,records){
  const ast=parse('('+code+')',{ecmaVersion:'latest'}),calls=[];
  walk(ast,n=>{if(n.type==='CallExpression'&&n.callee.type==='Identifier')calls.push(n.callee.name);});
  assert.equal(new Set(calls).size,1,'only the native paint sink is substituted');
  return vm.runInNewContext('('+code+')',{[calls[0]]:(_a,p,r,d,h,contact)=>records.push([p.toArray(),r,d,h.toArray(),contact.id])});
}
function run(code,hz,mode){
  const records=[],paint=compile(code,records),root=new THREE.Group(),parent=new THREE.Group(),drum=new THREE.Mesh(new THREE.BoxGeometry(.8,.3,.4));
  root.add(parent);parent.add(drum);
  if(mode==='manual-local'){root.matrixAutoUpdate=parent.matrixAutoUpdate=drum.matrixAutoUpdate=false;}
  if(mode==='manual-world'){root.matrixWorldAutoUpdate=parent.matrixWorldAutoUpdate=drum.matrixWorldAutoUpdate=false;}
  const actor={yaw:0,ground:{face:0},character:{weapon:{drum,def:{drum:drum.geometry}}}};
  const v=()=>new THREE.Vector3();
  const stroke={to:v(),from:v(),heading:v(),point:v(),contact:{id:42},radius:.35,depth:.6,speed:3,dt:1/hz,face:0,active:false};
  let updates=0;const native=THREE.Object3D.prototype.updateWorldMatrix;
  THREE.Object3D.prototype.updateWorldMatrix=function(...args){updates++;return native.apply(this,args);};
  const snapshots=[];
  try{for(let frame=0;frame<hz;frame++){
    const t=frame/hz;actor.yaw=t*2.1;
    root.position.set(Math.sin(t)*2,t*.03,t*3);root.rotation.set(t*.02,t*.7,t*.01);root.scale.set(1+t*.02,.9,1.1);
    parent.position.set(.12,.28,.5);parent.rotation.set(.1,t*.4,Math.sin(t)*.1);
    drum.position.set(.05,.1,.2);drum.rotation.set(.3,t*1.1,.2);
    if(mode==='manual-local'){root.updateMatrix();parent.updateMatrix();drum.updateMatrix();}
    if(mode==='manual-world'){
      root.matrixWorld.makeTranslation(t*.3,.4,t*2);parent.matrixWorld.makeRotationY(t*.4);drum.matrixWorld.makeTranslation(.2+t*.1,.5,t*.2);
    }
    if(frame===Math.floor(hz/2))actor.ground.face++;
    paint(actor,stroke,frame%5!==0);
    snapshots.push({to:stroke.to.toArray(),from:stroke.from.toArray(),heading:stroke.heading.toArray(),active:stroke.active,face:stroke.face,
      world:[root,parent,drum].map(o=>Array.from(o.matrixWorld.elements))});
  }}finally{THREE.Object3D.prototype.updateWorldMatrix=native;drum.geometry.dispose();drum.material.dispose();}
  return {records,snapshots,updates};
}
test('actual roller paint callback keeps all stamps and matrices while removing one redundant world walk',()=>{
  const counts=[];
  for(const hz of [30,60,120])for(const mode of ['automatic','manual-local','manual-world']){
    const before=run(control,hz,mode),after=run(candidate,hz,mode);
    assert.deepEqual(after.records,before.records,`${hz}Hz/${mode}: exact ink contact stamps`);
    assert.deepEqual(after.snapshots,before.snapshots,`${hz}Hz/${mode}: stroke state and world matrices`);
    assert.equal(before.updates,after.updates*2,'physical placement has one ancestor walk instead of two');
    counts.push({hz,mode,before:before.updates,after:after.updates});
  }
  console.log(JSON.stringify({scope:'real Three matrix/contact callback; no frame-rate claim',counts}));
});
test('a stale-matrix shortcut fails the same changing-parent contact output control',()=>{
  // Use the actual bound identifiers even after production minification.
  const ast=parse('('+candidate+')',{ecmaVersion:'latest'});let call;
  walk(ast,n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='localToWorld')call=n;});
  assert.ok(call);
  const changed=candidate.slice(0,call.start-1)+`${candidate.slice(call.arguments[0].start-1,call.arguments[0].end-1)}.applyMatrix4(${candidate.slice(call.callee.object.start-1,call.callee.object.end-1)}.matrixWorld)`+candidate.slice(call.end-1);
  assert.notEqual(changed,candidate);
  assert.notDeepEqual(run(changed,30,'automatic').records,run(control,30,'automatic').records);
});
