import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const {fixture}=await import(process.env.WEAPON_LOD_FIXTURE || './source-fixture.mjs');
const candidate=path.resolve(process.env.WEAPON_LOD_CANDIDATE||path.join(ROOT,'inkwave-public/src/game/character-lod.js'));
const baseline=process.env.WEAPON_LOD_BASELINE && path.resolve(process.env.WEAPON_LOD_BASELINE);
let cached;const context=()=>cached??=fixture({fullRuntime:true,productionComposition:true,extraExports:`
 export {clusterDecimate,farGeometry} from '${candidate}';
 ${baseline?`export {clusterDecimate as beforeCluster,farGeometry as beforeFar} from '${baseline}';`:''}
 export {getWeaponDef} from './inkwave-public/src/game/character-weapons.js';
 export {registeredWeaponModels} from './patches/splatoon3/runtime/weapon-models/registry.mjs';
 export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';
`}).then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;});
function synthetic(THREE,indexed=true,weapon=true,gradient=false){
 const g=new THREE.BufferGeometry(),positions=[0,0,0,2,0,0,0,2,0,.04,.04,.04,0,0,2,2,0,2];
 g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(Array(6).fill([0,1,0]).flat(),3));
 g.setAttribute('aTint',new THREE.Float32BufferAttribute([.1,.2,.3,.4,.5,.6],1));
 if(weapon){g.setAttribute('aMat',new THREE.Float32BufferAttribute([0,0,0,3,3,3],1));g.setAttribute('color',new THREE.Float32BufferAttribute([0,.3,0,1,gradient?.1:0,gradient?.2:.3,gradient?.3:0,gradient?.5:1,0,.3,0,1,1,1,1,1,1,1,1,1,1,1,1,1],4));}
 if(indexed)g.setIndex([0,1,2,3,4,5]);return g;
}
function indexed(g,names){const h=crypto.createHash('sha256');const ii=g.index.array;for(const name of names){const a=g.attributes[name];const arr=new Float32Array(ii.length*a.itemSize);for(let i=0;i<ii.length;i++)for(let k=0;k<a.itemSize;k++)arr[i*a.itemSize+k]=a.getComponent(ii[i],k);h.update(Buffer.from(arr.buffer));}return h.digest('hex');}
function bytes(g){return g.index.array.byteLength+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0);}
function mixed(g,name){const a=g.attributes[name],ii=g.index.array;if(!a)return 0;let count=0;for(let i=0;i<ii.length;i+=3){const values=[0,1,2].map(j=>Array.from({length:a.itemSize},(_,k)=>a.getComponent(ii[i+j],k)).join(','));if(new Set(values).size>1)count++;}return count;}
test('surviving weapon corners retain authored material and RGBA, including gradients',async()=>{const f=await context();for(const isIndexed of[true,false])for(const gradient of[false,true]){const src=synthetic(f.THREE,isIndexed,true,gradient),out=f.clusterDecimate(src,1);assert.equal(out.index.count,6);for(let corner=0;corner<6;corner++)for(const name of['aMat','color'])for(let k=0;k<src.attributes[name].itemSize;k++)assert.equal(out.attributes[name].getComponent(out.index.getX(corner),k),src.attributes[name].getComponent(corner,k),`${name}/${corner}/${k}`);if(baseline)assert.ok(mixed(f.beforeCluster(src,1),'aMat')>0,'old path reproduces cross-material pollution');}});
test('nonweapon clustering stays byte-identical and the existing cache stays stable',{skip:!baseline},async()=>{const f=await context();for(const indexed of[true,false]){const src=synthetic(f.THREE,indexed,false),a=f.beforeCluster(src,1),b=f.clusterDecimate(src,1);assert.deepEqual(Buffer.from(a.index.array.buffer),Buffer.from(b.index.array.buffer));for(const name of Object.keys(a.attributes))assert.deepEqual(Buffer.from(a.attributes[name].array.buffer),Buffer.from(b.attributes[name].array.buffer));}const src=synthetic(f.THREE);const far=f.farGeometry(src,1);assert.equal(far,f.farGeometry(src,1));});
test('all 65 weapons retain triangle positions, normals, tint, source geometry and cache identity',{skip:!baseline},async()=>{const f=await context(),ids=[...new Set([...f.registeredWeaponModels(),'slosher'])];assert.equal(ids.length,65);const rows=[];let oldBytes=0,newBytes=0;
 for(const id of ids){const d=f.getWeaponDef(id),row={id};for(const [part,target]of[['body',700],['ink',300]]){const src=d[part],names=Object.keys(src.attributes),original=indexed(src,names),a=f.beforeFar(src,target),t=performance.now(),b=f.farGeometry(src,target),coldBuildMs=performance.now()-t;assert.equal(b,f.farGeometry(src,target));assert.equal(indexed(src,names),original,id+' source immutable');assert.equal(a.index.count,b.index.count,id+'/'+part+' triangle count');assert.equal(indexed(a,['position']),indexed(b,['position']),id+'/'+part+' silhouette');assert.equal(indexed(a,names.filter(n=>!['position','color','aMat'].includes(n))),indexed(b,names.filter(n=>!['position','color','aMat'].includes(n))),id+'/'+part+' normal/tint/animation attributes');assert.ok(mixed(b,'aMat')<=mixed(src,'aMat'),id+'/'+part+' no new material interpolation');assert.ok(mixed(b,'color')<=mixed(src,'color'),id+'/'+part+' only authored colour gradients');oldBytes+=bytes(a);newBytes+=bytes(b);row[part]={triangles:b.index.count/3,beforeBytes:bytes(a),afterBytes:bytes(b),mixedMaterialBefore:mixed(a,'aMat'),mixedMaterialAfter:mixed(b,'aMat'),mixedColorSource:mixed(src,'color'),mixedColorAfter:mixed(b,'color'),coldBuildMs};}assert.ok((row.body.afterBytes+row.ink.afterBytes)/(row.body.beforeBytes+row.ink.beforeBytes)<2,id+' geometry allocation growth bounded');rows.push(row);}
 assert.ok(newBytes<oldBytes*1.20,'all-65 cached geometry growth below 20%; not a simultaneous-visible claim');if(process.env.WEAPON_LOD_REPORT)fs.writeFileSync(process.env.WEAPON_LOD_REPORT,JSON.stringify({models:ids.length,oldBytes,newBytes,rows},null,2));console.log('WEAPON_LOD_BOUNDARIES '+JSON.stringify({models:ids.length,oldBytes,newBytes}));
});
