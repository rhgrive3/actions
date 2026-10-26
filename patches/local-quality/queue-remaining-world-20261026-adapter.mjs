import {adaptReviewedWorldCarryover20261026} from './queue-reviewed-world-carryover-20261026-adapter.mjs';
// Final source-only queue refinements. Upstream inputs and geometry formulas
// remain unchanged; anchors are checked against the fully composed build.
function once(code,before,after){
 if(code.split(before).length!==2)throw Error('Remaining world queue anchor: '+before.slice(0,100));
 return code.replace(before,after);
}
const MARINA_STAGING=`// Positions and normals stay Float64 until winding/degeneracy decisions are
// complete. Colors and integer indices can use their final precision at once.
class IWMarinaStaging {
 constructor(){this.p=new Float64Array(192);this.n=new Float64Array(192);this.c=new Float32Array(192);this._i=new Uint32Array(192);this._vc=0;this._ic=0;this._max=-1;}
 _vertex(x,y,z,nx,ny,nz,r,g,b){const o=this._vc*3;if(o+3>this.p.length){const cap=Math.ceil(this.p.length*1.5/3)*3;for(const key of ['p','n','c']){const a=new this[key].constructor(cap);a.set(this[key]);this[key]=a;}}this.p[o]=x;this.p[o+1]=y;this.p[o+2]=z;this.n[o]=nx;this.n[o+1]=ny;this.n[o+2]=nz;this.c[o]=r;this.c[o+1]=g;this.c[o+2]=b;return this._vc++;}
 _triangle(a,b,c){const o=this._ic;if(o+3>this._i.length){const next=new Uint32Array(Math.ceil(this._i.length*1.5/3)*3);next.set(this._i);this._i=next;}this._i[o]=a;this._i[o+1]=b;this._i[o+2]=c;this._ic+=3;this._max=Math.max(this._max,a,b,c);}
 _geometry(THREE){const g=new THREE.BufferGeometry(),n=this._vc*3;g.setAttribute('position',new THREE.Float32BufferAttribute(this.p.subarray(0,n),3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n.subarray(0,n),3));g.setAttribute('color',new THREE.BufferAttribute(this.c.slice(0,n),3));const I=this._max>=65535?Uint32Array:Uint16Array;g.setIndex(new THREE.BufferAttribute(new I(this._i.subarray(0,this._ic)),1));return g;}
}
`;
const LAMP_MERGE=`// Stream shared lamp templates into the final indexed meshes. Apply the
// same Three.js transforms, including normal renormalization and Float32 writes.
function iwMergeLampParts(parts){
 let count=0,indexCount=0,maximum=-1;
 for(const p of parts){const P=p.g.attributes.position,I=p.g.index;indexCount+=I?I.count:P.count;if(I){for(let i=0;i<I.count;i++)maximum=Math.max(maximum,count+I.getX(i));}else maximum=Math.max(maximum,count+P.count-1);count+=P.count;}
 const position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),Index=maximum>=65535?Uint32Array:Uint16Array,indices=new Index(indexCount);
 const point=new THREE.Vector3(),matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();let at=0,io=0;
 for(const p of parts){const g=p.g,P=g.attributes.position,N=g.attributes.normal,I=g.index,base=at;matrix.makeTranslation(p.x,p.y,p.z);normalMatrix.getNormalMatrix(matrix);const c=new THREE.Color(p.color).multiplyScalar(p.k??1),cr=Math.fround(c.r),cg=Math.fround(c.g),cb=Math.fround(c.b);
  for(let i=0;i<P.count;i++,at++){const o=at*3;point.fromBufferAttribute(P,i).applyMatrix4(matrix);position[o]=point.x;position[o+1]=point.y;position[o+2]=point.z;point.fromBufferAttribute(N,i).applyNormalMatrix(normalMatrix);normal[o]=point.x;normal[o+1]=point.y;normal[o+2]=point.z;color[o]=cr;color[o+1]=cg;color[o+2]=cb;}
  const n=I?I.count:P.count;for(let i=0;i<n;i++)indices[io++]=base+(I?I.getX(i):i);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(position,3));g.setAttribute('normal',new THREE.BufferAttribute(normal,3));g.setAttribute('color',new THREE.BufferAttribute(color,3));const Attribute=maximum>=65535?THREE.Uint32BufferAttribute:THREE.Uint16BufferAttribute;g.setIndex(new Attribute(indices.buffer,1));return g;
}
`;
// Authored modules own these changes directly; the build adapter leaves them intact.
export const WORLD_DIRECT_PATHS = Object.freeze(["src/game/nav.js","src/game/character-lod.js","src/game/motion/source-bank.js","src/world/props-core.js","src/world/props-marina-vessels.js"]);
export const WORLD_REMAINING_PATHS = Object.freeze([
 'src/game/character.js','src/game/cameraRig.js','src/core/shadowcache.js',
 'src/game/nav.js','src/world/render-bounds.js','src/world/level.js',
 'src/world/environment.js','src/world/props-core.js','src/game/character-geo.js',
 'src/game/character-lod.js','src/game/character-face.js','src/game/motion/source-bank.js',
 'src/game/motion/source-controller.js','src/game/motion/locomotion-profile.js',
 'src/game/motion/hair-targets.js','src/game/showcase.js','src/world/decor.js',
 'src/world/props-marina-vessels.js','src/world/props-marina-dock.js',
]);
export function adaptRemainingWorld20261026(rel,code){
 code=adaptReviewedWorldCarryover20261026(rel,code);
 const patch=(a,b)=>{code=once(code,a,b);};
 if(rel==='src/game/character.js'){
  const start=code.indexOf('  async warmAll('),end=code.indexOf('\n  // ----',start);
  if(start<0||end<0)throw Error('Remaining world warmAll boundary');
  let body=code.slice(start,end);
  body=once(body,'    return done;','    try { return await done; }\n    catch (error) { if (this._warmed === done) this._warmed = null; throw error; }');
  code=code.slice(0,start)+body+code.slice(end);
 }
 if(rel==='src/game/cameraRig.js'){
  patch('    const hs = Math.hypot(a.vel.x, a.vel.z);','    const hs = swim ? Math.hypot(a.vel.x, a.vel.z) : 0;');
 }

 if(rel==='src/world/render-bounds.js'){
  const old='    for (const r of recs) box.union(local.clone().applyMatrix4(r.m));';
  const optimized='    const transformed = new THREE.Box3();\n    for (const r of recs) box.union(transformed.copy(local).applyMatrix4(r.m));';
  // The immutable upstream already includes this exact allocation reduction.
  // Preserve the fail-closed anchor on any third, unrecognized implementation.
  if(code.includes(old))patch(old,optimized);
  else if(!code.includes(optimized))throw Error('Remaining world queue anchor: render-bounds unexpected source');
 }
 if(rel==='src/world/level.js'){
  patch('      const edgeCache = new Map();','      const edgeCache = new Uint8Array(12);');
  patch('        const key = k1 < k2 ? `${k1}${s1}${k2}${s2}` : `${k2}${s2}${k1}${s1}`;\n        if (edgeCache.has(key)) return edgeCache.get(key);',`        const lo=k1<k2?k1:k2,hi=k1<k2?k2:k1,ls=k1<k2?s1:s2,hs=k1<k2?s2:s1;
        const key=(lo===0?(hi===1?0:4):8)+(ls>0?2:0)+(hs>0?1:0);
        if (edgeCache[key]) return edgeCache[key]===2;`);
  patch('        edgeCache.set(key, ok);','        edgeCache[key]=ok?2:1;');
 }

 if(rel==='src/world/environment.js'){
  patch('      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {\n        const px = minX', '      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {\n        if (data[j * W + i] === 0) continue; // already at the representable minimum\n        const px = minX');
  patch('    const S = 128;\n    const pos = [], idx = [];\n    pos.push(0, 0, 0);',`    const S = 128;
    const pos = new Float32Array((1+(rings.length-1)*S)*3);
    const Index = pos.length/3>65535?Uint32Array:Uint16Array;
    const idx = new Index(S*3+(rings.length-2)*S*6);let po=3,io=0;`);
  patch('    for (let k = 1; k < rings.length; k++) for (let s = 0; s < S; s++) pos.push(cos[s] * rings[k], 0, sin[s] * rings[k]);\n    for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);',`    for (let k = 1; k < rings.length; k++) for (let s = 0; s < S; s++) {pos[po++]=cos[s]*rings[k];pos[po++]=0;pos[po++]=sin[s]*rings[k];}
    for (let s = 0; s < S; s++) {idx[io++]=0;idx[io++]=1+((s+1)%S);idx[io++]=1+s;}`);
  patch('      for (let s = 0; s < S; s++) { const s1 = (s + 1) % S; idx.push(a0 + s, a0 + s1, a1 + s1, a0 + s, a1 + s1, a1 + s); }','      for (let s = 0; s < S; s++) { const s1 = (s + 1) % S; idx[io++]=a0+s;idx[io++]=a0+s1;idx[io++]=a1+s1;idx[io++]=a0+s;idx[io++]=a1+s1;idx[io++]=a1+s; }');
  const a=code.indexOf('  _buildSea() {'),b=code.indexOf('\n  }',a);let sea=code.slice(a,b);
  sea=once(sea,"geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));","geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));");
  sea=once(sea,'    geo.setIndex(idx);','    geo.setIndex(new THREE.BufferAttribute(idx,1));');
  code=code.slice(0,a)+sea+code.slice(b);
  patch("      const geo = bs.kind === 'fishing' ? this._fishingBoatGeo() : bs.kind === 'launch' ? this._launchGeo() : this._rowboatGeo();\n      const m = new THREE.Mesh(geo, boatMat);",`      const reuse=this._reusableMoored?.get(bs.kind);this._reusableMoored?.delete(bs.kind);
      const geo = reuse?.geometry || (bs.kind === 'fishing' ? this._fishingBoatGeo() : bs.kind === 'launch' ? this._launchGeo() : this._rowboatGeo());
      const m = reuse || new THREE.Mesh(geo, boatMat);m.material=boatMat;`);
  patch('      m.rotation.y = bs.yaw;','      m.rotation.set(0,bs.yaw,0);');
  patch('    const old = [this.pilings, this.dockProps, ...(this.moored || []).map((m) => m.mesh)];',`    const reusable=new Map((this.moored||[]).map(m=>[m.spec.kind,m.mesh]));
    const retained=new Set(reusable.values());
    const old = [this.pilings, this.dockProps, ...retained];`);
  const rs=code.indexOf('  _rebuildDock() {'),re=code.indexOf('\n  // Replace the deck',rs);let rebuild=code.slice(rs,re);
  rebuild=once(rebuild,'      o.geometry?.dispose();','      if(!retained.has(o))o.geometry?.dispose();');
  rebuild=once(rebuild,'    this._buildDock();',`    this._reusableMoored=reusable;
    try{this._buildDock();}finally{
      this._reusableMoored=null;
      for(const mesh of reusable.values())mesh.geometry?.dispose();
    }`);
  code=code.slice(0,rs)+rebuild+code.slice(re);
 }
 if(rel==='src/world/decor.js'){
  patch('return new THREE.BufferGeometry().copy(template);','return template;');
  patch('      const put = (g, c, k) => { g.translate(x, y, z); body.push(tint(g, c, k)); };','      const put = (g, color, k) => { body.push({g,x,y,z,color,k}); };');
  patch('      gl.translate(x + hx, y + 4.93, z);\n      glass.push(tint(gl, CREAM));','      glass.push({g:gl,x:x+hx,y:y+4.93,z,color:CREAM});');
  patch('      const bulb = take(() => new THREE.SphereGeometry(0.075, 12, 8)); bulb.translate(x + hx, y + 4.9, z);\n      glass.push(tint(bulb, 0xfff1cf, 1.0));','      const bulb = take(() => new THREE.SphereGeometry(0.075, 12, 8));\n      glass.push({g:bulb,x:x+hx,y:y+4.9,z,color:0xfff1cf,k:1.0});');
  const start=code.indexOf('  _buildLamps() {'),end=code.indexOf('\n  // ---',start);let lamps=code.slice(start,end);
  lamps=once(lamps,'merge(body)','iwMergeLampParts(body)');lamps=once(lamps,'merge(glass)','iwMergeLampParts(glass)');code=code.slice(0,start)+lamps+code.slice(end);
  code=LAMP_MERGE+code;
 }
 if(rel==='src/world/props-marina-dock.js'){
  const vessel=rel.endsWith('props-marina-vessels.js'),name=vessel?'MB':'GB',index=vessel?'i':'idx';
  patch('  class '+name+' {','  class '+name+' extends IWMarinaStaging {');
  patch('    constructor() { this.p = []; this.n = []; this.c = []; this.'+index+' = []; }','    constructor() { super(); }');
  if(vessel){patch('      this.p.push(x, y, z); this.n.push(nx / l, ny / l, nz / l);\n      if (c) this.c.push(c.r, c.g, c.b); else this.c.push(1, 1, 1);\n      return this.p.length / 3 - 1;','      return this._vertex(x,y,z,nx/l,ny/l,nz/l,c?c.r:1,c?c.g:1,c?c.b:1);');}
  else patch('    v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); return this.p.length / 3 - 1; }','    v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { return this._vertex(x,y,z,nx,ny,nz,r,g,b); }');
  patch('      if (s < 0) this.'+index+'.push(a, c, b); else this.'+index+'.push(a, b, c);','      if (s < 0) this._triangle(a,c,b); else this._triangle(a,b,c);');
  patch("      const g = new THREE.BufferGeometry();\n      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));\n      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));\n      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));\n      g.setIndex(this."+index+");\n      return g;",'      return this._geometry(THREE);');
  code=MARINA_STAGING+code;
 }
 if(rel==='src/game/character-geo.js'){
  patch('  const twistFn = opts.twist || null;',`  const twistFn = opts.twist || null;
  const radialBasis=Number.isInteger(radial)&&radial>0&&radial<=128?iwSweepBasis(radial):null;`);
  patch('      const th = (k / radial) * Math.PI * 2, c0 = Math.cos(th), s0 = Math.sin(th); let c = c0, s = s0;','      const th = (k / radial) * Math.PI * 2, c0 = radialBasis?radialBasis[k*2]:Math.cos(th), s0 = radialBasis?radialBasis[k*2+1]:Math.sin(th); let c = c0, s = s0;');

  patch('function sqSurfN(th, y, off, out) {\n  const p0 = sqPoint(th, y, 0, new V3()), p1 = sqPoint(th + 0.002, y, 0, new V3()), p2 = sqPoint(th, y + 0.002, 0, new V3());','const SQ_SURFACE_SCRATCH=[new V3(),new V3(),new V3()];\nfunction sqSurfN(th, y, off, out) {\n  const p0 = sqPoint(th, y, 0, SQ_SURFACE_SCRATCH[0]), p1 = sqPoint(th + 0.002, y, 0, SQ_SURFACE_SCRATCH[1]), p2 = sqPoint(th, y + 0.002, 0, SQ_SURFACE_SCRATCH[2]);');
  code=`const IW_SWEEP_BASIS=new Map();
function iwSweepBasis(radial){let table=IW_SWEEP_BASIS.get(radial);if(!table){table=new Float64Array(radial*2);for(let k=0;k<radial;k++){const th=(k/radial)*Math.PI*2;table[k*2]=Math.cos(th);table[k*2+1]=Math.sin(th);}if(IW_SWEEP_BASIS.size===32)IW_SWEEP_BASIS.delete(IW_SWEEP_BASIS.keys().next().value);IW_SWEEP_BASIS.set(radial,table);}return table;}
`+code;
 }

 if(rel==='src/game/character-face.js'){
  patch('      for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c = -1; c <= 1; c++) {\n        const B = grid.get(key(cx + a, cy + b2, cz + c)); if (!B) continue;',`      // The composed key packs three signed 10-bit cell coordinates. Use
      // arithmetic offsets only when every neighbor stays inside that range.
      const packed=cx>=-511&&cx<511&&cy>=-511&&cy<511&&cz>=-511&&cz<511;
      const center=packed?key(cx,cy,cz):0;
      for (let k=0;k<IW_AO_NEIGHBORS.length;k+=4) {
        const B=grid.get(packed?center+IW_AO_NEIGHBORS[k+3]:key(cx+IW_AO_NEIGHBORS[k],cy+IW_AO_NEIGHBORS[k+1],cz+IW_AO_NEIGHBORS[k+2]));if(!B)continue;`);
  code=`const IW_AO_NEIGHBORS=new Int32Array(27*4);
{let k=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){IW_AO_NEIGHBORS[k++]=a;IW_AO_NEIGHBORS[k++]=b;IW_AO_NEIGHBORS[k++]=c;IW_AO_NEIGHBORS[k++]=a+b*1024+c*1048576;}}
`+code;
 }

 if(rel==='src/game/motion/source-controller.js'){
  patch('   for(const item of list){\n    const clip=this.bank.clips.get(item.name),p=item.profile;','   const footL=this.bank.index.foot_L,footR=this.bank.index.foot_R,toeL=this.bank.index.toe_L,toeR=this.bank.index.toe_R;\n   for(const item of list){\n    const clip=this.bank.clips.get(item.name),p=item.profile;');
  patch("     const f=this.bank.index['foot_'+(i?'R':'L')],t=this.bank.index['toe_'+(i?'R':'L')];",'     const f=i?footR:footL,t=i?toeR:toeL;');
 }
 if(rel==='src/game/motion/hair-targets.js'){
  patch('this.axis.normalize().applyQuaternion(this.headInverse);this.mean.copy(profile.hairMean[e.i]);\n    this.swing.setFromUnitVectors(this.mean,this.axis);','this.axis.normalize().applyQuaternion(this.headInverse);\n    this.swing.setFromUnitVectors(profile.hairMean[e.i],this.axis);');
 }
 if(rel==='src/game/showcase.js'){
  patch('import { syncStudioShadow, releaseStudioShadow, retireHiddenStudio }',"import { nonWailVfxTicks } from '../../patches/splatoon3/runtime/nonwail-vfx-clock.mjs';\nimport { syncStudioShadow, releaseStudioShadow, retireHiddenStudio }");
  patch('          if (this.rand() < 0.8) fx.drop(P.x + (this.rand() - 0.5) * 0.14, P.y + y - 0.2, P.z + (this.rand() - 0.5) * 0.14, (this.rand() - 0.5) * 0.5, -1, (this.rand() - 0.5) * 0.5, 0.012 + this.rand() * 0.016, 1, 2);','          for (let trial=0,count=nonWailVfxTicks(A,dt);trial<count;trial++)\n            if (this.rand() < 0.8) fx.drop(P.x + (this.rand() - 0.5) * 0.14, P.y + y - 0.2, P.z + (this.rand() - 0.5) * 0.14, (this.rand() - 0.5) * 0.5, -1, (this.rand() - 0.5) * 0.5, 0.012 + this.rand() * 0.016, 1, 2);');
  patch('    const ul = Math.round(U.l), ur = Math.round(U.r), ut = Math.round(U.t), ub = Math.round(U.b);','    const ul = U._fitL ?? Math.round(U.l), ur = U._fitR ?? Math.round(U.r), ut = U._fitT ?? Math.round(U.t), ub = U._fitB ?? Math.round(U.b);');
  for(const tail of ["      R.b = (bar && bar.t > H * 0.5 ? bar.t : H - 13 * u) - 0.8 * u;","      R.b = (chips && chips.t > H * 0.5 ? chips.t : H - 12 * u) - 0.8 * u;"]){patch(tail,tail+'\n      R._fitL=Math.round(R.l);R._fitR=Math.round(R.r);R._fitT=Math.round(R.t);R._fitB=Math.round(R.b);');}
 }
 return code;
}
