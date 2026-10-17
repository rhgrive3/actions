// Independent flat-floor scoring oracle for the existing sphere/half-ellipse
// contract and the reviewed main-body profiles. This scans every cell and
// samples a pinned byte fixture; it imports no production mask, profile
// generator, paint raster, culling or geometry functions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const referenceBytes=fs.readFileSync(new URL('../fixtures/main-ink-profile-edges-20261017.json', import.meta.url));
assert.equal(createHash('sha256').update(referenceBytes).digest('hex'),'f529e104eb5587cab43a7f35793dcb743030c7d314206c418766e586152bda20','immutable reviewed profile fixture');
const reference=JSON.parse(referenceBytes);
const profileKinds = Object.keys(reference.profiles);
assert.equal(reference.columns,128);
const bytes=new Uint8Array(128*8*4);
profileKinds.forEach((kind,row)=>reference.profiles[kind].forEach(([left,right],column)=>{
  const i=(row*128+column)*4;bytes[i]=left;bytes[i+1]=right;bytes[i+3]=255;
}));
assert.equal(createHash('sha256').update(bytes).digest('hex'),reference.rgbaSha256,'frozen oracle edge bytes');
export const profileBytesHash = reference.rgbaSha256;

function selectedProfile(stamp) {
  if(profileKinds.includes(stamp.kind))return stamp.kind;
  return ['source-shot','source-splash'].includes(stamp.kind)&&profileKinds.includes(stamp.footprint)
    ?stamp.footprint:null;
}
export function isSourcedStamp(stamp) {
  return stamp.kind==='source-shot'||stamp.kind==='source-splash'||selectedProfile(stamp)!==null;
}
const vector=v=>Array.isArray(v)?v:[v.x,v.y,v.z];

export function compileFlatSourcedStamp(stamp) {
  assert.ok(isSourcedStamp(stamp),'oracle requires a source stamp');
  if(stamp.cosmetic)return()=>false;
  const center=vector(stamp.center),R=stamp.radius,height=center[1];
  if(height>R||height<-.12)return()=>false;
  const radiusSquared=R*R-height*height;
  if(radiusSquared<=.02*.02)return()=>false;
  const radius=Math.sqrt(radiusSquared),s=stamp.stretch?vector(stamp.stretch):null;
  const length=s?Math.hypot(s[0],s[2]):0,oriented=length>.2;
  const dx=oriented?s[0]/length:1,dz=oriented?s[2]/length:0;
  const stretch=oriented?(stamp.stretchAmt??1)*length:0,profile=selectedProfile(stamp);
  if(profile) {
    assert.ok(Number.isFinite(stamp.seed),'profile mirror comes from the recorded seed');
    // A Float32 seed supplies one exact low bit; no new random draw is made.
    const seed=Math.fround(stamp.seed),mirror=Math.floor((seed-Math.floor(seed))*65536)%2===1;
    const edges=reference.profiles[profile];
    return(x,z)=>{
      const rx=x-center[0],rz=z-center[2],longitudinal=rx*dx+rz*dz;
      const along=longitudinal/(radius*(1+stretch*(longitudinal>0?1:.25)));
      if(along<=-1||along>=1)return false;
      const across=(-rx*dz+rz*dx)/radius*(mirror?-1:1);
      const position=(along+1)*63.5,column=Math.floor(position),fraction=position-column,side=across<0?0:1;
      const width=(edges[column][side]*(1-fraction)+edges[column+1][side]*fraction)/255;
      return Math.abs(across)<width;
    };
  }
  return(x,z)=>{
    const rx=x-center[0],rz=z-center[2];
    if(!oriented)return rx*rx+rz*rz<=radiusSquared;
    const along=rx*dx+rz*dz,across=-rx*dz+rz*dx;
    const depth=1+stretch*(along>0?1:.25);
    return (along/depth)**2+across**2<=radiusSquared;
  };
}

export function rasterFlatSourcedStamp(paint,grid,stamp) {
  const owns=compileFlatSourcedStamp(stamp);
  for(const face of paint.paintFaces) {
    assert.equal(face.origin.y,0,'flat-floor oracle');
    assert.deepEqual(Array.from(face.u.toArray()),[1,0,0]);
    assert.deepEqual(Array.from(face.v.toArray()),[0,0,1]);
    for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++) {
      const index=face.grid+j*face.nu+i;
      if(paint.dead?.[index])continue;
      const x=face.origin.x+(i+.5)*face.cu,z=face.origin.z+(j+.5)*face.cv;
      if(owns(x,z))grid[index]=stamp.team+1;
    }
  }
}
