import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const adapter=fs.readFileSync(new URL('../adapter.mjs',import.meta.url).pathname,'utf8');
const start=adapter.indexOf('function adaptEnginePerformanceHotpaths('),end=adapter.indexOf('\nexport function qualityIdentity()',start);
const hot=vm.runInNewContext(adapter.slice(start,end)+'\nadaptEnginePerformanceHotpaths',{});
const edits=[];
hot('src/game/character-lod.js','',(c,old,updated,label)=>{edits.push({old,updated,label});return c});
assert.equal(edits.length,3);
// The original source continuation following the cluster-loop replacement; it is
// preserved by the optimization and is sufficient to exercise real geometry output.
const suffix=String.raw`
  out.setIndex(nc > 65535 ? new THREE.Uint32BufferAttribute(tris, 1) : new THREE.Uint16BufferAttribute(tris, 1));
  if (A.aMat && A.color) {
    const attributes = out.attributes, extras = [], splits = new Map(), remapped = [];
    for (let i = 0; i < tris.length; i++) {
      const cluster = tris[i], original = sourceCorners[i];
      const same = ['aMat', 'color'].every(name => {
        const a = A[name], b = attributes[name];
        for (let k = 0; k < a.itemSize; k++) if (a.getComponent(original, k) !== b.getComponent(cluster, k)) return false;
        return true;
      });
      if (same) { remapped.push(cluster); continue; }
      const values = [cluster];
      for (const name of ['aMat', 'color']) for (let k = 0; k < A[name].itemSize; k++) values.push(A[name].getComponent(original, k));
      const key = values.join(':');
      let index = splits.get(key);
      if (index === undefined) { index = nc + extras.length; splits.set(key, index); extras.push({ cluster, original }); }
      remapped.push(index);
    }
    if (extras.length) {
      for (const name in attributes) {
        const old = attributes[name], size = old.itemSize, arr = new old.array.constructor((nc + extras.length) * size);
        arr.set(old.array);
        for (let i = 0; i < extras.length; i++) {
          const e = extras[i], authored = name === 'color' || name === 'aMat', from = authored ? A[name] : old, index = authored ? e.original : e.cluster;
          for (let k = 0; k < size; k++) arr[(nc + i) * size + k] = from.array[index * size + k];
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, size, old.normalized));
      }
      out.setIndex(nc + extras.length > 65535 ? new THREE.Uint32BufferAttribute(remapped, 1) : new THREE.Uint16BufferAttribute(remapped, 1));
    }
  }
  out.userData = { ...src.userData, iwLod: 'far', cell };
  out.computeBoundingSphere();
  return out;
}
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
export function farGeometry(geo, target) {
  if (!geo || !geo.attributes || !geo.attributes.position) return geo;
  let c = _farCache.get(geo);
  if (c) return c;
  if (triCount(geo) <= target) { _farCache.set(geo, geo); return geo; }
  let cell = 0.018;
  let g = clusterDecimate(geo, cell);
  for (let it = 0; it < 3 && triCount(g) > target * 1.12; it++) {
    cell *= Math.sqrt(triCount(g) / target) * 1.02;
    g.dispose(); g = clusterDecimate(geo, cell);
  }
  _farCache.set(geo, g);
  return g;
}
`;
const baseline=edits[0].old+'\n'+edits[1].old+'\n'+suffix;
// Explicitly prove all three recorded transformations apply to the reconstructed source.
const upgraded=hot('src/game/character-lod.js',baseline,(c,old,updated,label)=>{
 const n=c.split(old).length-1; assert.equal(n,1,'transformation anchor '+label);return c.replace(old,updated);
});
class Attr {
 constructor(array,itemSize,normalized=false){this.array=array;this.itemSize=itemSize;this.normalized=normalized;this.count=array.length/itemSize}
 getComponent(i,k){return this.array[i*this.itemSize+k]};getX(i){return this.getComponent(i,0)};getY(i){return this.getComponent(i,1)};getZ(i){return this.getComponent(i,2)};setXYZ(i,x,y,z){this.array[i*3]=x;this.array[i*3+1]=y;this.array[i*3+2]=z}
}
class Geometry {constructor(){this.attributes={};this.userData={}}setAttribute(name,attr){this.attributes[name]=attr;return this}setIndex(attr){this.index=attr;return this}computeBoundingSphere(){}dispose(){} }
const THREE={BufferGeometry:Geometry,BufferAttribute:Attr,Uint32BufferAttribute:class extends Attr{constructor(a,s){super(Uint32Array.from(a),s)}},Uint16BufferAttribute:class extends Attr{constructor(a,s){super(Uint16Array.from(a),s)}}};
const a=vm.runInNewContext(baseline.replace(/export /g,'')+'\n({clusterDecimate,farGeometry})',{THREE});
const b=vm.runInNewContext(upgraded.replace(/export /g,'')+'\n({clusterDecimate,farGeometry})',{THREE});
let seed=9403;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
function input(n){
 const P=new Float32Array(n*3),N=new Float32Array(n*3),SI=new Uint16Array(n*4),SW=new Float32Array(n*4),EX=new Float32Array(n),CL=new Float32Array(n*2),TI=new Float32Array(n),MAT=new Float32Array(n),COLOR=new Float32Array(n*3);
 for(let i=0;i<n;i++){
  P[i*3]=((i%90)*.003+rnd()*.0005)-.135;
  P[i*3+1]=((Math.floor(i/90)%90)*.003+rnd()*.0005)-.135;
  P[i*3+2]=((Math.floor(i/8100)%90)*.003+rnd()*.0005)-.135;
  for(let k=0;k<3;k++)N[i*3+k]=k===1?1:0;
  SI[i*4]=i%3;SW[i*4]=1;
  EX[i]=i%4; CL[2*i]=i%3;CL[2*i+1]=i%2;TI[i]=-2; MAT[i]=i%9; COLOR[3*i]=i%10;COLOR[3*i+1]=i%3;COLOR[3*i+2]=1;
 }
 return {attributes:{position:new Attr(P,3),normal:new Attr(N,3),skinIndex:new Attr(SI,4),skinWeight:new Attr(SW,4),aEx:new Attr(EX,1),aCloth:new Attr(CL,2),aTint:new Attr(TI,1),aMat:new Attr(MAT,1),color:new Attr(COLOR,3)},index:null,userData:{source:'synthetic'}};
}
function compareGeo(g,h,msg){
 assert.deepEqual(Object.keys(g.attributes),Object.keys(h.attributes),msg+': names');
 assert.deepEqual(Array.from(g.index.array),Array.from(h.index.array),msg+': indexed triangle order');
 for(const key of Object.keys(g.attributes)){
  const x=g.attributes[key],y=h.attributes[key];assert.equal(x.itemSize,y.itemSize);assert.deepEqual(Array.from(x.array),Array.from(y.array),`${msg}: ${key}`);
 }
 assert.equal(JSON.stringify(g.userData),JSON.stringify(h.userData),msg+': metadata');
}
for(const n of [300,3000,15000]){
 const inp=input(n);
 for(const cell of [.018,.035,.08])compareGeo(a.clusterDecimate(inp,cell),b.clusterDecimate(inp,cell),`cluster ${n}/${cell}`);
 const x=a.farGeometry(inp,Math.max(10,n/6)),y=b.farGeometry(inp,Math.max(10,n/6));
 compareGeo(x,y,`farGeometry ${n}`);
}
console.log(JSON.stringify({status:'PASS',clusterGeoComparisons:9,farGeometryComparisons:3,verified:'position, normal, skin attributes, material/color corner split attributes, triangle index order and metadata are bit-identical on synthetic meshes'},null,2));
