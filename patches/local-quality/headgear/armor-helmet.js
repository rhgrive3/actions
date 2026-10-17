/** Original procedural Armor Helmet Replica interpretation, reference research in REFERENCES.md.
 * Head-bone space (+Y up, +Z front), matches INKWAVE main 85acc45.
 * No source mesh/texture import; no changes to Character, hair, physics or gear abilities.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const ARMOR_HELMET_FIT = Object.freeze({
  id: 'armor-helmet-replica', headBone: 'head', main: '85acc45d0ab23a95161b599d4287fd8142e8145b',
  headCenter: [0, .164, .014], restHead: [0, 1.05, -.002],
  hairPolicy: 'Requires existing under-hat hair clipping before production adoption; standalone preview does not alter hair.',
});
export const ARMOR_HAT_CLEARANCE = Object.freeze({
  name:'armor-helmet-replica', thick:.008, exitMax:.05, flare:.006,
  rim: az=>.34+.25*Math.max(0,Math.cos(az))-.27*Math.max(0,-Math.cos(az)),
  lift:()=>.0035, shape:()=>0,
});
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export function createArmorHelmetReplica({lod='hero', inkColor=0xe637ab, headSurface=null, offIn=null}={}) {
  const group = new THREE.Group(); group.name='armor-helmet-replica';
  const detail = lod==='far'?0:lod==='game'?1:2;
  const N=[24,40,56][detail], R=[7,12,18][detail];
  const mats = {
    shell:new THREE.MeshStandardMaterial({color:0x363b3e,roughness:.58,metalness:.13}),
    trim:new THREE.MeshStandardMaterial({color:0x171b1e,roughness:.82,metalness:.04}),
    inset:new THREE.MeshStandardMaterial({color:0xa0a6a5,roughness:.48,metalness:.4}),
    earPrint:new THREE.MeshStandardMaterial({color:0x171b1e,roughness:.82,metalness:.04}),
    light:new THREE.MeshStandardMaterial({color:inkColor,emissive:inkColor,emissiveIntensity:.7,roughness:.35}),
  };
  // Flat printed ink on the actual ear face, with no per-dot geometry or emission.
  const earInk={value:new THREE.Color(inkColor)};
  mats.earPrint.onBeforeCompile=shader=>{
    shader.uniforms.earInk=earInk;
    shader.vertexShader='#define USE_UV\n'+shader.vertexShader;
    shader.fragmentShader='#define USE_UV\nuniform vec3 earInk;\nfloat earEdge(vec2 a,vec2 b,vec2 p){vec2 e=b-a,q=p-a;return -(e.x*q.y-e.y*q.x)/length(e); }\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 center=(floor(vUv/.012)+.5)*.012;
      float edge=min(earEdge(vec2(.181,.249),vec2(.300,.154),center),min(earEdge(vec2(.300,.154),vec2(.185,.090),center),earEdge(vec2(.185,.090),vec2(.181,.249),center)));
      float radius=.0024, aa=max(fwidth(length(vUv-center)),.00005);
      float dotInk=(1.0-smoothstep(radius-aa,radius+aa,length(vUv-center)))*step(.006,edge);
      diffuseColor.rgb=mix(diffuseColor.rgb,earInk,dotInk);`);
  };
  mats.earPrint.customProgramCacheKey=()=> 'inkwave-armor-flat-earprint-v1';
  // Woven carbon/plastic pattern is original analytic shading, no external textures.
  // UV derivatives limit the weave below one pixel instead of shimmering at distance.
  mats.shell.onBeforeCompile = shader => {
    shader.vertexShader = '#define USE_UV\n'+shader.vertexShader;
    shader.fragmentShader = '#define USE_UV\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      // Coarse two-over/two-under twill remains legible in the head-sized render.
      vec2 weaveUV = vUv * vec2(136.0,75.0);
      float footprint=max(fwidth(weaveUV.x),fwidth(weaveUV.y));
      vec2 cell=floor(weaveUV), f=fract(weaveUV);
      float warp=step(2.0,mod(cell.x+cell.y,4.0));
      float fibre=mix(sin(f.y*3.14159265),sin(f.x*3.14159265),warp);
      float grain=mix(sin(f.x*31.4159265),sin(f.y*31.4159265),warp);
      float twill=.74+.30*pow(max(0.0,fibre),.5)+.035*grain;
      diffuseColor.rgb *= mix(1.0,twill,1.0-smoothstep(.65,1.8,footprint));`);
  };
  mats.shell.customProgramCacheKey=()=> 'inkwave-armor-twill-v3';
  const add=(name,geo,mat)=>{geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.name=name;m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const grid=(nu,nv,fn)=>{const p=[],uv=[],ix=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){p.push(...fn(i/nu,j/nv));uv.push(i/nu,j/nv);}for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;ix.push(a,b,c,b,d,c);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;};
  const rim=ARMOR_HAT_CLEARANCE.rim;
  const pt=(az,el,off=0)=>{
    let p;
    if(headSurface){const q=new THREE.Vector3();headSurface(az,el,(offIn?offIn(az,el)+ARMOR_HAT_CLEARANCE.thick:.025)+off,q);p=[q.x,q.y-1.05,q.z+.002];}
    else p=[(.178+.025+off)*Math.sin(az)*Math.cos(el),.164+(.176+.025+off)*Math.sin(el),.014+(.165+.025+off)*Math.cos(az)*Math.cos(el)];
    // Base shell only. Structural rails below use closed planar solids, so
    // latitude sampling cannot collapse their broad roof into isolated peaks.
    const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    p[1]+=.031*smooth(.40,1.15,el);
    p[0]*=1+.045*smooth(.30,.9,el);
    // Rear shell has a distinct tapered projection, not a spherical bicycle dome.
    const rear=Math.max(0,-Math.cos(az));p[2]-=.069*Math.pow(rear,5)*Math.pow(Math.cos(el),2);
    return p;
  };
  // Closed rolled edge, outer crown and inner liner. Pole is inset to avoid degenerate triangles.
  const shell=grid(N,R,(u,v)=>{const az=u*Math.PI*2,el=rim(az)+(Math.PI/2-.004-rim(az))*v;return pt(az,el);});add('woven-shell',shell,mats.shell);
  const rimGeo=grid(N,6,(u,v)=>{const az=u*Math.PI*2,t=v*Math.PI*2;return pt(az,rim(az)+.064*Math.sin(t),.001+.009*Math.cos(t));});for(let k=0;k<rimGeo.attributes.uv.count;k++)rimGeo.attributes.uv.setY(k,rimGeo.attributes.uv.getY(k)*.12);add('rolled-rim',rimGeo,mats.shell);
  const pole=pt(0,Math.PI/2);add('crown-cap',new THREE.SphereGeometry(.006,8,6).scale(1,.15,1).translate(...pole),mats.shell);
  // Two closed, wide, bevel-sided rails converge at the front V. Their roof
  // consists of explicit quads with duplicated face vertices (hard normals).
  // Feet follow the base-shell triangle intersection and sink .012 into it.
  const shellMesh=group.children.find(m=>m.name==='woven-shell');
  shellMesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  const shellHeight=(x,z)=>{ray.set(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0));return ray.intersectObject(shellMesh,false)[0]?.point.y??.29;};
  for(const side of [-1,1]){
    const stations=[{x:.023,z:.158,y:.321,w:.046},{x:.045,z:.105,y:.372,w:.060},{x:.075,z:.045,y:.389,w:.072},{x:.095,z:-.075,y:.389,w:.070},{x:.070,z:-.130,y:.350,w:.060}];
    const rings=stations.map((t,station)=>{
      const x=side*t.x,z=t.z;
      const left=x-t.w/2,right=x+t.w/2, flank=station===0?0:station===stations.length-1?.006:.014;
      const y=Math.max(t.y,shellHeight(x,z)+.012);
      // Each roof corner is bounded above its local base, avoiding deep outer
      // slabs. Rear station reduces relief to 3mm so its end sinks into shell.
      const relief=station===stations.length-1?.003:.023;
      const roofY=qx=>Math.min(y,shellHeight(qx,z)+relief);
      return [[left-flank,shellHeight(left-flank,z)-.008,z],[left,roofY(left)-.005,z],[left+.009,roofY(left+.009),z],[right-.009,roofY(right-.009),z],[right,roofY(right)-.005,z],[right+flank,shellHeight(right+flank,z)-.008,z]];
    });
    const p=[],uv=[];
    const tri=(a,b,c)=>{for(const q of [a,b,c]){p.push(...q);uv.push(.5+q[0]*1.25,.5+q[2]*1.8);}};
    const quad=(a,b,c,d)=>{tri(a,c,b);tri(a,d,c);};
    for(let j=0;j<rings.length-1;j++)for(let k=0;k<6;k++){const l=(k+1)%6;quad(rings[j][k],rings[j+1][k],rings[j+1][l],rings[j][l]);}
    for(let k=1;k<5;k++){tri(rings[0][0],rings[0][k+1],rings[0][k]);const r=rings.at(-1);tri(r[0],r[k],r[k+1]);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(Array.from({length:p.length/3},(_,i)=>i));
    add(`closed-planar-v-rail-${side}`,g,mats.shell);
  }
  const prism=(verts,depth)=>{const p=[],ix=[];for(const z of [-depth/2,depth/2])for(const v of verts)p.push(v[0],v[1],v[2]+z);const n=verts.length;for(let i=1;i<n-1;i++){ix.push(0,i+1,i,n,n+i,n+i+1);}for(let i=0;i<n;i++){const k=(i+1)%n;ix.push(i,k,n+i,k,n+k,n+i);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(p.flatMap((_,i)=>i%3===0?[0,0]:[]),2));g.setIndex(ix);return g;};
  for(const s of [-1,1]){
    // Broad triangular earpiece, thin in profile; face plane looks slightly forward.
    const verts=[[s*.181,.249,.002],[s*.300,.154,.015],[s*.185,.090,.035]];
    // Prism expects CCW XY vertices: back must face -Z on both mirrored ears.
    const earBody=prism(s>0?verts.slice().reverse():verts,.035);
    // Replace the front cap with a printed face in exactly the same plane.
    const bodyIndices=Array.from(earBody.index.array);earBody.setIndex(bodyIndices.filter((_,i)=>Math.floor(i/3)!==1));
    add(`triangular-earpiece-${s}`,earBody,mats.trim);
    const face=new THREE.BufferGeometry();face.setAttribute('position',new THREE.Float32BufferAttribute(verts.flatMap(v=>[v[0],v[1],v[2]+.0175]),3));
    face.setAttribute('uv',new THREE.Float32BufferAttribute(verts.flatMap(v=>[Math.abs(v[0]),v[1]]),2));face.setIndex(s<0?[0,1,2]:[0,2,1]);
    add(`flat-ear-print-${s}`,face,mats.earPrint);
    const pad=new THREE.SphereGeometry(.042,[8,12,16][detail],[5,7,10][detail]);pad.scale(.4,1,1);pad.translate(s*.187,.173,.009);add(`ear-pad-${s}`,pad,mats.trim);
    // Y strap and chin buckle, leaves the face/mouth uncovered.
    const jawPoint=(az,el)=>{
      if(headSurface){const q=new THREE.Vector3();headSurface(az,el,.009,q);return [q.x,q.y-1.05,q.z+.002];}
      return [.178*Math.sin(az)*Math.cos(el),.164+.16*Math.sin(el),.014+.17*Math.cos(az)*Math.cos(el)];
    };
    // Follow the actual adopted lower-face surface, not a free-hanging neck loop.
    const points=[[s*.17,.14,.018],jawPoint(s*1.2,-.43),jawPoint(s*.65,-.77),jawPoint(0,-.88)];
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]];
    const band=grid([8,14,20][detail],4,(u,v)=>{const q=curve.getPoint(u),t=curve.getTangent(u),c=corners[Math.round(v*4)],n=new THREE.Vector3(-t.y,t.x,0).normalize();q.addScaledVector(n,c[0]*.010);q.z+=c[1]*.0025;return q.toArray();});
    add(`chin-strap-${s}`,band,mats.trim);
  }
  const chin=new THREE.Vector3();if(headSurface){headSurface(0,-.88,.014,chin);chin.y-=1.05;chin.z+=.002;}else chin.set(0,.164+.16*Math.sin(-.88),.014+.17*Math.cos(-.88));
  const buckle=new THREE.BoxGeometry(.030,.019,.012);buckle.translate(chin.x,chin.y,chin.z+.003);add('chin-buckle',buckle,mats.trim);
  // Posterior crown matrix, observed on the actual back reference (no invented light bar).
  if(detail>0){const p=[],ix=[];for(let row=0;row<9;row++)for(let col=0;col<17;col++){
    const az=2.0+col*.143,el=.2+row*.105;const k=p.length/3;p.push(...pt(az,el,.0015));
    for(let d=0;d<6;d++){const a=d*Math.PI/3;p.push(...pt(az+Math.cos(a)*.022/Math.max(.5,Math.cos(el)),el+Math.sin(a)*.022,.0015));}
    for(let d=0;d<6;d++)ix.push(k,k+1+d,k+1+(d+1)%6);
  }const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);add('rear-led-matrix',g,mats.light);}

  // Merge by material like the production character; part names remain reviewable metadata.
  const parts=group.children.map(m=>({name:m.name,triangles:m.geometry.index.count/3}));
  for(const [key,mat] of Object.entries(mats)){
    const meshes=group.children.filter(m=>m.material===mat);if(!meshes.length)continue;
    for(const m of meshes){if(!m.geometry.attributes.uv)m.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(m.geometry.attributes.position.count*2),2));}
    const merged=mergeGeometries(meshes.map(m=>m.geometry),false);
    for(const m of meshes){group.remove(m);m.geometry.dispose();}
    add(key,merged,mat);
  }
  group.userData.parts=parts;group.userData.fit=ARMOR_HELMET_FIT;group.userData.lod=lod;
  group.userData.setInkColor=(color)=>{mats.light.color.set(color);mats.light.emissive.set(color);earInk.value.set(color);};
  let disposed=false;group.userData.dispose=()=>{if(disposed)return;disposed=true;group.traverse(o=>o.geometry?.dispose());Object.values(mats).forEach(m=>m.dispose());group.removeFromParent();};
  return group;
}
