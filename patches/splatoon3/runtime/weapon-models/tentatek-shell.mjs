// Visible-side reconstruction from the pinned 128px Wst_Shooter_Normal_01 icon.
// A procedural approximation, not a retail mesh or verified multiview reconstruction.
import { THREE, Pieces, M, zlathe, emptyGeometry, part } from './kit.mjs';
import { recolor } from './variant-shooter-surfaces.mjs';
const S = .11 / 120, Z0 = (52 - 118) * S, Z1 = (290 - 118) * S;
const CY = (265 - 148) * S, CZ = (Z0 + Z1) / 2, R = 52 * S;
const PINK = '#ed3886', CREAM = '#f3e3cf';
// Smooth rounded shoulders instead of the base's long straight cylinder.
const radius = z => R * Math.sqrt(Math.max(0, 1 - ((z - CZ) / ((Z1 - Z0) / 2)) ** 4));
function emblem() {
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
      const z=.026+p.x,y=CY+p.y;
      const x=-Math.sqrt(Math.max(.00001,radius(z)**2-(y-CY)**2))-.0009;
      vertices.push(x,y,z);
    }
    const cross=(b.y-a.y)*(c.x-a.x)-(b.x-a.x)*(c.y-a.y);
    indices.push(start,start+(cross<0?1:2),start+(cross<0?2:1));
  }
  for(const face of faces)add(...face.map(i=>points[i]),2);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function tentatekShell(d) {
  // Remove only the old yellow collar/S bands. The rear carry loop survives and
  // becomes pink; frame, fore-end, front plate, cap, trigger and nozzle stay intact.
  const g=d.body,p=g.attributes.position,c=g.attributes.color,yellow=new THREE.Color('#efbf2a');
  const keep=[];let removed=0;
  for(let i=0;i<g.index.count;i+=3) {
    const face=Array.from(g.index.array.slice(i,i+3));
    const band=face.every(j=>Math.abs(c.getX(j)-yellow.r)<1e-6&&Math.abs(c.getY(j)-yellow.g)<1e-6&&Math.abs(c.getZ(j)-yellow.b)<1e-6&&p.getY(j)>(p.getZ(j)<0?.0584:.0589)&&p.getZ(j)>-.04&&p.getZ(j)<.15);
    if(band)removed++;else keep.push(...face);
  }
  g.setIndex(keep);
  recolor(g,{'#efbf2a':PINK},(_x,y,z)=>y>.085&&z<-.04);
  const shell=new Pieces(),profile=[];
  for(let i=0;i<=40;i++){const z=Z0+(Z1-Z0)*i/40;profile.push([radius(z),z]);}
  shell.add(zlathe(profile,0,CY,0,40),PINK,M.gloss);
  shell.add(emblem(),CREAM,M.print);
  // Keep native motion and the empty ink channel. Only this fresh variant build
  // replaces its visible can; there is no overlapping hidden capsule/skin.
  d.parts.can.src.dispose();d.parts.can.src=emptyGeometry();
  d.parts.variantSkin=part(shell,d.parts.can.pivot,'body');
  d.variantGeometryRevision={source:'Wst_Shooter_Normal_01.png',removedBandTriangles:removed,
    shellProfile:'rounded-shoulder-superellipse',emblemSides:[-1],reverseSideVerified:false};
}
