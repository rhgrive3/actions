// Builder regression executed against emitted production module.
import path from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const {createGoldfishMask,GOLDFISH_MASK_FIT}=await import(pathToFileURL(path.join(process.env.INKWAVE_HEADGEAR_SITE,'patches/local-quality/headgear/goldfish-mask.js')).href);
assert.equal(GOLDFISH_MASK_FIT.preserveHair,true);assert.equal(GOLDFISH_MASK_FIT.rim,undefined);
let previous=Infinity;const results=[];
for(const lod of ['hero','game','far']){
 const o=createGoldfishMask({lod});const st=o.userData.stats;assert(st.triangles<previous);previous=st.triangles;assert.equal(st.meshes,4);assert.equal(st.textures,2);
 const box=new THREE.Box3().setFromObject(o);assert(box.min.x<-.17&&box.max.x>.17);assert(box.max.y>.36&&box.max.y<.4);assert(box.min.z<-.18&&box.max.z<.23);
 const geos=new Set(),mats=new Set(),tex=new Set();o.traverse(m=>{if(!m.isMesh)return;geos.add(m.geometry);mats.add(m.material);for(const k of ['map','metalnessMap','roughnessMap'])if(m.material[k])tex.add(m.material[k]);for(const attr of Object.values(m.geometry.attributes))assert(Array.from(attr.array).every(Number.isFinite));});
 // Open eye apertures: rays through the photographed eye centres must not hit shell.
 const shell=o.children.find(m=>m.name==='ivory-and-flat-goldfish-art');shell.updateMatrixWorld();for(const x of [-.0816,.0792]){const ray=new THREE.Raycaster(new THREE.Vector3(x,.1676,.5),new THREE.Vector3(0,0,-1),0,.4);assert.equal(ray.intersectObject(shell).length,0);}
 // Image-to-local Y inversion must be reflected in the winding, not only normals.
 // gl_FrontFacing uses winding; DoubleSide flips lighting normals on back-facing triangles.
 for(const name of ['ivory-and-flat-goldfish-art','inner-lining']){
  const panel=o.children.find(m=>m.name===name),p=panel.geometry.attributes.position,n=panel.geometry.attributes.normal;
  for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);const geometric=b.sub(a).cross(c.sub(a));const facing=name==='inner-lining'?-1:1;assert(geometric.z*facing>=-1e-12,'Panel winding must face intended side');for(let k=0;k<3;k++){const nn=new THREE.Vector3().fromBufferAttribute(n,i+k);assert(nn.z*facing>0,'Normal must face intended side');assert(geometric.dot(nn)>0,'Geometric winding and lighting normal must agree');}}
 }
 for(const mesh of o.children){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),f=b.sub(a).cross(c.sub(a));for(let k=0;k<3;k++)assert(f.dot(new THREE.Vector3().fromBufferAttribute(n,i+k))>0,'Every authored normal must agree with geometric face');}}
 const material=shell.material;assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(material.metalnessMap.colorSpace,THREE.NoColorSpace);assert.equal(material.emissive.getHex(),0);
 assert.equal(material.map.image.width,lod==='hero'?512:lod==='game'?256:128);assert.equal(material.map.magFilter,THREE.LinearFilter);assert.equal(material.map.minFilter,THREE.LinearMipmapLinearFilter);assert(material.map.generateMipmaps);
 const packed=material.metalnessMap.image.data;let edgePixels=0;for(let i=0;i<packed.length;i+=4)if(![10,60,190].includes(packed[i+2]))edgePixels++;assert(edgePixels>100,'Artwork edges must contain subpixel fractional coverage');
 const rgba=o.children[0].material.map.image.data;const before=Array.from(rgba);o.setInkColor(0xff2277);let changed=0;for(let i=0;i<rgba.length;i++)if(before[i]!==rgba[i])changed++;assert(changed>100);assert.deepEqual(Array.from(rgba.slice(0,4)),before.slice(0,4));
 let disposed=0;for(const r of [...geos,...mats,...tex])r.addEventListener('dispose',()=>disposed++);o.dispose();o.dispose();assert.equal(disposed,geos.size+mats.size+tex.size);results.push({lod,...st,bounds:{min:box.min.toArray(),max:box.max.toArray()},changedInkChannels:changed,antialiasedBoundaryPixels:edgePixels,textureResolution:material.map.image.width});
}
assert.throws(()=>createGoldfishMask({lod:'bad'}),RangeError);console.log(JSON.stringify({passed:true,results},null,2));
