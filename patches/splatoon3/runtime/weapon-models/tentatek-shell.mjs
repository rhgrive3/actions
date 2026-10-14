// Procedural reconstruction from official S3 Tentatek turntable (02s/06s/10s),
// S3 promotional render; ambiguous alternate gameplay still is not used.
// A procedural approximation, not a retail mesh or verified multiview reconstruction.
import { THREE, Pieces, M, zlathe, emptyGeometry, part, slab, smoothOutline, pipe, pipeR, box, sphere, frontSlab, zcyl } from './kit.mjs';
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
  // The separate wordmark is traced from the official rotation frame below.
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
  // The old two tiny pin-heads remained after replacing the base front stop.
  // Retail has one broad lower circular stop, created below.
  const removedOldPins=removeComponents(g,'#1c1d22',b=>b.min.z>.17&&b.max.z<.181&&b.max.y<.05);
  const p=new Pieces(),purple='#3d2ba0',yellow='#efbf2a';
  // HD side silhouette: broad curved pistol heel, no rectangular base shoe.
  const outline=[[-.038,.06],[.079,.06],[.08,.035],[.069,.026],[.072,.012],[.064,-.005],[.047,-.010],[.023,-.010],[.011,-.007],
    [.003,-.038],[-.004,-.064],[-.017,-.072],[-.037,-.063],[-.042,-.05],[-.029,-.013],[-.025,.011],[-.035,.035]];
  // Rotation 02s/06s: a wide, near-trapezoidal opening with a short flat
  // lower edge, not an ellipse. Authored width/height = .049/.026 = 1.88.
  const hole=[[.014,.025],[.053,.025],[.063,.016],[.055,.005],[.043,-.001],[.025,-.001],[.014,.007]];
  p.add(slab(smoothOutline(outline,64),.028,0,.004,[hole]),purple,M.gloss);
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
  // The previous ridges were mostly inside the .038-wide slab. Put the three
  // swept finger ridges on the outside faces, as visible in the S3 promo.
  for(const side of [-1,1]) {
    // S3 promo and 06s agree: ridges cluster toward the muzzle and sweep
    // FORWARD as they descend around the belly. V4 swept them backwards.
    for(const z of [.123,.137,.151])p.add(pipeR([[side*.021,.037,z-.006],[side*.024,.027,z-.003],[side*.022,.016,z+.002],[side*.014,.010,z+.004]],t=>.0015+.0028*Math.sin(Math.PI*t),16,8),yellow,M.gloss);
    for(const z of [.086,.151]) {
      p.add(sphere(.0016,.0032,.0032,side*.0205,.044,z,10,8),'#bcc2c3',M.metal);
      p.add(box(.0007,.0007,.0035,side*.0221,.044,z,.25,4,4),'#58606a',M.satin);
    }
  }
  // Front stop is an oblong plate, rather than a stepped rectangular extrusion.
  const plate=[];for(let i=0;i<40;i++){const a=i/40*Math.PI*2;plate.push([.025*Math.cos(a),.055+.049*Math.sin(a)]);}
  p.add(frontSlab(plate,.011,.172,.002),yellow,M.gloss);
  p.add(zcyl(.010,.178,.180,0,.026,20),'#303038',M.satin);
  p.list.unshift(d.body);d.body=p.build();
  return {removedPurple,removedForeEnd,removedPlate,removedOldPins};
}
// Pixel-run trace of the physical wordmark from official S3 turntable 02s.
// Source pixels: origin(627,347), rotation -atan(.31), 112x28 sampling grid.
// A thresholded geometry approximation, not invented Latin text or a font.
const WORDMARK_RUNS=[[],[],[],[],[],[],[],[[95,98]],[[92,98]],[[48,50],[54,57],[66,69],[79,84],[92,96]],[[25,26],[31,33],[48,59],[67,69],[79,82],[92,94]],[[24,29],[30,36],[47,49],[50,60],[68,70],[79,81],[91,93]],[[9,12],[23,39],[45,49],[55,60],[68,72],[78,81],[91,93]],[[9,13],[24,28],[29,38],[45,47],[56,61],[70,72],[78,80],[91,97]],[[9,13],[23,27],[35,38],[44,46],[59,61],[70,73],[76,80],[89,99]],[[8,15],[23,26],[27,29],[36,38],[43,46],[59,63],[69,83],[89,92],[93,94],[96,99]],[[8,14],[23,32],[34,37],[43,46],[59,63],[69,84],[89,91]],[[8,15],[23,37],[42,46],[59,62],[66,75],[76,83],[88,92],[102,103]],[[8,16],[24,31],[32,37],[43,45],[59,62],[66,70],[72,73],[79,85],[89,92],[102,104]],[[7,11],[14,17],[24,30],[43,48],[60,61],[66,70],[82,85],[89,96],[97,104]],[[7,11],[13,18],[24,27],[45,52],[57,60],[66,70],[92,95],[96,97],[99,103]],[[5,10],[14,19],[23,28],[46,57],[58,59],[68,69]],[[4,10],[18,20],[24,34],[35,40],[48,49],[51,54],[55,57]],[[4,11],[18,21],[24,27],[28,33],[34,35]],[[4,10]],[[4,5],[7,10]],[],[]];
function wordmark(side) {
  const positions=[],indices=[];
  for(let row=0;row<WORDMARK_RUNS.length;row++)for(const [u0,u1]of WORDMARK_RUNS[row]) {
    const start=positions.length/3;
    for(const [u,v]of [[u0,row],[u1,row],[u1,row+1],[u0,row+1]]) {
      const z=.038-side*(u-56)*.00063,y=CY-.029-v*.00048;
      const x=side*(Math.sqrt(Math.max(.00001,radius(z)**2-(y-CY)**2))+.00035);positions.push(x,y,z);
    }
    // Mirroring the text direction on the opposite side keeps it readable from
    // either outward view, instead of reflecting glyphs through the tank.
    indices.push(start,start+2,start+1,start,start+3,start+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
// The inherited S band follows the base capsule's shallow endcap. The
// Tentatek endcap is shorter and rounder, so only its forward lower tip needs
// radial adjustment. Preserve angular path, Z registration and band section.
function fitFrontBandTip(g) {
  const p=g.attributes.position,c=g.attributes.color,pink=new THREE.Color(PINK);
  const center=R+.0026/2+.0005,moved=new Set(),normals=g.attributes.normal.clone();let changed=0;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(z<=Z1-CAP||z>=.15||y>=CY||y<=.0589)continue;
    if(Math.abs(c.getX(i)-pink.r)>1e-6||Math.abs(c.getY(i)-pink.g)>1e-6||Math.abs(c.getZ(i)-pink.b)>1e-6)continue;
    const r=Math.hypot(x,y-CY),shrink=z>Z1-.03?Math.sqrt(Math.max(.5,1-((z-Z1+.03)/.05)**2)):1;
    const delta=radius(z)+.0018-center*shrink,scale=(r+delta)/r;
    p.setX(i,x*scale);p.setY(i,CY+(y-CY)*scale);moved.add(i);changed++;
  }
  if(changed){g.computeVertexNormals();for(let i=0;i<p.count;i++)if(!moved.has(i))g.attributes.normal.setXYZ(i,normals.getX(i),normals.getY(i),normals.getZ(i));g.computeBoundingBox();g.computeBoundingSphere();}
  return changed;
}
export function tentatekShell(d) {
  // The official turntable confirms pink collar/S bands, and both logo sides.
  // Keep the original band triangles; recolor the complete pieces, including
  // their lower reaches. The fore-end and front plate are excluded.
  const bandVertices=recolor(d.body,{'#efbf2a':PINK},(_x,y,z)=>
    (y>.085&&z<-.04)||(y>(z<0?.0584:.0589)&&z>-.04&&z<.15));
  const frontBandTipVertices=fitFrontBandTip(d.body);
  const changed=frameAndForeEnd(d),shell=new Pieces(),profile=[];
  for(let i=0;i<=40;i++){const z=Z0+(Z1-Z0)*i/40;profile.push([radius(z),z]);}
  shell.add(zlathe(profile,0,CY,0,40),PINK,M.gloss);
  const tankTriangleCount=shell.list[0].index.count/3;
  for(const side of [-1,1]) {
    shell.add(emblem(side,1.075,.0048,1),PINK,M.gloss);
    // Plate reflects dark/light over the turntable, so use silver-white satin
    // instead of a flat cream print. The retail shader is not reproduced.
    shell.add(emblem(side,1,.0057,2),CREAM,M.satin);
    shell.add(wordmark(side),CREAM,M.print);
  }
  d.parts.can.src.dispose();d.parts.can.src=emptyGeometry();
  d.parts.variantSkin=part(shell,d.parts.can.pivot,'body');
  d.variantGeometryRevision={source:'S3_Tentatek_Splattershot_model_rotating.mp4',removedBandTriangles:0,bandVertices,tankTriangleCount,
    ...changed,frontBandTipVertices,shellProfile:'cylindrical-center-elliptical-endcaps',emblemSides:[-1,1],reverseSideVerified:true,
    wordmarkTrace:{sourceFrameSeconds:2,runs:117,exactGlyphContours:false,xOffset:.00035},
    guardOpening:{width:.049,height:.026,ratio:.049/.026},ridgeSweep:'forward-while-descending',
    missingDetails:['tank seam','exact retail surface response','subpixel wordmark contours']};
}
