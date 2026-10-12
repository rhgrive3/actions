import fs from 'node:fs';
import crypto from 'node:crypto';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
const base=process.env.MODEL_BASELINE_DIR;
const f=await fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,adaptRuntime:(rel,s)=>base&&/weapon-models\/(dualies|sloshers)\.mjs$/.test(rel)?fs.readFileSync(`${base}/${rel.split('/').at(-1).replace('.mjs','.before.mjs')}`,'utf8'):s,extraExports:"export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js';\nexport { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
const pinned=JSON.parse(fs.readFileSync(new URL('../patches/splatoon3/tests/fixtures/quad-explosher-main-contracts.json',import.meta.url))).models;
const ids=Object.keys(pinned);if(process.env.MODEL_SNAPSHOT_REVERSE)ids.reverse();
const all={};
for(const id of ids){
 const d=f.getWeaponDef(id),h=crypto.createHash('sha256');let bytes=0,triangles=0;
 for(const g of[d.body,d.ink]){triangles+=g.index.count/3;for(const a of Object.values(g.attributes)){h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));bytes+=a.array.byteLength;}h.update(Buffer.from(g.index.array.buffer));bytes+=g.index.array.byteLength;}
 const channels=Object.fromEntries(Object.entries(d.parts).map(([k,p])=>[k,{pivot:Array.from(p.pivot.toArray()),mat:p.mat}]));
 const socket=k=>({pos:Array.from(d[k].pos.toArray()),quat:Array.from(d[k].quat.toArray())});
 d.body.computeBoundingBox();all[id]={muzzle:Array.from(d.muzzle.toArray()),handR:socket('handR'),handL:socket('handL'),inHand:socket('inHand'),dual:d.dual??false,channels,geometryHash:h.digest('hex'),triangles,bytes,bounds:{min:Array.from(d.body.boundingBox.min.toArray()),max:Array.from(d.body.boundingBox.max.toArray())}};
}
if(process.argv.includes('--out'))fs.writeFileSync(process.argv[process.argv.indexOf('--out')+1],JSON.stringify(all,null,2)+'\n');else console.log(JSON.stringify(all,null,2));

console.log('QUAD_EXPLOSHER_SNAPSHOT '+JSON.stringify({node:process.version,reverse:!!process.env.MODEL_SNAPSHOT_REVERSE,models:Object.fromEntries(Object.entries(all).filter(([id])=>pinned[id].geometryHash).map(([id,row])=>[id,{sameRuntime:row.geometryHash,pinnedNode24:pinned[id].geometryHash}]))}));
