/** Seafoam 'Phones / カモヘッドホン スイトン, procedural reconstruction.
 * References and uncertainty: ../README.md. No extracted game assets.
 * Head-bone local coordinates, +Z front, centre (0,.164,.014).
 */
import * as THREE from 'three';

export const CAMO_HEADPHONES_ID = 'camo-headphones-suiton';
// Fit-only descriptor for the existing native under-hat classification/tuck path.
// Do not invoke the stock buildHat for this descriptor; visual geometry is this module.
export const CAMO_HEADPHONES_FIT = {
  name:'camo-headphones-suiton', cls:5, col:[-2,1], thick:.0085, exitMax:.052, flare:.009,
  rows:[0,.012,.09,.17,.22,.32], crown:7,
  rim:(az)=>.22-.075*(1-Math.cos(az))*.5,
  lift:()=>.014,
  shape:()=>0,
};
const TAU = Math.PI * 2;
function texture(kind) {
  const n=256, data=new Uint8Array(n*n*4);
  const palette=[[174,192,171],[74,113,105],[42,65,63],[219,224,184]];
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    let rgb;
    if(kind==='knit') {
      const u=x/n,v=y/n;
      const rib=.76+.16*Math.cos(u*TAU*32)+.045*Math.cos((v*96+Math.sin(u*TAU*32)*.28)*TAU);
      rgb=[rib*255,rib*255,rib*255];
    } else {
      const u=x/n*TAU,v=y/n*TAU;
      const s=Math.sin(u*2+Math.cos(v*3))+.6*Math.cos(v*3+Math.sin(u*4))+.33*Math.sin(u*5-v*4);
      rgb=palette[s<-.55?2:s<.45?1:s<1.1?0:3];
      // Sparse cream oval flecks with dark outlines, characteristic seafoam print.
      for(const [cx,cy,rx,ry] of [[.15,.2,.035,.047],[.64,.43,.043,.031],[.38,.8,.03,.04],[.86,.87,.027,.032]]) {
        const d=Math.hypot((x/n-cx)/rx,(y/n-cy)/ry);
        if(d<1.2) rgb=d<.76?palette[3]:palette[2];
      }
    }
    const i=(y*n+x)*4; data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
}
function surface(rows,around,point) {
  const p=[],uv=[],ix=[];
  for(let j=0;j<=rows;j++) for(let i=0;i<=around;i++){p.push(...point(i/around,j/rows));uv.push(i/around,j/rows);}
  for(let j=0;j<rows;j++)for(let i=0;i<around;i++){const a=j*(around+1)+i,b=a+around+1;ix.push(a,a+1,b,a+1,b+1,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
export function createCamoHeadphones({inkColor=0x20bc91,lod='hero',clearance=null}={}) {
  if(!['hero','game','far'].includes(lod)) throw new RangeError('Unknown headgear LOD');
  const root=new THREE.Group();root.name=CAMO_HEADPHONES_ID;
  const detail=lod==='hero'?1:lod==='game'?.38:.35, seg=Math.max(12,Math.round(48*detail));
  const knitTex=texture('knit'),camoTex=texture('camo');
  const knit=new THREE.MeshStandardMaterial({color:inkColor,map:knitTex,roughness:.96,side:THREE.DoubleSide});
  const camo=new THREE.MeshStandardMaterial({color:0xffffff,map:camoTex,roughness:.36,metalness:.12});
  const rubber=new THREE.MeshStandardMaterial({color:0x151b19,roughness:.79});
  const edge=new THREE.MeshStandardMaterial({color:0x687264,roughness:.42,metalness:.25});
  const navy=new THREE.MeshStandardMaterial({color:0x222749,roughness:.5});
  const cream=new THREE.MeshStandardMaterial({color:0xd6d6ba,roughness:.72});
  const materials=[knit,camo,rubber,edge,navy,cream];
  function mesh(g,m,name){const o=new THREE.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;root.add(o);return o;}
  // Optional native hatCtx.offIn(az,el) is a radial offset from the head skin.
  // Expand fabric only when that field needs more room; never mutate hair.
  const fitFabric=(p)=>{
    if(typeof clearance!=='function')return p;
    const dx=p[0],dy=p[1]-.164,dz=p[2]-.014,r=Math.hypot(dx,dy,dz);
    const az=Math.atan2(dx,dz),el=Math.asin(dy/r),off=clearance(az,el);
    if(!Number.isFinite(off))throw new TypeError('Headgear clearance must be finite');
    const skinRadius=1/Math.sqrt((dx/r/.178)**2+(dy/r/.176)**2+(dz/r/.165)**2);
    const f=Math.max(1,(skinRadius+Math.max(0,off)+CAMO_HEADPHONES_FIT.thick)/r);
    return [dx*f,.164+dy*f,.014+dz*f];
  };
  // A real crown and turned-up cuff: beanie remains a separate ink-coloured fabric.
  mesh(surface(Math.round(24*detail),seg,(u,v)=>{
    const a=u*TAU,t=v*Math.PI/2,r=Math.cos(t),rib=1+.009*Math.cos(a*32);
    return fitFabric([Math.sin(a)*.193*r*rib,.238+Math.sin(t)*.14,.006+Math.cos(a)*.181*r*rib-.018*v]);
  }),knit,'knit-crown');
  mesh(surface(Math.max(4,Math.round(9*detail)),seg,(u,v)=>{
    const a=u*TAU,bulge=Math.sin(v*Math.PI)*.009,rib=.0014*Math.cos(a*32);
    return fitFabric([Math.sin(a)*(.194+bulge+rib),.205+v*.071-.014*(1-Math.cos(a))*.5,.006+Math.cos(a)*(.183+bulge+rib)]);
  }),knit,'folded-knit-cuff');
  // Arch with rectangular section rather than a circular wire/headset tube.
  function band(rx,ry,y0,thickness,width,mat,name){
    const g=surface(4,seg,(u,v)=>{const a=Math.PI*u;const c=v*TAU;return [(rx+thickness*Math.cos(c))*Math.cos(a),y0+(ry+thickness*Math.cos(c))*Math.sin(a),-.006+width*.5*Math.sin(c)];});
    mesh(g,mat,name);
  }
  band(.222,.19,.2,.009,.060,rubber,'band-inner-padding');
  band(.226,.19,.211,.005,.063,camo,'camouflage-headband');
  const cupShape=new THREE.Shape();
  cupShape.moveTo(.039,.306);cupShape.bezierCurveTo(.035,.265,.086,.164,.083,.111);cupShape.bezierCurveTo(.081,.053,.042,.023,-.004,.023);cupShape.bezierCurveTo(-.059,.023,-.090,.063,-.085,.123);cupShape.bezierCurveTo(-.082,.176,-.046,.254,-.038,.306);cupShape.closePath();
  for(const side of [-1,1]){
    const s=side<0?'right':'left';
    const pad=mesh(new THREE.SphereGeometry(1,seg,Math.max(8,seg/2)),rubber,s+'-ear-cushion');pad.scale.set(.031,.104,.078);pad.position.set(side*.201,.126,.004);
    const shell=new THREE.ExtrudeGeometry(cupShape,{depth:.025,bevelEnabled:true,bevelSegments:Math.max(2,Math.round(4*detail)),steps:1,bevelSize:.008,bevelThickness:.006,curveSegments:Math.max(7,Math.round(20*detail))});
    // UVs fitted to cup profile, not meter-sized default extrusion UVs.
    const pos=shell.attributes.position,uv=shell.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+.09)/.18,(pos.getY(i)-.02)/.29);
    const cup=mesh(shell,camo,s+'-teardrop-shell');cup.rotation.y=side*Math.PI/2;cup.position.x=side*.226;
    const disk=(radius,depth,material,x,name)=>{const o=mesh(new THREE.CylinderGeometry(radius,radius,depth,seg),material,s+'-'+name);o.rotation.z=Math.PI/2;o.position.set(side*x,.126,.002);return o;};
    disk(.066,.007,rubber,.262,'badge-gasket');disk(.060,.008,edge,.267,'badge-rim');disk(.054,.009,navy,.273,'badge');
    // Original block emblem, readable without pretending an exact recovered texture.
    const emblem=new THREE.Shape();emblem.moveTo(-.032,.026);emblem.lineTo(.032,.026);emblem.lineTo(.023,.008);emblem.lineTo(-.032,.008);emblem.closePath();
    const logo=mesh(new THREE.ShapeGeometry(emblem),cream,s+'-badge-upper-mark');logo.rotation.y=side*Math.PI/2;logo.position.set(side*.279,.126,.002);
    for(const [z,y,w,h] of [[-.021,-.012,.013,.032],[.021,-.012,.013,.032],[0,-.025,.043,.011]]){const o=mesh(new THREE.BoxGeometry(.001,h,w),cream,s+'-badge-lower-mark');o.position.set(side*.279,.126+y,.002+z);}
    const hinge=mesh(new THREE.BoxGeometry(.030,.023,.061),rubber,s+'-hinge');hinge.position.set(side*.197,.307,-.005);hinge.rotation.z=side*.46;
  }
  const label=mesh(new THREE.BoxGeometry(.041,.043,.003),cream,'woven-label');label.position.set(.122,.248,.159);label.rotation.y=.55;label.rotation.z=.12;
  const labelMark=mesh(new THREE.BoxGeometry(.026,.028,.003),navy,'woven-label-mark');labelMark.position.copy(label.position).add(new THREE.Vector3(.001,0,.003));labelMark.rotation.copy(label.rotation);
  // Batch all static accessory parts by material: six calls independent of detail.
  // Transform once at construction; preserve named part bounds as inspection metadata.
  const parts=[];
  const buckets=materials.map(()=>({position:[],normal:[],uv:[]}));
  root.updateMatrixWorld(true);
  for(const o of [...root.children]) {
    const g=o.geometry.clone().applyMatrix4(o.matrix),a=g.attributes,idx=g.index;
    parts.push({name:o.name,bounds:new THREE.Box3().setFromObject(o).clone()});
    const bucket=buckets[materials.indexOf(o.material)],count=idx?idx.count:a.position.count;
    const A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3();
    for(let i=0;i<count;i+=3) {
      const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);
      A.fromBufferAttribute(a.position,ids[0]);B.fromBufferAttribute(a.position,ids[1]);C.fromBufferAttribute(a.position,ids[2]);
      if(B.sub(A).cross(C.sub(A)).lengthSq()<1e-18) continue;
      for(const id of ids) for(const name of ['position','normal','uv']) {
        const attr=a[name];for(let k=0;k<attr.itemSize;k++)bucket[name].push(attr.array[id*attr.itemSize+k]);
      }
    }
    g.dispose();o.geometry.dispose();root.remove(o);
  }
  const materialNames=['knit','camo','rubber','edge','navy','cream'];
  buckets.forEach((bucket,i)=>{
    const g=new THREE.BufferGeometry();for(const name of ['position','normal','uv'])g.setAttribute(name,new THREE.Float32BufferAttribute(bucket[name],name==='uv'?2:3));
    mesh(g,materials[i],materialNames[i]+'-batch');
  });
  root.setInkColor=(value)=>{knit.color.set(value);return root;};
  let disposed=false;
  root.dispose=()=>{if(disposed)return;disposed=true;root.removeFromParent();const seen=new Set();root.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}});materials.forEach(m=>m.dispose());knitTex.dispose();camoTex.dispose();};
  let triangles=0,vertices=0,meshes=0;root.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  root.userData={parts,id:CAMO_HEADPHONES_ID,lod,stats:{triangles,vertices,meshes,materials:materials.length,textures:2},fit:{headCenter:[0,.164,.014],attachment:'head bone',hairPolicy:'No hair modification. Tall swept-up styles require separate fit review.'}};
  return root;
}
