import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {isolateHeadForDiagnostic} from '../../../tools/headgear-production-multiview/isolate-head.mjs';
const site=process.env.INKWAVE_HEADGEAR_SITE,load=p=>import(pathToFileURL(path.join(site,p)).href),hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const {G}=await load('src/core/ctx.js'),{install}=await load('patches/splatoon3/runtime/install.mjs');install(JSON.parse(fs.readFileSync(path.join(site,'patches/splatoon3/profile.json'))));const {Character}=await load('src/game/character.js');
test('isolated construction view preserves head/hair/gear attributes and restores every geometry and visibility',()=>{
 G.settings={quality:'high'};
 for(const hat of [8,9,10,11])for(const lod of ['hero','game','far']){
  const c=new Character({sourceMotion:false,style:{hat,hair:5}});c.onEvent=null;c.setLod(lod);
  try{const before=[];c.root.traverse(o=>{if(o.isMesh)before.push({o,geo:o.geometry,visible:o.visible,attrs:Object.entries(o.geometry.attributes).map(([key,a])=>[key,a,hash(a.array)])});});
   const isolated=isolateHeadForDiagnostic(c);assert.equal(isolated.receipt.label,'isolated-head-under-construction-only');assert(isolated.receipt.objects.some(x=>x.action==='hidden-below-neck'));assert(isolated.receipt.objects.some(x=>x.name.startsWith('kid:skin:')&&x.retainedTriangles>0));
   for(const {o,geo,attrs}of before){for(const [key,a,digest]of attrs){assert.equal(hash(a.array),digest,'shared attribute untouched');if(o.geometry!==geo)assert.equal(o.geometry.attributes[key],a,'index view reuses original attributes');}if(/^kid:(hair|eyes):/.test(o.name))assert.equal(o.geometry,geo,'hair/eyes entire original geometry');for(let p=o;p;p=p.parent)if(p===c.bones.head)assert.equal(o.geometry,geo,'head-bone gear geometry untouched');}
   isolated.restore();isolated.restore();for(const{o,geo,visible}of before){assert.equal(o.geometry,geo);assert.equal(o.visible,visible);}
  }finally{c.dispose();}
 }
});
