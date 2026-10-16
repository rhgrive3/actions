// Sorella-only canopy finish against PR1271 a553 / brellas blob 0ec834c1.
// Broad source-icon regions; exact logos and ink-mask boundary remain unqualified.
import { THREE, Pieces, M, sphere } from './kit.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODELS } from './brellas.mjs';
const TAU=Math.PI*2,SH=.075;
function fabric(map, u0 = 0, u1 = 1, v0 = 0, v1 = 1, nu = 6, nv = 3, thickness = 0.002) {
  const pos = [], ix = [], row = nv + 1, count = (nu + 1) * row;
  for (let skin = 0; skin < 2; skin++) for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const q = map(u0 + (u1 - u0) * i / nu, v0 + (v1 - v0) * j / nv);
    pos.push(q[0], q[1], q[2] - skin * thickness);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
    ix.push(a, b, d, b, c, d, a + count, d + count, b + count, b + count, d + count, c + count);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ix); g.computeVertexNormals(); return g;
}
/** A polygonal gore: sewn radial edges and a lightly hollowed hem, not a round disc. */
function gore(k, R, depth, zH, n, power = 1.6, billow = 0.014, hemInset = 0.018) {
  const a = k * TAU / n, b = (k + 1) * TAU / n;
  return (u, t) => {
    const hem = 1 - hemInset * Math.sin(Math.PI * t) * u ** 3;
    return [R * u * hem * ((1 - t) * Math.cos(a) + t * Math.cos(b)),
      SH + R * u * hem * ((1 - t) * Math.sin(a) + t * Math.sin(b)),
      zH - depth * u ** power + billow * Math.sin(Math.PI * t) * Math.sin(Math.PI * u)];
  };
}

function subset(g, indices) {
 const out=new THREE.BufferGeometry(), ids=[],lookup=new Map(), ix=[];
 for(const id of indices){if(!lookup.has(id)){lookup.set(id,ids.length);ids.push(id);}ix.push(lookup.get(id));}
 for(const [name,a] of Object.entries(g.attributes)){
  const data=new a.array.constructor(ids.length*a.itemSize);
  ids.forEach((id,i)=>{for(let j=0;j<a.itemSize;j++)data[i*a.itemSize+j]=a.array[id*a.itemSize+j];});
  out.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize,a.normalized));
 }
 out.setIndex(ix);return out;
}
const equal=(a,i,c)=>Math.abs(a.getX(i)-c.r)<1e-6&&Math.abs(a.getY(i)-c.g)<1e-6&&Math.abs(a.getZ(i)-c.b)<1e-6;
const base=MODELS['s3-shelter-normal'];
export const FOLLOWUP_MODELS=Object.freeze({Shelter_Normal_01:Object.freeze({
 ...base,baseId:'s3-shelter-normal',sourceRow:'Shelter_Normal_01',name:'Sorella Brella',
 sourceUrl:'https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/images/weapon/Wst_Shelter_Normal_01.png',
 fidelity:'Broad black center, team-colored hem, yellow fittings; authored .67 radial boundary, source graphics pending.',
 build(d){
  d=base.build(d);
  const old=d.parts.canopy.src, inkOld=d.parts.canopyInk.src, col=old.attributes.color, mat=old.attributes.aMat;
  const rib=new THREE.Color('#333938'),black=new THREE.Color('#171a1c'),kept=[];
  for(let i=0;i<old.index.count;i+=3){
   const ids=[0,1,2].map(j=>old.index.getX(i+j));
   if(ids.every(v=>mat.getX(v)!==M.print&&(equal(col,v,rib)||equal(col,v,black))))kept.push(...ids);
  }
  if(!kept.length)throw Error('Sorella source hardware binding absent');
  const hardware=subset(old,kept), fixed=new Pieces(), ink=new Pieces();
  for(let k=0;k<8;k++){
   const map=gore(k,.4,.2,.6,8);
   // Same tessellation bound the base Brella canopy received (762902f8:
   // fabric 8x3 -> 4x2, 3x3 -> 2x2, spheres 8x5 -> 6x3); dimensions unchanged.
   fixed.add(fabric(map,.02,.67,0,1,4,2),'#242528',M.satin);
   ink.add(fabric(map,.67,1,0,1,2,2),'#69cbb1',M.satin);
   const a=k*TAU/8,u=1.018;
   fixed.add(sphere(.009,.009,.014,Math.cos(a)*.4*u,SH+Math.sin(a)*.4*u,.6-.2*u**1.6-.004,6,3),'#f2ca24',M.satin);
  }
  for(const parts of [fixed,ink])parts.transform(g=>{g.translate(0,-SH,-.6).scale(.11,.11,2.15).translate(0,SH,.6);g.computeVertexNormals();});
  const cloth=fixed.build(), combined=mergeGeometries([hardware,cloth],false);
  if(!combined)throw Error('Sorella native attribute mismatch');
  hardware.dispose();cloth.dispose();old.dispose();inkOld.dispose();
  d.parts.canopy.src=combined;d.parts.canopyInk.src=ink.build();
  const blue=new THREE.Color('#283bc1'),nozzle=new THREE.Color('#171a1c'),yellow=new THREE.Color('#f2ca24');
  for(const g of [d.body,d.parts.trigger.src]){
   const c=g.attributes.color.clone(),pos=g.attributes.position;
   for(let i=0;i<c.count;i++)if(equal(c,i,blue)||(equal(c,i,nozzle)&&pos.getZ(i)>.57))c.setXYZ(i,yellow.r,yellow.g,yellow.b);
   g.setAttribute('color',c);
  }
  return d;
 }
})});
