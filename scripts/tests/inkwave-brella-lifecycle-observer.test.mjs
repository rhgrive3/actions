import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../render-inkwave-brella-gallery.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function observeCanopyHandoff('),source.indexOf('      function heldCanopyHidden('));
const observe=vm.runInNewContext('('+body.trim()+')');
const hidden=vm.runInNewContext('('+source.slice(source.indexOf('function heldCanopyHidden('),source.indexOf('      const shots = {};')).trim()+')');
function setup(){const actor={},scene={},id='s3-shelter-normal',before={launched:true,owner:actor,weaponId:id,remaining:2,visualSource:{parts:{canopy:{geo:{}}}},mesh:{parent:scene,visible:true,name:'brella-canopy:'+id,children:[{name:'canopy',isMesh:true,geometry:null,visible:true}]}};before.mesh.children[0].geometry=before.visualSource.parts.canopy.geo;return {actor,scene,id,before};}
const check=(x,was=false,after=null)=>observe(x.before,was,after,x.actor,x.id,x.scene);
test('native live owned handoff accepted',()=>assert.equal(check(setup()),true));
for(const [name,change] of Object.entries({wrongOwner:x=>x.before.owner={},wrongWeapon:x=>x.before.weaponId='other',noLaunch:x=>x.before.launched=false,expired:x=>x.before.remaining=0,noMesh:x=>x.before.mesh=null,wrongScene:x=>x.before.mesh.parent={},hiddenDetached:x=>x.before.mesh.visible=false,wrongName:x=>x.before.mesh.name='other',emptyMesh:x=>x.before.mesh.children=[],hiddenParts:x=>x.before.mesh.children[0].visible=false,wrongGeometry:x=>x.before.mesh.children[0].geometry={},wrongChild:x=>x.before.mesh.children[0].name='unrelated',missingCloth:x=>delete x.before.visualSource.parts.canopy,missingInk:x=>x.before.visualSource.parts.canopyInk={geo:{}}}))test(name,()=>{const x=setup();change(x);assert.equal(check(x),false);});
test('stale launched reference rejected',()=>assert.equal(check(setup(),true),false));
test('held state still owns canopy rejected',()=>{const x=setup();assert.equal(check(x,false,x.before),false);});
test('no pre-update canopy rejected',()=>{const x=setup();x.before=null;assert.equal(check(x),false);});
test('lifecycle gates remain required and input schedule unchanged',()=>{assert.match(source,/!sawOpen\|\|!sawLaunched\|\|!sawHidden\|\|!sawFolded/);assert.match(source,/if\(handedOff&&heldCanopyHidden\(ch.weapon\)&&!sawHidden\)/);assert.match(source,/frame>=70&&frame<firstEnd\|\|frame>=secondStart&&frame<secondStart\+300/);});

test('held cloth and ink must both hide',()=>{assert.equal(hidden({parts:{canopy:{visible:false},canopyInk:{visible:true}}}),false);assert.equal(hidden({parts:{canopy:{visible:false},canopyInk:{visible:false}}}),true);assert.equal(hidden({parts:{}}),false);});
