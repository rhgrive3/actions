import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
const original=fs.readFileSync(new URL('../reference/weapon-models/squeezer-stripes-f7.mjs.txt',import.meta.url),'utf8');
const opts={fullRuntime:true,includeCharacter:true,productionComposition:true,extraExports:"export {getWeaponDef} from './inkwave-public/src/game/character-weapons.js';"};
const name='patches/splatoon3/runtime/weapon-models/shooters-b.mjs';
function bits(a,index){return Buffer.from(a.array.buffer,a.array.byteOffset+index*a.itemSize*a.array.BYTES_PER_ELEMENT,a.itemSize*a.array.BYTES_PER_ELEMENT);}
function bytes(g){return Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+g.index.array.byteLength;}
test('Squeezer skips only unreferenced stripe vertices; expanded attributes, order and bounds stay exact; far output is measured',async()=>{
 const current=await fixture(opts),before=await fixture({...opts,adaptRuntime:(rel,code)=>{if(rel!==name)return code;const a=code.indexOf('  const stripePos=[]'),b=code.indexOf('  // Broad stainless straps',a);assert(a>=0&&b>a);return code.slice(0,a)+original+code.slice(b);}});
 const a=current.getWeaponDef('s3-shooter-flash'),b=before.getWeaponDef('s3-shooter-flash'),ga=a.parts.can.geo,gb=b.parts.can.geo;
 assert.equal(gb.attributes.position.count-ga.attributes.position.count,9480);
 assert.equal(bytes(gb)-bytes(ga),379200);assert.equal(ga.index.count,gb.index.count);
 assert.deepEqual(Object.keys(ga.attributes),Object.keys(gb.attributes));
 for(const key of Object.keys(ga.attributes)){const x=ga.attributes[key],y=gb.attributes[key];assert.equal(x.itemSize,y.itemSize);assert.equal(x.normalized,y.normalized);for(let i=0;i<ga.index.count;i++)assert(bits(x,ga.index.array[i]).equals(bits(y,gb.index.array[i])),key+' triangle attribute '+i);}
 const bounds=g=>{g.computeBoundingBox();g.computeBoundingSphere();return{box:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],sphere:[g.boundingSphere.center.toArray(),g.boundingSphere.radius]};};assert.deepEqual(JSON.parse(JSON.stringify(bounds(ga))),JSON.parse(JSON.stringify(bounds(gb))));
 for(const[key,x]of Object.entries({body:a.bodyStatic,ink:a.inkStatic})){const y={body:b.bodyStatic,ink:b.inkStatic}[key];if(!x&&!y)continue;assert.equal(x.index.count,y.index.count,key);for(const k of Object.keys(x.attributes))assert(Buffer.from(x.attributes[k].array.buffer).equals(Buffer.from(y.attributes[k].array.buffer)),key+'/'+k);assert(Buffer.from(x.index.array.buffer).equals(Buffer.from(y.index.array.buffer)),key+'/index');}
 const actors=[current,before].map(f=>new f.Actor({team:0,weapon:'s3-shooter-flash',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}));
 for(const a of actors){a.character.actor=a;a.character.onEvent=null;a.character.setLod('far');a._finishFrame(1/60);}
 const fa=actors[0].character.weapon.bodyFar.geometry,fb=actors[1].character.weapon.bodyFar.geometry;console.log('FAR_COMPACT '+JSON.stringify({before:{bytes:bytes(fb),tri:fb.index.count/3},after:{bytes:bytes(fa),tri:fa.index.count/3},attributesEqual:Object.keys(fa.attributes).every(k=>Buffer.from(fa.attributes[k].array.buffer).equals(Buffer.from(fb.attributes[k].array.buffer)))}));const farDifferences={};for(const k of Object.keys(fa.attributes)){let changed=0,maxAbs=0;const x=fa.attributes[k],y=fb.attributes[k];for(let i=0;i<Math.min(fa.index.count,fb.index.count);i++){const ia=fa.index.array[i],ib=fb.index.array[i];if(!bits(x,ia).equals(bits(y,ib)))changed++;for(let c=0;c<x.itemSize;c++)maxAbs=Math.max(maxAbs,Math.abs(x.getComponent(ia,c)-y.getComponent(ib,c)));}farDifferences[k]={changed,maxAbs};}assert.equal(fa.index.count,fb.index.count,'far triangle count');assert.equal(farDifferences.color.changed,0,'far corner colours');assert.equal(farDifferences.aMat.changed,0,'far corner surfaces');console.log('FAR_EXPANDED '+JSON.stringify(farDifferences));for(const a of actors)a.character.dispose();
 console.log('SQUEEZER_COMPACTION '+JSON.stringify({before:bytes(gb),after:bytes(ga),saved:379200,triangles:ga.index.count/3}));
});
