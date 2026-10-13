import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Inspect actual primitive buffers before Pieces merges/disposes them. No rendering or test-only
// production exports are needed, and the assertions do not depend on the chosen strip dimensions.
const captured=async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export {Pieces} from './patches/splatoon3/runtime/weapon-models/kit.mjs';\nexport {getWeaponDef} from './inkwave-public/src/game/character-weapons.js';\nexport {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 const pieces=[],original=f.Pieces.prototype.add;
 f.Pieces.prototype.add=function(g,...args){if((g.type==='TorusGeometry'&&g.parameters.arc>Math.PI*2+1)||(g.type==='TubeGeometry'&&g.parameters.radius===1))pieces.push({g:g.clone(),type:g.type,parameters:g.parameters});return original.call(this,g,...args);};
 try{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.getWeaponDef('s3-spinner-serein');}finally{f.Pieces.prototype.add=original;}
 return{f,pieces};
};
function topology(pieces){
 const positions=[],indices=[];for(const{g}of pieces){const p=g.attributes.position,offset=positions.length;for(let i=0;i<p.count;i++)positions.push([p.getX(i),p.getY(i),p.getZ(i)]);indices.push(...Array.from(g.index.array,i=>i+offset));}
 const ids=[],weld=new Map(),edges=new Map();for(const pos of positions){const key=pos.map(x=>Math.round(x*1e6)).join(',');if(!weld.has(key))weld.set(key,weld.size);ids.push(weld.get(key));}
 for(let i=0;i<indices.length;i+=3){const v=indices.slice(i,i+3);for(let k=0;k<3;k++){const x=ids[v[k]],y=ids[v[(k+1)%3]];assert.notEqual(x,y,'strip triangle must not collapse after 1µm seam welding');const key=x<y?x+','+y:y+','+x,e=edges.get(key)||{count:0,sign:0};e.count++;e.sign+=x<y?1:-1;edges.set(key,e);}}
 return{boundary:[...edges.values()].filter(v=>v.count===1).length,nonManifold:[...edges.values()].filter(v=>v.count>2).length,winding:[...edges.values()].filter(v=>v.count===2&&v.sign!==0).length};
}
test('Nautilus strip has outward normals and a closed, consistently wound coil-to-return seam',async()=>{
 const {f,pieces}=await captured();assert.equal(pieces.length,2,'one coil and one continuous return strip');
 for(const {g,type,parameters}of pieces){
  const p=g.attributes.position,n=g.attributes.normal,radial=parameters.radialSegments,steps=parameters.tubularSegments;
  const vertex=(u,j)=>type==='TorusGeometry'?j*(steps+1)+u:u*(radial+1)+j;
  for(let u=0;u<=steps;u++){
   const center=new f.THREE.Vector3();for(let j=0;j<radial;j++)center.add(new f.THREE.Vector3().fromBufferAttribute(p,vertex(u,j)));center.divideScalar(radial);
   for(let j=0;j<=radial;j++){const k=vertex(u,j),out=new f.THREE.Vector3().fromBufferAttribute(p,k).sub(center).normalize(),normal=new f.THREE.Vector3().fromBufferAttribute(n,k);assert.ok(out.dot(normal)>.15,`${type} strip normal points inward or nearly tangent at ${u}/${j}`);}
  }
 }
 assert.deepEqual(topology(pieces),{boundary:0,nonManifold:0,winding:0},'both cut cross-sections meet the return strip, with no uncapped cut end or inverted wall');
 for(const {g}of pieces)g.dispose();
});
