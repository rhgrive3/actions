import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const file = new URL('../runtime/special-presentation.mjs', import.meta.url);
async function load(path, minified=false) {
  const source = await fs.readFile(path,'utf8');
  const match = source.match(/  function poseObject\(o, pres, dt\) \{[\s\S]*?\n  \}/);
  assert.ok(match,'actual production object pose function exists');
  let code='globalThis.poseObject = '+match[0]+';';
  if(minified) code=(await(await import(process.env.AREA_VFX_ESBUILD)).transform(code,{minify:true})).code;
  const ctx=vm.createContext({clamp01:x=>Math.max(0,Math.min(1,x)),poseSubModel(){}});
  vm.runInContext(code,ctx); return ctx.poseObject;
}
function fixture(age=0, phase='active') {
  const mat={uniforms:{uOpacity:{value:.86},uTime:{value:0}}};
  Object.defineProperty(mat,'opacity',{get(){return this.uniforms.uOpacity.value;},set(v){this.uniforms.uOpacity.value=v;}});
  const edge={opacity:.18};
  const sheet={scale:{set(x,y,z){Object.assign(this,{x,y,z});}},position:{y:0},children:[{material:edge},{material:mat}],userData:{s3ScreenSheet:{mat,tex:{offset:{x:0,y:0}}}}};
  const pres={models:{},sheet,group:{position:{copy(v){Object.assign(this,v);}},rotation:{set(){}}}};
  const o=Object.freeze({kind:'screen',phase,age,landedAt:0,dur:10,width:15,height:9,pos:Object.freeze({x:1,y:2,z:3}),normal:Object.freeze({x:0,z:1})});
  return {pres,o,mat,edge};
}
for(const minified of [false,...(process.env.AREA_VFX_ESBUILD?[true]:[])]) {
  const label=minified?'minified extracted branch':'source extracted branch';
  test(`${label}: flight and startup remain hidden/unfurling without authority changes`,async()=>{
    const pose=await load(file,minified);
    for(const [age,phase,visible,height] of [[1,'flight',false,.001],[0,'active',false,.001],[.5,'active',true,.875],[2,'active',true,1]]){
      const f=fixture(age,phase), before=JSON.stringify(f.o); pose(f.o,f.pres,1/60);
      assert.equal(f.pres.sheet.visible,visible); assert.equal(f.pres.sheet.scale.y,height);
      assert.equal(JSON.stringify(f.o),before);
    }
  });
  test(`${label}: close fades upright and its rim, ending hidden`,async()=>{
    const pose=await load(file,minified);
    for(const age of [9,9.25,9.5,9.75,10,11]){
      const f=fixture(age),fold=Math.max(0,Math.min(1,age-9)),fade=1-fold*fold;
      pose(f.o,f.pres,1/60);
      assert.equal(f.pres.sheet.scale.y,1);assert.equal(f.pres.sheet.scale.x,1);
      assert.equal(f.pres.sheet.position.y,4.5);
      assert.ok(Math.abs(f.mat.uniforms.uOpacity.value-(.8+.06*Math.sin(age*7))*fade)<1e-12);
      assert.equal(f.edge.opacity,.18*fade); assert.equal(f.pres.sheet.visible,fade>0);
    }
  });
  test(`${label}: reusing presentation after close restores body and rim opacity`,async()=>{
    const pose=await load(file,minified), f=fixture(10); pose(f.o,f.pres,1/60);
    assert.equal(f.mat.opacity,0); assert.equal(f.edge.opacity,0);
    const active=fixture(2).o;pose(active,f.pres,1/60);
    assert.ok(f.mat.opacity>.7);assert.equal(f.edge.opacity,.18);assert.equal(f.pres.sheet.visible,true);
  });
}
if(process.env.SCREEN_PRESENTATION_BASELINE) test('negative control: frozen close collapses size while keeping opacity',async()=>{
  const pose=await load(process.env.SCREEN_PRESENTATION_BASELINE),f=fixture(9.5);pose(f.o,f.pres,1/60);
  assert.equal(f.pres.sheet.scale.y,.75);assert.ok(f.pres.sheet.scale.x<1);
  assert.ok(f.mat.opacity>.7); assert.equal(f.edge.opacity,.18);
});
