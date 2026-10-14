// Procedural reconstruction from official S3 Tentatek turntable (02s/06s/10s),
// Nintendo Chill Season 2022 gameplay and S3 promotional render.
// A procedural approximation, not a retail mesh or verified multiview reconstruction.
import { THREE, Pieces, M, zlathe, emptyGeometry, part, slab, smoothOutline, pipe, box, sphere, frontSlab, zcyl } from './kit.mjs';
import { recolor } from './variant-shooter-surfaces.mjs';
const S = .11 / 120, Z0 = (52 - 118) * S, Z1 = (290 - 118) * S;
const CY = (265 - 148) * S, CZ = (Z0 + Z1) / 2, R = 52 * S;
const PINK = '#ed3886', CREAM = '#eeeee7';
// HD rotation shows a long cylindrical centre with short rounded endcaps.
// Keep the original band registration rather than narrowing the tank into an egg.
const CAP=R*.7;
const radius = z => {const t=z<Z0+CAP?(z-Z0-CAP)/CAP:z>Z1-CAP?(z-Z1+CAP)/CAP:0;return R*Math.sqrt(Math.max(0,1-t*t));};
function emblem(side, scale=1, offset=.0057, depth=2) {
  // The weapon's emblem is SOLID cream; the separate bottom-right icon badge
  // has a pink interior and must not be mistaken for the weapon-side marking.
  // Tiny lettering is omitted because the source cannot resolve its glyphs.
  const outline = [[-.055,.008],[-.05,.023],[-.035,.026],[-.017,.012],[0,.005],
    [.018,.023],[.035,.025],[.048,.014],[.049,-.003],[.039,-.019],
    [.022,-.021],[.006,-.007],[-.006,-.006],[-.024,-.023],[-.041,-.023],[-.053,-.011]];
  const curve = new THREE.CatmullRomCurve3(outline.map(([z,y])=>new THREE.Vector3(z,y,0)),true,'centripetal');
  const points = curve.getSpacedPoints(96).slice(0,-1).map(p=>new THREE.Vector2(p.x,p.y));
  const faces=THREE.ShapeUtils.triangulateShape(points,[]),vertices=[],indices=[];
  function add(a,b,c,depth) {
    if(depth){
      const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);
      add(a,ab,ca,depth-1);add(ab,b,bc,depth-1);add(ca,bc,c,depth-1);add(ab,bc,ca,depth-1);return;
    }
    // Subdivision follows the curved shell instead of spanning its interior.
    const start=vertices.length/3;
    for(const p of [a,b,c]) {
      const z=.038+p.x*scale,y=CY+p.y*1.12*scale;
      const x=side*(Math.sqrt(Math.max(.00001,radius(z)**2-(y-CY)**2))+offset);
      vertices.push(x,y,z);
    }
    const cross=(b.y-a.y)*(c.x-a.x)-(b.x-a.x)*(c.y-a.y);
    indices.push(start,start+(cross*side>0?1:2),start+(cross*side>0?2:1));
  }
  for(const face of faces)add(...face.map(i=>points[i]),depth);
  const faceVertices=vertices.length/3;
  // Close the pink backing's rim down to the tank: it is a raised plate, not
  // a detached single-sided decal. The white inset sits above this rim.
  if(scale>1)for(let i=0;i<points.length;i++) {
    const j=(i+1)%points.length,start=vertices.length/3;
    for(const [p,h] of [[points[i],offset],[points[j],offset],[points[j],.0005],[points[i],.0005]]) {
      const z=.038+p.x*scale,y=CY+p.y*1.12*scale;
      vertices.push(side*(Math.sqrt(Math.max(.00001,radius(z)**2-(y-CY)**2))+h),y,z);
    }
    const order=side<0?[0,1,2,0,2,3]:[0,2,1,0,3,2];indices.push(...order.map(k=>start+k));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
  // Analytic smooth face normals remove triangulation facets from the silver
  // plate. Preserve the rim's hard normals along its physical thickness.
  const normal=g.attributes.normal;
  for(let i=0;i<faceVertices;i++) {
    const y=vertices[i*3+1]-CY,z=vertices[i*3+2],r=radius(z),dr=(radius(z+.000001)-radius(z-.000001))/.000002;
    const n=new THREE.Vector3(side*Math.sqrt(Math.max(.00001,r*r-y*y)),y,-r*dr).normalize();normal.setXYZ(i,n.x,n.y,n.z);
  }
  return g;
}
// Select entire same-color connected pieces by spatial bounds, not arbitrary
// vertex cutoffs. Position-equivalent vertices reconnect the kit's split faces.
function removeComponents(g, hex, select) {
  const c=g.attributes.color,p=g.attributes.position,tint=new THREE.Color(hex),faces=[],adj=new Map(),remove=new Set();
  const key=j=>[p.getX(j),p.getY(j),p.getZ(j)].map(v=>v.toFixed(7)).join(',');
  for(let i=0;i<g.index.count;i+=3) {
    const ids=Array.from(g.index.array.slice(i,i+3));
    if(!ids.every(j=>Math.abs(c.getX(j)-tint.r)<1e-6&&Math.abs(c.getY(j)-tint.g)<1e-6&&Math.abs(c.getZ(j)-tint.b)<1e-6))continue;
    const n=faces.length;faces.push({ids,index:i});for(const j of ids){const k=key(j);if(!adj.has(k))adj.set(k,[]);adj.get(k).push(n);}
  }
  const seen=new Set();
  for(let seed=0;seed<faces.length;seed++){
    if(seen.has(seed))continue;const stack=[seed],group=[],bounds=new THREE.Box3();seen.add(seed);
    while(stack.length){const n=stack.pop();group.push(n);for(const j of faces[n].ids){bounds.expandByPoint(new THREE.Vector3(p.getX(j),p.getY(j),p.getZ(j)));for(const k of adj.get(key(j)))if(!seen.has(k)){seen.add(k);stack.push(k);}}}
    if(select(bounds,group.length))for(const n of group)remove.add(faces[n].index);
  }
  const keep=[];for(let i=0;i<g.index.count;i+=3)if(!remove.has(i))keep.push(...g.index.array.slice(i,i+3));g.setIndex(keep);return remove.size;
}
function frameAndForeEnd(d) {
  const g=d.body,removedPurple=removeComponents(g,'#3d2ba0',()=>true);
  const removedForeEnd=removeComponents(g,'#efbf2a',b=>b.min.z>.06&&b.max.z<.18&&b.max.y<.06);
  const removedPlate=removeComponents(g,'#efbf2a',(b,n)=>n===68&&b.min.z>.15&&b.max.z<.19);
  const p=new Pieces(),purple='#3d2ba0',yellow='#efbf2a';
  // HD side silhouette: broad curved pistol heel, no rectangular base shoe.
  const outline=[[-.038,.06],[.079,.06],[.08,.035],[.054,.026],[.052,.003],[.04,-.014],[.022,-.017],[.011,-.01],
    [.003,-.038],[-.004,-.064],[-.017,-.072],[-.037,-.063],[-.042,-.05],[-.029,-.013],[-.025,.011],[-.035,.035]];
  const hole=[[.018,.026],[.041,.026],[.046,.015],[.043,.003],[.03,-.005],[.018,-.002],[.012,.009]];
  p.add(slab(smoothOutline(outline,64),.028,0,.004,[smoothOutline(hole,28)]),purple,M.gloss);
  for(const side of [-1,1]) {
    for(const y of [.042,.051])p.add(box(.0018,.0023,.04,side*.015,y,.025,.4,6,4),'#332290',M.gloss);
    p.add(sphere(.0015,.0032,.0032,side*.015,-.052,-.026,8,6),'#9aa0a8',M.metal);
    for(let i=0;i<5;i++){
      const y=-.015-i*.007,z=-.003-i*.002;
      p.add(pipe([[side*.012,y+.001,z+.008],[side*.0145,y,z],[side*.012,y-.001,z-.008]],.0011,5,4),'#4934b4',M.gloss);
    }
  }
  // Shorter rounded fore-end with three curved finger ridges, replacing the
  // inherited broad bowl and four straight bars. Native support socket stays.
  const fore=[[.071,.054],[.141,.054],[.16,.045],[.164,.026],[.153,.012],[.136,.009],[.114,.015],[.09,.024],[.074,.041]];
  p.add(slab(smoothOutline(fore,40),.038,0,.005),yellow,M.gloss);
  for(const z of [.107,.124,.141])p.add(pipe([[-.017,.028,z],[-.014,.016,z-.003],[0,.011,z-.004],[.014,.016,z-.003],[.017,.028,z]],.003,12,6),yellow,M.gloss);
  // Front stop is an oblong plate, rather than a stepped rectangular extrusion.
  const plate=[];for(let i=0;i<40;i++){const a=i/40*Math.PI*2;plate.push([.025*Math.cos(a),.055+.049*Math.sin(a)]);}
  p.add(frontSlab(plate,.011,.172,.002),yellow,M.gloss);
  p.add(zcyl(.010,.178,.180,0,.026,20),'#303038',M.satin);
  p.list.unshift(d.body);d.body=p.build();
  return {removedPurple,removedForeEnd,removedPlate};
}
export function tentatekShell(d) {
  // The official turntable confirms pink collar/S bands, and both logo sides.
  // Keep the original band triangles; recolor the complete pieces, including
  // their lower reaches. The fore-end and front plate are excluded.
  const bandVertices=recolor(d.body,{'#efbf2a':PINK},(_x,y,z)=>
    (y>.085&&z<-.04)||(y>(z<0?.0584:.0589)&&z>-.04&&z<.15));
  const changed=frameAndForeEnd(d),shell=new Pieces(),profile=[];
  for(let i=0;i<=40;i++){const z=Z0+(Z1-Z0)*i/40;profile.push([radius(z),z]);}
  shell.add(zlathe(profile,0,CY,0,40),PINK,M.gloss);
  for(const side of [-1,1]) {
    shell.add(emblem(side,1.075,.0048,1),PINK,M.gloss);
    // Plate reflects dark/light over the turntable, so use silver-white satin
    // instead of a flat cream print. The retail shader is not reproduced.
    shell.add(emblem(side,1,.0057,2),CREAM,M.satin);
  }
  d.parts.can.src.dispose();d.parts.can.src=emptyGeometry();
  d.parts.variantSkin=part(shell,d.parts.can.pivot,'body');
  d.variantGeometryRevision={source:'S3_Tentatek_Splattershot_model_rotating.mp4',removedBandTriangles:0,bandVertices,
    ...changed,shellProfile:'cylindrical-center-elliptical-endcaps',emblemSides:[-1,1],reverseSideVerified:true,
    missingDetails:['wordmark glyphs','tank seam','exact retail surface response']};
}
