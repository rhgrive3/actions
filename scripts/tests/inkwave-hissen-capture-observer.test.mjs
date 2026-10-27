// Controlled native Three geometry and inert submission owner, never GPU proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import { installHissenCaptureObserver } from '../lib/inkwave-hissen-capture-observer.mjs';

function fixture() {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,0,.5,0],3));
  geometry.setIndex([0,1,2]);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),8);mesh.name='InkVolume:fixture';
  const root=new THREE.Group();root.add(mesh);root.updateMatrixWorld(true);
  const batch={mesh,fringe:null,n:0};let calls=0,begins=0;
  const engine={isInkVolumes:true,assets:new Map([['roller',{}]]),activeBatches:[],metrics:{active:0},measureOnly:false,
    begin(){begins++;this.activeBatches=[];batch.n=mesh.count=0;this.metrics.active=0;return 'native-begin';},
    submitComposite(source){calls++;if(this.measureOnly)return true;if(source.reject)return false;
      if(!batch.n)this.activeBatches.push(batch);mesh.setMatrixAt(batch.n,new THREE.Matrix4().makeTranslation(...source.pos.toArray()));
      batch.n++;mesh.count=batch.n;this.metrics.active++;return true;}};
  const source=(unit=0,actor='WeaponSlosherDiffusion')=>({wid:'s3-slosher-diffusion',seed:.2+unit*.1,age:5/60,
    pos:new THREE.Vector3(1,0,0),vel:new THREE.Vector3(0,0,50),catalog:{r:{sourceActor:actor},descriptor:{unit},index:0}});
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  return{engine,source,camera,mesh,root,calls:()=>calls,begins:()=>begins};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('serialized passive observer delegates once and records actual slot, matrix and projection without mutations',()=>{
  const f=fixture(),factory=vm.runInNewContext('('+installHissenCaptureObserver.toString()+')');
  const begin=f.engine.begin,submit=f.engine.submitComposite,watch=factory(f.engine,THREE,{width:100,height:100});
  assert.equal(f.engine.begin(),'native-begin');assert.equal(f.begins(),1);
  const p=f.source(),before=JSON.stringify(p);assert.equal(f.engine.submitComposite(p),true);assert.equal(f.calls(),1);
  const array=Array.from(f.mesh.instanceMatrix.array),metrics=plain(f.engine.metrics),seen=watch.snapshot(f.camera);
  assert.equal(seen.draws.length,1);assert.equal(seen.draws[0].slot,0);assert.equal(seen.draws[0].source.unit,0);
  assert.deepEqual(plain(seen.draws[0].projectedGeometryBounds),[62.5,37.5,87.5,62.5]);
  assert.match(seen.draws[0].boundsKind,/not alpha\/depth-tested/);
  assert.deepEqual(Array.from(f.mesh.instanceMatrix.array),array);assert.deepEqual(plain(f.engine.metrics),metrics);
  assert.equal(JSON.stringify(p),before);assert.equal(f.mesh.visible,true);assert.equal(f.mesh.count,1);
  assert.equal(watch.restore(),true);assert.equal(watch.restore(),true);assert.equal(f.engine.begin,begin);assert.equal(f.engine.submitComposite,submit);
});
test('planning, other weapons and rejected submissions cannot manufacture Hissen draw records',()=>{
  const f=fixture(),watch=installHissenCaptureObserver(f.engine,THREE,{width:100,height:100});f.engine.begin();
  f.engine.measureOnly=true;f.engine.submitComposite(f.source());f.engine.measureOnly=false;
  f.engine.submitComposite(f.source(0,'WeaponSlosherStrong'));f.engine.submitComposite({...f.source(),reject:true});
  assert.equal(f.calls(),3);assert.equal(watch.snapshot(f.camera).draws.length,0);assert.equal(f.mesh.count,1);watch.restore();
});
test('records per-source slot ranges and clears only observer records at the next real begin',()=>{
  const f=fixture(),watch=installHissenCaptureObserver(f.engine,THREE,{width:100,height:100});f.engine.begin();
  f.engine.submitComposite(f.source(0,'WeaponSlosherStrong'));f.engine.submitComposite(f.source(2));f.engine.submitComposite(f.source(3));
  const seen=watch.snapshot(f.camera);assert.deepEqual(seen.draws.map(d=>[d.slot,d.source.unit]),[[1,2],[2,3]]);
  f.engine.begin();assert.equal(watch.snapshot(f.camera).draws.length,0);assert.equal(f.begins(),2);watch.restore();
});
test('passive reads respect hidden parents and native instance counts without changing either',()=>{
  const f=fixture(),watch=installHissenCaptureObserver(f.engine,THREE,{width:100,height:100});f.engine.begin();f.engine.submitComposite(f.source());
  f.root.visible=false;assert.equal(watch.snapshot(f.camera).draws.length,0);assert.equal(f.root.visible,false);
  f.root.visible=true;f.mesh.count=0;assert.equal(watch.snapshot(f.camera).draws.length,0);assert.equal(f.mesh.count,0);watch.restore();
});
test('observer restoration refuses to overwrite a newer owner',()=>{
  const f=fixture(),watch=installHissenCaptureObserver(f.engine,THREE,{width:100,height:100}),observed=f.engine.submitComposite;
  const newer=()=>false;f.engine.submitComposite=newer;assert.throws(()=>watch.restore(),/ownership changed/);assert.equal(f.engine.submitComposite,newer);
  f.engine.submitComposite=observed;watch.restore();
});
test('restoration deletes own shadows for native prototype methods',()=>{
  const f=fixture(),prototype={begin:f.engine.begin,submitComposite:f.engine.submitComposite};
  delete f.engine.begin;delete f.engine.submitComposite;Object.setPrototypeOf(f.engine,prototype);
  const watch=installHissenCaptureObserver(f.engine,THREE,{width:100,height:100});
  assert(Object.hasOwn(f.engine,'begin'));assert(Object.hasOwn(f.engine,'submitComposite'));
  f.engine.begin();f.engine.submitComposite(f.source());assert.equal(watch.snapshot(f.camera).draws.length,1);watch.restore();
  assert.equal(Object.hasOwn(f.engine,'begin'),false);assert.equal(Object.hasOwn(f.engine,'submitComposite'),false);
  assert.equal(f.engine.begin,prototype.begin);assert.equal(f.engine.submitComposite,prototype.submitComposite);
});
test('restoration preserves exact own nondefault descriptors and unrelated replacements are never clobbered',()=>{
  const f=fixture();
  Object.defineProperty(f.engine,'begin',{value:f.engine.begin,writable:true,enumerable:false,configurable:false});
  Object.defineProperty(f.engine,'submitComposite',{value:f.engine.submitComposite,writable:true,enumerable:false,configurable:true});
  const before=Object.getOwnPropertyDescriptors(f.engine),watch=installHissenCaptureObserver(f.engine,THREE,{width:100,height:100});
  const observed=f.engine.submitComposite,newer=()=>false;f.engine.submitComposite=newer;
  assert.throws(()=>watch.restore(),/ownership changed/);assert.equal(f.engine.submitComposite,newer);
  f.engine.submitComposite=observed;watch.restore();
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.engine,'begin'),before.begin);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.engine,'submitComposite'),before.submitComposite);
});
test('read-only own method is rejected before installing either wrapper',()=>{
  const f=fixture(),begin=f.engine.begin;
  Object.defineProperty(f.engine,'submitComposite',{value:f.engine.submitComposite,writable:false,configurable:false});
  assert.throws(()=>installHissenCaptureObserver(f.engine,THREE,{width:100,height:100}),/replaceable native methods/);
  assert.equal(f.engine.begin,begin);
});
test('missing native owner is rejected instead of substituting a generic body',()=>assert.throws(()=>installHissenCaptureObserver({},THREE,{}),/native volume owner/));
function birthDriver(birth=5){
  const source=fs.readFileSync(new URL('../check-inkwave-trislosher-native-matched.mjs',import.meta.url),'utf8');
  const start=source.indexOf('      const reached=()=>'),end=source.indexOf('      const matrices=',start);
  assert(start>=0&&end>start);
  const window={nativeTick:0,__iwHissenFirstBirth:null},fire=[];
  const G={projectiles:{list:[]}},g={debug:{step(){
    const next=window.nativeTick+1;
    // Earlier delayed/pending records must not redefine the observed birth.
    G.projectiles.list=[{delay:0,_s3SloshBirthPending:next<birth,seed:.3,age:0,
      catalog:{r:{sourceActor:'WeaponSlosherDiffusion'},birthPending:next<birth,descriptor:{unit:0},index:0}}];
  },fire(value){fire.push({tick:window.nativeTick,value});}}};
  const run=vm.runInNewContext('(target,measureMain)=>{'+source.slice(start,end)+';return {tick:window.nativeTick,birth:window.__iwHissenFirstBirth};}',{window,G,g});
  return{run,window,fire};
}
test('actual serialized driver captures5/7/9 after observed active birth, not after Fire press',()=>{
  const f=birthDriver();
  for(const [target,tick]of [[5,10],[7,12],[9,14]]){
    const row=f.run(target,true);assert.equal(row.tick,tick);assert.equal(row.birth.tick,5);
  }
  assert.equal(f.fire[0].tick,5);assert(f.fire.every(f=>f.value===false));
});
test('actual serialized driver fails at120 ticks when native active birth never arrives',()=>{
  const f=birthDriver(Infinity);assert.throws(()=>f.run(5,true),/bounded Hissen first-birth capture/);assert.equal(f.window.nativeTick,120);
});
test('default actual driver still captures absolute18 and releases at12 without a birth-relative dependency',()=>{
  const f=birthDriver(Infinity);assert.equal(f.run(18,false).tick,18);assert.deepEqual(f.fire,[{tick:12,value:false}]);assert.equal(f.window.__iwHissenFirstBirth,null);
});
test('actual child trace passively copies native shader/profile/slot data only in measurement mode',()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-trislosher-native-matched.mjs',import.meta.url),'utf8');
  const start=source.indexOf('      const matrices='),end=source.indexOf('      return {',start);assert(start>=0&&end>start);
  const shape=new Float32Array([1.05,.03,6.9,0]),look=new Float32Array([.3,4,.32,.7]);
  const d={pos:new THREE.Vector3(1,2,3),drawRadius:.3,sourceActor:'WeaponSlosherDiffusion',seed:.23,frames:0};
  const matrix=new THREE.Matrix4().compose(d.pos,new THREE.Quaternion(),new THREE.Vector3(.15,.15,.15));
  const G={projectiles:{_s3SplashDrops:[d],blobShape:{array:shape},blobInkLook:{array:look},blobs:{count:1,
    geometry:{index:{count:4080}},getMatrixAt(_slot,out){out.copy(matrix);}}}};
  const run=vm.runInNewContext('measureMain=>{'+source.slice(start,end)+';return matrices;}',{G,THREE});
  const before=JSON.stringify(d),row=plain(run(true))[0];
  assert.equal(row.slot,0);assert.equal(row.seed,.23);assert.equal(row.sourceActor,'WeaponSlosherDiffusion');assert.equal(row.triangles,1360);
  assert.deepEqual(row.inkLook,Array.from(look));assert.deepEqual(row.shape,Array.from(shape));assert.deepEqual(row.instanceMatrix,matrix.toArray());
  assert.match(row.profileKind,/not alpha\/depth-tested/);assert.equal(JSON.stringify(d),before);
  assert.deepEqual(Object.keys(plain(run(false))[0]).sort(),['direction','frames','radius','scale'],'default historical row unchanged');
  row.inkLook[0]=99;row.shape[0]=99;assert.equal(look[0],Math.fround(.3));assert.equal(shape[0],Math.fround(1.05));
});
test('driver preserves default18 and adds a bounded birth-relative passive route without visibility manipulation',()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-trislosher-native-matched.mjs',import.meta.url),'utf8');
  assert.match(source,/process\.argv\.includes\('--measure-main'\)/);assert.match(source,/measureMain\?\[5,7,9\]:\[18\]/);
  assert.match(source,/else if\(window\.nativeTick===12\)g\.debug\.fire\(false\)/);
  assert.match(source,/window\.nativeTick-window\.__iwHissenFirstBirth\.tick/);assert.match(source,/window\.nativeTick>=120/);
  assert.match(source,/mainObservation:window\.__iwHissenObservation\.snapshot\(G\.camera\)/);
  const observer=fs.readFileSync(new URL('../lib/inkwave-hissen-capture-observer.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(observer,/(?:\.visible|\.count|\.instanceMatrix|\.pos|\.age)\s*=(?!=)|setMatrixAt|Math\.random|renderer\.render/);
});
// Exact append-only report closure, scoped to the existing binding step. This
// transfers the accepted Wiper addition; it never accepts an arbitrary suffix.
const catalogReceiptPaths=['catalog/motion-catalog-result.json','brellas/brella-controls-result.json','hissen-main/native-browser.json','wiper-native/wiper-native-result.json'];
const catalogReceiptLine=paths=>"            'catalog':["+paths.map(p=>"'"+p+"'").join(',')+"],";
const hissenHeadBinding="          if suite=='catalog': assert reports['hissen-main/native-browser.json']['sourceIdentity']['checkoutSha']==os.environ['SOURCE_SHA']";
function requireCatalogReceiptRegistration(source){
  const step='      - name: Bind passing browser evidence to the tested commit';
  assert.equal(source.split('\n').filter(line=>line===step).length,1,'one existing browser evidence binding step');
  const start=source.indexOf(step),end=source.indexOf('\n      - ',start+step.length);assert(end>start,'binding step end');
  const block=source.slice(start,end),open='          checks={',close='          }[suite]';
  assert.equal(block.split('\n').filter(line=>line===open).length,1,'one report table in binding step');assert.equal(block.split('\n').filter(line=>line===close).length,1,'one suite selection in binding step');
  const a=block.indexOf(open),b=block.indexOf(close);assert(b>a,'report table order');const table=block.slice(a,b);
  const expected=catalogReceiptLine(catalogReceiptPaths);
  assert.equal(table.split('\n').filter(line=>line===expected).length,1,'exact ordered catalog report closure');
  assert.equal(source.split('\n').filter(line=>line===expected).length,1,'catalog report row cannot be duplicated or relocated');
  assert.equal((table.match(/^            'catalog':/gm)||[]).length,1,'one catalog suite row');
  assert.equal(block.split('\n').filter(line=>line===hissenHeadBinding).length,1,'Hissen exact-head binding stays in the admitted step');
  assert.equal(source.split('\n').filter(line=>line===hissenHeadBinding).length,1,'Hissen head binding cannot be duplicated or relocated');
}
test('normal catalog workflow retains old gates and binds additive Hissen report to the automatic exact head',()=>{
  const source=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
  const motion=source.indexOf('      - name: Verify the complete installed motion catalog');
  const next=source.indexOf('      - name: Observe native Hissen main draws at first-birth-relative phases');
  assert(motion>=0&&next>motion);assert.match(source.slice(next,next+450),/if: matrix\.suite == 'catalog'/);
  assert.match(source,/check-inkwave-trislosher-native-matched\.mjs \.built-site\/_site "\$CI_STORAGE\/evidence\/hissen-main" --measure-main/);
  requireCatalogReceiptRegistration(source);
  assert.match(source,/reports\['hissen-main\/native-browser\.json'\]\['sourceIdentity'\]\['checkoutSha'\]==os\.environ\['SOURCE_SHA'\]/);
});

test('catalog report registration rejects omission, duplication, reorder, extras and relocation',()=>{
  const source=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
  requireCatalogReceiptRegistration(source);const line=catalogReceiptLine(catalogReceiptPaths);
  const rows=[];
  for(let i=0;i<catalogReceiptPaths.length;i++){
    rows.push(catalogReceiptPaths.filter((_,j)=>j!==i));
    rows.push([...catalogReceiptPaths.slice(0,i),catalogReceiptPaths[i],...catalogReceiptPaths.slice(i)]);
  }
  for(let i=0;i<catalogReceiptPaths.length-1;i++){const row=[...catalogReceiptPaths];[row[i],row[i+1]]=[row[i+1],row[i]];rows.push(row);}
  rows.push([...catalogReceiptPaths,'unknown/result.json']);
  for(const row of rows)assert.throws(()=>requireCatalogReceiptRegistration(source.replace(line,catalogReceiptLine(row))));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(line,'')));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(line,line+'\n'+line)));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(line,'')+'\n'+line));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(line,line.replace("'catalog':","'startup':"))));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(hissenHeadBinding,'')));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(hissenHeadBinding,hissenHeadBinding+'\n'+hissenHeadBinding)));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(hissenHeadBinding,'')+'\n'+hissenHeadBinding));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(line,'#'+line)));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(line,catalogReceiptLine([...catalogReceiptPaths,'unknown/result.json'])+'\n#'+line)));
  assert.throws(()=>requireCatalogReceiptRegistration(source.replace(hissenHeadBinding,'#'+hissenHeadBinding)));
});
