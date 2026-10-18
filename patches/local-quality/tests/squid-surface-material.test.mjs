import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptS3SquidLook} from '../s3-squid-look-adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
test('squid eye material addition preserves entire human eye factory and owns disposal',()=>{
 const s=raw('src/game/character-mats.js'),o=adaptS3SquidLook('src/game/character-mats.js',s);
 const start=s.indexOf('export function makeEyeMaterial('),end=s.indexOf('export function makeSquidMaterial(');
 assert(o.includes(s.slice(start,end)),'human eye shader bytes unchanged');
 assert.throws(()=>adaptS3SquidLook('src/game/character-mats.js',o),/conflict/);
 const c=adaptS3SquidLook('src/game/character.js',raw('src/game/character.js'));
 assert(c.includes('new THREE.Mesh(sh.eyes, this.mats.squidEye)'));
 assert(c.includes("'eye', 'squidEye', 'fill'"));
});
test('actual source-loaded actor isolates squid eyes at all LODs and disposes once',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});const a=await f.make(),c=a.character;
 assert(c.mats.eye!==c.mats.squidEye);assert.equal(c.squid.eyes.material,c.mats.squidEye);
 for(const lod of ['hero','game','far']){c.setLod(lod);assert.equal(c.squid.eyes.material,c.mats.squidEye);
  const g=c.squid.body.geometry,p=g.attributes.position,e=g.attributes.aEx,col=g.attributes.color,uv=g.attributes.uv;
  let maxDepth=0,shortMin=Infinity,shortMax=-Infinity,shortN=0;
  for(let i=0;i<p.count;i++){
   assert(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
   if(e.getX(i)===0)maxDepth=Math.max(maxDepth,Math.abs(p.getZ(i)));
   const k=Math.round(col.getZ(i)*10)%10;
   if(e.getX(i)!==0&&e.getX(i)!==2&&k!==0&&k!==9&&uv.getX(i)>.65){shortMin=Math.min(shortMin,p.getX(i));shortMax=Math.max(shortMax,p.getX(i));shortN++;}
  }
  assert(maxDepth<.074&&maxDepth>.065,'flattened mantle preserves nonzero thickness');
  assert(shortN>0&&shortMax-shortMin<.17,'short tips form a compact group');
  assert(g.index.count/3<18000,'bounded triangle cost');
 }
 const g=c.squid.body.geometry,co=g.attributes.color,ex=g.attributes.aEx;let marked=0,cups=0;for(let i=0;i<co.count;i++)if(ex.getX(i)>.5&&co.getX(i)<-.05){const arm=Math.round(co.getZ(i)*10)%10;assert(arm===0||arm===9,'only two long feelers carry dark coating');marked++;if(ex.getX(i)===2)cups++;}assert(marked>0);for(let i=0;i<co.count;i++)if(ex.getX(i)===2){const k=Math.round(co.getZ(i)*10)%10;assert(k===0||k===9,'short lobes omit microcup geometry');}
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'};
 c.mats.squidEye.onBeforeCompile(shader);assert(shader.fragmentShader.includes('float pupil='));assert(!shader.fragmentShader.includes('uIris'));assert(!shader.fragmentShader.includes('sin(ang'));
 const bodyShader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'};c.mats.squid.onBeforeCompile(bodyShader);assert(bodyShader.fragmentShader.includes('smoothstep(0.05,0.25,cs)'));assert(bodyShader.fragmentShader.includes('fwidth(d),0.03'));
 let disposed=0;c.mats.squidEye.addEventListener('dispose',()=>disposed++);f.reset();assert.equal(disposed,1);
});
