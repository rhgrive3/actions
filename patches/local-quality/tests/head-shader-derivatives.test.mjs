import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

test('head derivative gate preserves covered fragments and remains open across primitive helper extrapolation at every face LOD',()=>{
  const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
  const rel='src/game/character-mats.js',raw=read(rel);
  for(const source of [raw,adaptBuildSource(rel,raw)]){
    assert.match(source,/if \(hl > 0\.0 && iwSub < 0\.5\)/);
    assert.ok(!source.includes('if (hl > 0.5'));
  }
  let source=adaptBuildSource('src/game/character-face.js',read('src/game/character-face.js'));
  const edits=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>
    n.type==='ImportDeclaration'||n.type==='ExportAllDeclaration'?[[n.start,n.end]]:
    n.type==='ExportNamedDeclaration'?[[n.start,n.declaration?.start??n.end]]:[]);
  for(const [a,b]of edits.reverse())source=source.slice(0,a)+source.slice(b);
  const {buildFaceSkin,HEAD_C}=new Function('THREE','G',source+'\nreturn {buildFaceSkin,HEAD_C};')(THREE,{settings:{quality:'high'}});
  let triangles=0,minCovered=Infinity,minHelper=Infinity;
  for(let lod=0;lod<5;lod++){
    const {geo,acc}=buildFaceSkin(lod);
    try{
      // This is the actual addHeadSkin -> Float32 builder attribute conversion.
      const head=acc.P.map((p,i)=>acc.hd[i]?p.clone().sub(HEAD_C).normalize():new THREE.Vector3());
      for(const v of head)v.set(Math.fround(v.x),Math.fround(v.y),Math.fround(v.z));
      for(let i=0;i<acc.idx.length;i+=3){
        const ids=acc.idx.slice(i,i+3),hd=ids.map(j=>acc.hd[j]),sub=ids.map(j=>acc.sub[j]);
        assert.ok(hd.every(x=>x===hd[0]),'head and non-head tags do not share a primitive');
        assert.ok(sub.every(x=>x===sub[0]),'sub-material tag is constant throughout each primitive');
        if(!hd[0]||sub[0]!==0)continue;
        const [a,b,c]=ids.map(j=>head[j]);
        // Nonnegative perspective weights inside the triangle keep their
        // projection on this unit direction above the old visible threshold.
        const center=a.clone().add(b).add(c).normalize();
        const covered=Math.min(a.dot(center),b.dot(center),c.dot(center));
        assert.ok(covered>0.5,`LOD ${lod} keeps every covered head fragment`);
        minCovered=Math.min(minCovered,covered);
        // Helper invocations can extrapolate beyond triangle barycentrics.
        // Distance of the complete affine plane from zero bounds all of them.
        const ab=b.clone().sub(a),ac=c.clone().sub(a),normal=ab.clone().cross(ac);
        const area=normal.length();
        assert.ok(area>1e-20,'the authored head-direction primitive has a defined affine plane');
        const helper=Math.abs(a.dot(normal))/area;
        assert.ok(helper>1e-4,`LOD ${lod} helper directions stay nonzero`);
        minHelper=Math.min(minHelper,helper);triangles++;
      }
    }finally{geo.dispose();}
  }
  assert.ok(minHelper<0.5,'the former threshold could split actual primitive helper invocations');
  assert.ok(triangles>70000,'all five generated face LODs were inspected');
  console.log(JSON.stringify({scope:'generated face primitive derivative gate; no hardware rasterization claim',triangles,minCovered,minHelper}));
});
