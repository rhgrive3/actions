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
  const N=[16,32,48][detail], R=[5,10,16][detail];
  const mats = {
    shell:new THREE.MeshStandardMaterial({color:0x363b3e,roughness:.82,metalness:.08}),
    trim:new THREE.MeshStandardMaterial({color:0x171b1e,roughness:.82,metalness:.04}),
    inset:new THREE.MeshStandardMaterial({color:0xa0a6a5,roughness:.48,metalness:.4}),
    light:new THREE.MeshStandardMaterial({color:inkColor,emissive:inkColor,emissiveIntensity:.7,roughness:.35}),
  };
  // Woven carbon/plastic pattern is original analytic shading, no external textures.
  // UV derivatives limit the weave below one pixel instead of shimmering at distance.
  mats.shell.onBeforeCompile = shader => {
    shader.vertexShader = '#define USE_UV\n'+shader.vertexShader;
    shader.fragmentShader = '#define USE_UV\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 weaveUV = vUv * vec2(190.0,110.0);
      float weaveFootprint=max(fwidth(weaveUV.x),fwidth(weaveUV.y));
      float weave=sin(weaveUV.x*6.2831853)*sin(weaveUV.y*6.2831853);
      diffuseColor.rgb *= 1.0 + .16 * weave * (1.0-smoothstep(.3,1.0,weaveFootprint));`);
  };
  mats.shell.customProgramCacheKey=()=> 'inkwave-armor-weave-v1';
  const add=(name,geo,mat)=>{geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.name=name;m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const grid=(nu,nv,fn)=>{const p=[],uv=[],ix=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){p.push(...fn(i/nu,j/nv));uv.push(i/nu,j/nv);}for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;ix.push(a,b,c,b,d,c);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;};
  const rim=ARMOR_HAT_CLEARANCE.rim;
  const pt=(az,el,off=0)=>{
    let p;
    if(headSurface){const q=new THREE.Vector3();headSurface(az,el,(offIn?offIn(az,el)+ARMOR_HAT_CLEARANCE.thick:.025)+off,q);p=[q.x,q.y-1.05,q.z+.002];}
    else p=[(.178+.025+off)*Math.sin(az)*Math.cos(el),.164+(.176+.025+off)*Math.sin(el),.014+(.165+.025+off)*Math.cos(az)*Math.cos(el)];
    // Rear shell has a distinct tapered projection, not a spherical bicycle dome.
    const rear=Math.max(0,-Math.cos(az));p[2]-=.069*Math.pow(rear,5)*Math.pow(Math.cos(el),2);
    return p;
  };
  // Closed rolled edge, outer crown and inner liner. Pole is inset to avoid degenerate triangles.
  const shell=grid(N,R,(u,v)=>{const az=u*Math.PI*2,el=rim(az)+(Math.PI/2-.004-rim(az))*v;return pt(az,el);});add('woven-shell',shell,mats.shell);
  const rimGeo=grid(N,6,(u,v)=>{const az=u*Math.PI*2,t=v*Math.PI*2;return pt(az,rim(az)+.021*Math.sin(t),-.005+.004*Math.cos(t));});add('rolled-rim',rimGeo,mats.trim);
  const pole=pt(0,Math.PI/2);add('crown-cap',new THREE.SphereGeometry(.006,8,6).scale(1,.15,1).translate(...pole),mats.shell);
  // Broad raised V ribs with a bevelled trapezoid section. The old flat appliqué
  // rails did not reproduce the reference crown silhouette in native renders.
  const ribHeight=[0,.012,.034,.038,.034,.012,0];
  for(const side of [-1,1]){
    const rail=grid(6,[6,10,14][detail],(u,v)=>{
      const z=.150-v*.273,x=side*(.004+v*.102+u*.060);
      const az=Math.atan2(x/.203,z/.190);
      const h=Math.sqrt(Math.max(.001,1-(x/.203)**2-(z/.190)**2));
      const el=Math.asin(clamp(h,.05,.999));
      const q=pt(az,el,.001);
      const endFade=Math.min(1,v*12+.22,(1-v)*9+.15);
      q[1]+=ribHeight[Math.round(u*6)]*endFade;
      return q;
    });add(`raised-crown-rib-${side}`,rail,mats.shell);
  }
  const prism=(verts,depth)=>{const p=[],ix=[];for(const z of [-depth/2,depth/2])for(const v of verts)p.push(v[0],v[1],v[2]+z);const n=verts.length;for(let i=1;i<n-1;i++){ix.push(0,i+1,i,n,n+i,n+i+1);}for(let i=0;i<n;i++){const k=(i+1)%n;ix.push(i,k,n+i,k,n+k,n+i);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(p.flatMap((_,i)=>i%3===0?[0,0]:[]),2));g.setIndex(ix);return g;};
  for(const s of [-1,1]){
    // Broad triangular earpiece, thin in profile; face plane looks slightly forward.
    const verts=[[s*.181,.229,.002],[s*.317,.164,.015],[s*.185,.118,.035]];
    add(`triangular-earpiece-${s}`,prism(s<0?verts.slice().reverse():verts,.035),mats.trim);
    const pad=new THREE.SphereGeometry(.042,[8,12,16][detail],[5,7,10][detail]);pad.scale(.4,1,1);pad.translate(s*.187,.173,.009);add(`ear-pad-${s}`,pad,mats.trim);
    if(detail===0){const g=new THREE.BufferGeometry();const vp=[[s*.194,.216,.04],[s*.300,.165,.04],[s*.195,.133,.04]];g.setAttribute('position',new THREE.Float32BufferAttribute(vp.flat(),3));g.setIndex(s<0?[0,1,2]:[0,2,1]);add(`ear-accent-${s}`,g,mats.light);}
    if(detail>0){const dots=[];for(let row=0;row<8;row++)for(let col=0;col<9-row;col++){
      const t=row/9, x=s*(.192+t*.112), y=.132+col*.011+t*.03;
      const g=new THREE.CircleGeometry(.0025,6);g.translate(x,y,.038);dots.push(g);
    }
      // A single geometry for all LEDs avoids a draw call per dot.
      const positions=[],indices=[];for(const g of dots){const offset=positions.length/3;positions.push(...g.attributes.position.array);indices.push(...Array.from(g.index.array,x=>x+offset));g.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);add(`ear-led-matrix-${s}`,g,mats.light);
    }
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
    const az=1.79+col*.17,el=.2+row*.105;const k=p.length/3;p.push(...pt(az,el,.0015));
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
  group.userData.setInkColor=(color)=>{mats.light.color.set(color);mats.light.emissive.set(color);};
  let disposed=false;group.userData.dispose=()=>{if(disposed)return;disposed=true;group.traverse(o=>o.geometry?.dispose());Object.values(mats).forEach(m=>m.dispose());group.removeFromParent();};
  return group;
}
