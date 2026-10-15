// Bulbz static geometry/ownership pass, isolated from the adopted Tri-Stringer.
// Official HD evidence and deferred firing-color behavior: reference manifest.
import {THREE,Pieces,M,box,sphere,zcyl,zlathe,xlathe,ring,pipe,slab,pistolGrip} from './kit.mjs';
import {MODELS as STRINGERS} from './stringers.mjs';
const base=STRINGERS['s3-stringer-normal'];
const YC=.085,SPAN=.4,TIP_Z=-.24;
const C={marble:'#dedfd9',vein:'#8b918f',black:'#24252e',steel:'#b9c5c2',darkMetal:'#4c6062',red:'#f06154',green:'#4ce3a5',blue:'#51ddeb'};
// Broad leaf-spring sections, not round wooden pipes. Keep the native limb-tip
// and riser coordinates so the two animated string halves still meet the bow.
function center(side,t){return [YC+side*(.06+.34*t),-.04-.2*t];}
function leaf(side,x0,x1,zOffset=0){
 const pos=[],ix=[],steps=1;
 for(let j=0;j<=steps;j++){
  const t=j/steps,[y,z]=center(side,t),taper=1-.24*t;
  pos.push(x0*taper,y,z+zOffset,x1*taper,y,z+zOffset);
 }
 for(let j=0;j<steps;j++){const a=2*j;ix.push(a,a+1,a+2,a+1,a+3,a+2);}
 if((side<0)!==(zOffset<0))for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
// Flat authored marble print. Keep the existing vein path; no retail trace.
// The rear plane is z = -.04 - .2*t - .005. Offset 50 micrometres
// along its normal to avoid coplanar overlap, instead of raised round cords.
function marblePrint(points,side){
 const normal=new THREE.Vector3(0,-side*.2,-.34).normalize(),pos=[],ix=[];
 for(let i=0;i<points.length;i++){
  const a=new THREE.Vector3(...points[Math.max(0,i-1)]),b=new THREE.Vector3(...points[Math.min(points.length-1,i+1)]);
  const across=b.sub(a).normalize().cross(normal).normalize().multiplyScalar(.00045);
  const center=new THREE.Vector3(...points[i]);center.z+=.0007;center.addScaledVector(normal,.00005);
  for(const sign of [-1,1]){const v=center.clone().addScaledVector(across,sign);pos.push(v.x,v.y,v.z);}
 }
 for(let i=0;i<points.length-1;i++){const a=i*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();
 const n=g.attributes.normal;if(new THREE.Vector3(n.getX(0),n.getY(0),n.getZ(0)).dot(normal)<0){for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];g.setIndex(ix);g.computeVertexNormals();}
 return g;
}
function solidLeaf(side){
 const front=leaf(side,-.024,.024,.005),back=leaf(side,-.024,.024,-.005);
 // A closed bevelled-width section: broad front/back plus narrow side walls.
 const p=new Pieces();p.add(front,C.marble,M.satin);p.add(back,C.marble,M.satin);
 for(const x of [-.024,.024]){
  const points=[];for(let j=0;j<=16;j++){const t=j/16,[y,z]=center(side,t);points.push([x*(1-.24*t),y,z]);}
  p.add(pipe(points,.0045,24,5),C.marble,M.satin);
 }
 return p;
}
function appendBody(d,p){d.body.dispose();d.body=p.build();}
function build(fresh){
 const d=base.build(fresh),body=new Pieces(),ink=new Pieces();
 // Native grip shape/axes and trigger stay untouched; the side stone/marble
 // treatment is fixed color, never sampled from the owner's ink uniform.
 pistolGrip(body,{color:C.marble,triggerColor:'#16171a',guardColor:C.black,baseColor:C.black});
 for(const side of [1,-1]){
  body.merge(solidLeaf(side));
  // Three parallel RGB bands on the projectile-facing face, with marble rails.
  for(const [x0,x1,col] of [[-.017,-.006,C.red],[-.0055,.0055,C.green],[.006,.017,C.blue]])body.add(leaf(side,x0,x1,.0057),col,M.gloss);
  // Dark rods and clamps on the user's face. Rods are distinct from the
  // animated main bowstring; these static rails must never be re-aimed.
  for(const x of [-.014,.014]){
   const pts=[];for(let j=0;j<=8;j++){const t=j/8,[y,z]=center(side,t);pts.push([x*(1-.24*t),y,z-.011]);}
   body.add(pipe(pts,.0018,24,6),C.black,M.satin);
  }
  for(const t of [.38,.73]){const [y,z]=center(side,t);body.add(box(.044*(1-.24*t),.009,.009,0,y,z-.011,.15,6,4),C.black,M.satin);}
  const [y0,z0]=center(side,0),[yt,zt]=center(side,1);
  body.add(box(.058,.045,.026,0,y0,z0,.2,6,4),C.black,M.satin);
  body.add(box(.043,.024,.023,0,yt,zt,.2,6,4),C.black,M.satin);
  // Fine grey vein strokes on the white back. This is an explicitly authored
  // procedural marble approximation, not a claimed retail texture trace.
  for(let k=0;k<3;k++){
   const pts=[];for(let j=0;j<=14;j++){const t=j/14,[y,z]=center(side,t),x=(-.016+k*.014)*(1-.24*t)+.002*Math.sin(t*27+k);pts.push([x,y,z-.0057]);}
   body.add(marblePrint(pts,side),C.vein,M.print);
  }
 }
 body.add(box(.034,.17,.04,0,YC,-.04,.3),C.black,M.satin);
 body.add(box(.026,.07,.07,0,YC-.04,0,.3),C.black,M.satin);
 // Three forward tubes: dark metallic shells, pale collars, dark outer caps,
 // and team-ink only inside their open bores. Never color the whole reel ink.
 const tubes=[[YC,.052,-.052,.175],[YC+.1,.021,.005,.135],[YC-.1,.021,.005,.135]];
 for(const [y,r,z0,z1] of tubes){
  body.add(zlathe([[r*.73,z0],[r,z0+.008],[r,z1-.040],[r*.90,z1-.022],[r*.84,z1-.014],[r*.68,z1-.014],[r*.68,z0],[r*.73,z0]],0,y,0,24),C.darkMetal,M.metal);
  // Official rotation shows broad pale stepped collars, not thin wire rings.
  // Twelve-sided outer shoulder is a bounded procedural estimate.
  for(const z of [z0+.028,z1-.045])body.add(zlathe([[r-.001,z-.0055],[r+.001,z-.0055],[r+.003,z-.003],[r+.003,z+.003],[r+.001,z+.0055],[r-.001,z+.0055],[r-.001,z-.0055]],0,y,0,12),C.steel,M.satin);
  body.add(zlathe([[r*.66,z1-.015],[r*.95,z1-.015],[r*.90,z1-.004],[r*.86,z1],[r*.66,z1]],0,y,0,24),C.black,M.satin);
  for(let k=0;k<12;k++){const a=k*Math.PI/6;body.add(box(.003,.003,.013,Math.cos(a)*r*.92,y+Math.sin(a)*r*.92,z1-.007,.1,4,4),C.steel,M.metal);}
  ink.add(zcyl(r*.65,z1-.004,z1-.003,0,y,20),'#ffffff',M.gloss);
 }
 // Broad curved pale braces join the forward centre collar to both side
 // collars in the observed official oblique frame. Keep native tube axes.
 // Width/thickness are authored estimates, not calibrated retail dimensions.
 for(const side of [-1,1]){
  const profile=[[.135,YC+side*.050],[.135,YC+side*.058],[.129,YC+side*.065],
   [.100,YC+side*.075],[.096,YC+side*.083],[.085,YC+side*.083],
   [.088,YC+side*.071],[.121,YC+side*.058],[.124,YC+side*.050]];
  body.add(slab(profile,.012,0,.002),C.steel,M.satin);
 }
 // Dark reel housing behind the centre tube and light faceted rim. The
 // procedural emblem is omitted rather than substituting a misleading badge.
 body.add(zlathe([[0,-.085],[.057,-.085],[.064,-.077],[.064,-.059],[.05,-.05],[0,-.05]],0,YC,0,12),C.black,M.satin);
 body.add(ring(.052,.0025,0,YC,-.086,'z',5,12),C.steel,M.metal);
 for(const side of [1,-1])body.add(box(.012,.06,.014,0,YC+side*.06,.03,.3),C.steel,M.metal);
 // Three elongated capsule bulbs along the left limb in native ground-roll
// orientation (the lower Y limb becomes the holder's left after ground roll).
 for(let k=0;k<3;k++){
  const t=.73+k*.085,[y,z]=center(-1,t),col=[C.red,C.green,C.blue][k];
  body.add(xlathe([[0,.018],[.007,.018],[.007,.027],[0,.027]],0,y,z,12),C.steel,M.metal);
  body.add(xlathe([[0,.025],[.007,.025],[.009,.03],[.009,.052],[.006,.057],[0,.059]],0,y,z,16),col,M.gloss);
 }
 appendBody(d,body);d.ink.dispose();d.ink=ink.build();
 // Black resting strings are observed in the official render. Preserve each
 // half's exact geometry, pivot and native transform, changing only ownership.
 for(const n of ['string','stringL']){
  const p=d.parts[n],c=p.src.attributes.color.clone(),black=new THREE.Color(C.black);
  for(let i=0;i<c.count;i++)c.setXYZ(i,black.r,black.g,black.b);p.src.setAttribute('color',c);p.mat='body';
 }
 return d;
}
export const FOLLOWUP_MODELS=Object.freeze({Stringer_Normal_02:Object.freeze({...base,
 sourceRow:'Stringer_Normal_02',baseId:'s3-stringer-normal',name:'Bulbz Tri-Stringer',
 sourceUrl:'https://splatoonwiki.org/wiki/File:S3_Bulbz_Tri-Stringer_model_rotating.mp4',build,
 // Existing charge/release motion and glow remain native. Do not invent a
 // separate firing-color timer from secondary descriptive prose.
})});
