import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../../inkwave-public/src/core/renderer.js',import.meta.url),'utf8');
const start=source.indexOf('  applySettings(settings) {');
const end=source.indexOf('\n  // Dynamic resolution',start);
assert.ok(start>0&&end>start);
const method=source.slice(start,end).trim().replace(/^applySettings\(settings\)/,'function applySettings(settings)');
const q={low:{bloom:false},high:{bloom:true}};
q.ultra={bloom:true};
const apply=vm.runInNewContext('('+method+')',{effectiveQuality:(settings)=>q[settings.quality]});
function harness(){
 let builds=0,materialsUpdated=0;
 const material={set needsUpdate(v){if(v===true)materialsUpdated++;}};
 const renderer={shadowMap:{enabled:true,needsUpdate:false}};
 const comp={identity:'unchanged-post-stack'};
 const instance={
  renderer,scene:{traverse(cb){cb({material});}},settings:{quality:'high',shadows:true,bloom:true},
  mobile:{touch:false},q:q.high,dynScale:0.75,bloom:{enabled:true},composer:comp,
  _buildComposer(){builds++;this.renderer.shadowMap.enabled=this.settings.shadows!==false;this.composer={identity:'new-'+builds};this.bloom={enabled:true};}
 };
 return {instance,apply:(settings)=>apply.call(instance,settings),builds:()=>builds,materialsUpdated:()=>materialsUpdated,original:comp};
}
test('twenty shadow toggles keep the same postprocessing composer and dynamic resolution',()=>{
 const r=harness();for(let i=0;i<20;i++){
  const shadows=i%2===1;r.apply({quality:'high',shadows,bloom:true});
  assert.equal(r.instance.renderer.shadowMap.enabled,shadows);
  assert.equal(r.instance.composer,r.original);
  assert.equal(r.instance.dynScale,.75);
 }
 assert.equal(r.builds(),0);
 assert.equal(r.materialsUpdated(),20);
 assert.equal(r.instance.renderer.shadowMap.needsUpdate,true);
});
test('changing effective quality still rebuilds and invalidates material programs',()=>{
 const r=harness();r.apply({quality:'low',shadows:false,bloom:true});
 assert.equal(r.builds(),1);assert.equal(r.instance.dynScale,1);
 assert.notEqual(r.instance.composer,r.original);
 assert.equal(r.instance.renderer.shadowMap.enabled,false);
 assert.equal(r.instance.bloom.enabled,false);
 assert.equal(r.materialsUpdated(),1);
});
test('bloom-only setting does not rebuild composer or invalidate material programs',()=>{
 const r=harness();r.apply({quality:'high',shadows:true,bloom:false});
 assert.equal(r.builds(),0);assert.equal(r.materialsUpdated(),0);
 assert.equal(r.instance.bloom.enabled,false);
 assert.equal(r.instance.composer,r.original);
});
test('equal effective quality values preserve composer despite distinct preset objects',()=>{
 const r=harness();
 for(let i=0;i<50;i++)r.apply({quality:i%2?'high':'ultra',shadows:true,bloom:true});
 assert.equal(r.builds(),0);assert.equal(r.materialsUpdated(),0);
 assert.equal(r.instance.composer,r.original);assert.equal(r.instance.dynScale,.75);
 q.ultra.pixelRatio=2;
 r.apply({quality:'ultra',shadows:true,bloom:true});
 assert.equal(r.builds(),1,'a new effective field still requires rebuilding');
 delete q.ultra.pixelRatio;
});
