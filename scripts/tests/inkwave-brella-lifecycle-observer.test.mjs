import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../render-inkwave-brella-gallery.mjs',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function observeCanopyHandoff('),source.indexOf('      const shots = {};'));
const {observe,hidden,after,limit}=vm.runInNewContext('(()=>{'+helpers+';return {observe:observeCanopyHandoff,hidden:heldCanopyHidden,after:observeHeldAfterHandoff,limit:canopyHideApplications}})()');
function setup(){const actor={},scene={},id='s3-shelter-normal',before={launched:true,owner:actor,weaponId:id,remaining:2,visualSource:{parts:{canopy:{geo:{}}}},mesh:{parent:scene,visible:true,name:'brella-canopy:'+id,children:[{name:'canopy',isMesh:true,geometry:null,visible:true}]}};before.mesh.children[0].geometry=before.visualSource.parts.canopy.geo;return {actor,scene,id,before};}
const check=(x,was=false,after=null)=>observe(x.before,was,after,x.actor,x.id,x.scene);
test('native live owned handoff accepted',()=>assert.equal(check(setup()),true));
for(const [name,change] of Object.entries({wrongOwner:x=>x.before.owner={},wrongWeapon:x=>x.before.weaponId='other',noLaunch:x=>x.before.launched=false,expired:x=>x.before.remaining=0,noMesh:x=>x.before.mesh=null,wrongScene:x=>x.before.mesh.parent={},hiddenDetached:x=>x.before.mesh.visible=false,wrongName:x=>x.before.mesh.name='other',emptyMesh:x=>x.before.mesh.children=[],hiddenParts:x=>x.before.mesh.children[0].visible=false,wrongGeometry:x=>x.before.mesh.children[0].geometry={},wrongChild:x=>x.before.mesh.children[0].name='unrelated',missingCloth:x=>delete x.before.visualSource.parts.canopy,missingInk:x=>x.before.visualSource.parts.canopyInk={geo:{}}}))test(name,()=>{const x=setup();change(x);assert.equal(check(x),false);});
test('stale launched reference rejected',()=>assert.equal(check(setup(),true),false));
test('held state still owns canopy rejected',()=>{const x=setup();assert.equal(check(x,false,x.before),false);});
test('no pre-update canopy rejected',()=>{const x=setup();x.before=null;assert.equal(check(x),false);});
test('lifecycle gates remain required and input schedule unchanged',()=>{assert.match(source,/!sawOpen\|\|!sawLaunched\|\|!sawHidden\|\|!sawFolded/);assert.match(source,/observeHeldAfterHandoff\(pendingHandoff,frame,cs,ch.weapon,a,id,scene\)/);assert.match(source,/frame-pendingHandoff.frame>=canopyHideApplications\(1\/60\)/);assert.match(source,/frame>=70&&frame<firstEnd\|\|frame>=secondStart&&frame<secondStart\+300/);});

test('held cloth and ink must both hide',()=>{assert.equal(hidden({parts:{canopy:{visible:false},canopyInk:{visible:true}}}),false);assert.equal(hidden({parts:{canopy:{visible:false},canopyInk:{visible:false}}}),true);assert.equal(hidden({parts:{}}),false);});

function pendingSetup(){const x=setup();x.weapon={parts:{canopy:{visible:false},canopyInk:{visible:false}}};x.state={canopy:null,naked:1};x.pending={canopy:x.before,mesh:x.before.mesh,source:x.before.visualSource,weapon:x.weapon,frame:100};return x;}
const checkPending=(x,frame=108)=>after(x.pending,frame,x.state,x.weapon,x.actor,x.id,x.scene);
test('native damping reaches visibility threshold on application nine',()=>{let bv=1,n=0;while(bv>.02){bv=bv+(0-bv)*(1-Math.exp(-28/60));n++;}assert.equal(n,9);assert.equal(limit(1/60),n);assert.ok(Math.exp(-28*8/60)>.02);assert.ok(Math.exp(-28*9/60)<=.02);});
test('same owned detached canopy may finish native fade by frame delta eight',()=>assert.equal(checkPending(pendingSetup()),true));
test('late hidden observation cannot revive expired acceptance window',()=>assert.equal(checkPending(pendingSetup(),109),false));
for(const [name,change] of Object.entries({retired:x=>x.before.mesh=null,removed:x=>x.before.mesh.parent=null,expired:x=>x.before.remaining=0,ownerChanged:x=>x.before.owner={},geometryChanged:x=>x.before.mesh.children[0].geometry={},meshReplaced:x=>x.before.mesh={...x.before.mesh},sourceReplaced:x=>x.before.visualSource={...x.before.visualSource},weaponReplaced:x=>x.weapon={...x.weapon},heldAgain:x=>x.state.canopy=x.before,nakedOver:x=>x.state.naked=0,stillVisible:x=>x.weapon.parts.canopy.visible=true,inkVisible:x=>x.weapon.parts.canopyInk.visible=true}))test('delayed observation rejects '+name,()=>{const x=pendingSetup();change(x);assert.equal(checkPending(x),false);});
test('actual native animate and kit damping establish the nine-application upper bound',()=>{
 const model=fs.readFileSync(new URL('../../patches/splatoon3/runtime/weapon-models/brellas.mjs',import.meta.url),'utf8');
 const kit=fs.readFileSync(new URL('../../patches/splatoon3/runtime/weapon-models/kit.mjs',import.meta.url),'utf8');
 const dampLine=kit.match(/export const damp = ([^;]+);/);assert.ok(dampLine);
 const damp=vm.runInNewContext('('+dampLine[1]+')');
 const fn=model.slice(model.indexOf('function makeAnimate(cfg)'),model.indexOf('// ------------------------------------------------------------------------------------------ Splat Brella'));
 assert.match(fn,/hidden \? 0 : 1, 28, dt/);assert.match(fn,/g.visible = vis > 0.02/);
 const animate=vm.runInNewContext('('+fn.trim()+')',{damp,smooth:x=>x,BRELLA_APERTURE:{test:{scale:.11}},K_FOLD:.11})({openRate:1,foldRate:1,sz:1});
 const part=()=>({visible:true,scale:{set(){}}});const w={ps:{bv:1},def:{modelId:'test'},parts:{canopy:part(),canopyInk:part()}};
 for(let n=1;n<=9;n++){animate(w,{dt:1/60,runner:{catalogState:{canopy:null,naked:1}}});assert.equal(w.parts.canopy.visible,n<9);assert.equal(w.parts.canopyInk.visible,n<9);}
 assert.equal(hidden(w),true);
});
