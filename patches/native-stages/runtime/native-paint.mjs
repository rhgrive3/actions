// A rolling stamp covers the drum's width, not just the chart under its centre.
// Native source charts split one physical floor by object and 8m tile. Keep the
// event's struck face/seed, but let that contact reach other charts on its plane.
export function nativeContactFace(level, faceId, kind) {
 if (!level.native || kind !== 'ink-contact' || !Number.isInteger(faceId) || faceId < 0) return null;
 const face = level.faces[faceId];
 return face?.turf ? face : null;
}

// Source charts split one physical floor by object, 8 m tile and quantised
// plane, and a curved ramp is one chart per triangle with its own normal. A
// stamp must reach every chart the ink actually touches: an adjacent floor of
// another object at the same height (within millimetres, not 0.1 mm), and the
// next facets of a ramp or a crest leading down a slope. With the strike
// position, a chart qualifies when its normal lies within SURFACE_COS of the
// struck chart's and its own plane passes the strike within the same height
// as the struck plane does (to SURFACE_PLANE metres): a parallel floor above
// or below, a wall and a thin ceiling (opposite normal) never qualify.
// Without a position the former plane-offset rules remain.
const SURFACE_COS = .85;
function strikeOffset(face, p) {
 const n = face.n, o = face.origin;
 return (p.x-o.x)*n.x + (p.y-o.y)*n.y + (p.z-o.z)*n.z;
}
function sameStrikeSurface(reference, face, at, plane) {
 const n = reference.n, m = face.n;
 if (n.x*m.x + n.y*m.y + n.z*m.z <= SURFACE_COS) return false;
 return Math.abs(strikeOffset(face, at) - strikeOffset(reference, at)) <= plane;
}

export function nativeContactCoplanar(reference, face, at = null) {
 if (reference === face) return true;
 if (!face?.turf) return false;
 if (at) return sameStrikeSurface(reference, face, at, CONTACT_PLANE);
 const n = reference.n, m = face.n;
 if (Math.abs(n.x*m.x + n.y*m.y + n.z*m.z - 1) > 1e-6) return false;
 const a = reference.origin, b = face.origin;
 return Math.abs((b.x-a.x)*n.x + (b.y-a.y)*n.y + (b.z-a.z)*n.z) <= 1e-4;
}
// A rolling drum rests on the floor: a 5 cm seam or bevel is the same floor.
const CONTACT_PLANE = .05;

// A face-locked impact (main weapon shot, drop, trail) keeps its struck chart as
// the ownership seed. Native charts split one physical surface by object, 8 m tile
// and quantised plane, so the same surface's neighbouring chart must take the ink
// too. Only the same normal within FACE_LOCK_PLANE metres of the reference plane
// qualifies: a thin ceiling (opposite normal), a raised or lowered floor (plane
// offset) and a wall (other normal) never inherit the splat.
// FACE_LOCK_PLANE matches the 0.12 m below-plane gate of unlocked splats, so a
// deck plate overlapping the struck floor by a small step still takes the ink.
const FACE_LOCK_COS = .999, FACE_LOCK_PLANE = .12;
export function nativeFaceLockFace(level, faceId) {
 if (!level.native || !Number.isInteger(faceId) || faceId < 0) return null;
 return level.faces[faceId] || null;
}
export function nativeFaceLockCoplanar(reference, face, at = null) {
 if (reference === face) return true;
 if (!face) return false;
 if (at) return sameStrikeSurface(reference, face, at, FACE_LOCK_PLANE);
 const n = reference.n, m = face.n;
 if (n.x*m.x + n.y*m.y + n.z*m.z <= FACE_LOCK_COS) return false;
 const a = reference.origin, b = face.origin;
 const offset = (x, y, z) => (x-a.x)*n.x + (y-a.y)*n.y + (z-a.z)*n.z;
 if (Math.abs(offset(b.x, b.y, b.z)) > FACE_LOCK_PLANE) return false;
 // The far corner rejects a tilted neighbour whose origin happens to sit on the plane.
 const far = offset(b.x + face.u.x*face.su + face.v.x*face.sv,
   b.y + face.u.y*face.su + face.v.y*face.sv, b.z + face.u.z*face.su + face.v.z*face.sv);
 return Math.abs(far) <= FACE_LOCK_PLANE;
}

// Owner report 2026-11-10: block-built stages (the Practice Range, the original
// arenas) are made of one box per zone, so the next floor at the same height is
// another block's face. A face-locked stamp (a Roller's rolling contact, a shot
// or drop striking the floor) stayed on the struck face only: rolling along the
// Long Lane's edge never inked the Target Gallery floor beside it. Block faces
// are exact planes, so only a face with the same normal on the same plane (to
// BLOCK_LOCK_PLANE metres, origin and far corner) shares the stamp: a raised
// plate, a step, a wall or an underside never does.
const BLOCK_LOCK_COS = .999, BLOCK_LOCK_PLANE = .02;
// A stamp whose reach stays inside the struck face cannot meet another face, so
// it keeps the direct-face path (no broadphase). Instant stamps (ranked zone
// capture, which owns one face cell at a time) stay on their face as before.
export function blockFaceLockFace(level, faceId, center = null, reach = 0, opts = null) {
 if (!level || level.native || opts?.instant || !Number.isInteger(faceId) || faceId < 0) return null;
 const f = level.faces?.[faceId];
 if (!f) return null;
 if (center && f.origin && f.u && f.v && Number.isFinite(f.su) && Number.isFinite(f.sv)) {
  const dx = center.x - f.origin.x, dy = center.y - f.origin.y, dz = center.z - f.origin.z;
  const u = dx*f.u.x + dy*f.u.y + dz*f.u.z, v = dx*f.v.x + dy*f.v.y + dz*f.v.z;
  if (u - reach >= 0 && u + reach <= f.su && v - reach >= 0 && v + reach <= f.sv) return null;
 }
 return f;
}
export function blockFaceLockCoplanar(reference, face) {
 if (reference === face) return true;
 if (!face?.n || !reference?.n) return false;
 const n = reference.n, m = face.n;
 if (n.x*m.x + n.y*m.y + n.z*m.z <= BLOCK_LOCK_COS) return false;
 const a = reference.origin, b = face.origin;
 const offset = (x, y, z) => (x-a.x)*n.x + (y-a.y)*n.y + (z-a.z)*n.z;
 if (Math.abs(offset(b.x, b.y, b.z)) > BLOCK_LOCK_PLANE) return false;
 const far = offset(b.x + face.u.x*face.su + face.v.x*face.sv,
   b.y + face.u.y*face.su + face.v.y*face.sv, b.z + face.u.z*face.su + face.v.z*face.sv);
 return Math.abs(far) <= BLOCK_LOCK_PLANE;
}

// #264: sub-cell dot cores can claim without exceeding the legacy fixed-sample
// margin. Native cache pruning must opt into the same ownership rule.
/** Conservative maximum interior depth of the existing signed-distance pieces.
 * A piece whose radius never exceeds the shader ownership margin cannot claim
 * any cell. Skipping it preserves CPU paint, independent of grid/face location. */
export function nativePieceHasInterior(mask,p,subcellDots=false){
 if(subcellDots&&(p.type===1||p.type===2))return p.radius>0;
 let depth;
 if(p.type===0)depth=Math.max(p.ra,p.rb);
 else if(p.type===1||p.type===2)depth=p.radius;
 else if(p.type===3)depth=Math.max(p.w,p.w*(1.2+.35*p.h2)*(.6+.4*mask.dT));
 else return true;
 // Retain near-equality cases to cover floating-point interpolation roundoff.
 return depth+Math.max(1e-12,Math.abs(depth)*1e-12)>=mask.margin;
}

/** Uniform upper bound of every current ray/satellite/drip SDF interior.
 * Pixel-sized bead heads reach at most 1.35 pixels; ownership needs 1.5.
 * Physical pieces reach at most 0.13981*r. Keep a roundoff guard. */
export function nativeAncillaryCanClaim(R,dn,ppm,subcellDots=false){
 if(subcellDots)return R>0.02&&R*R-dn*dn>0.0004;
 if(!Number.isFinite(R+dn+ppm))return true;
 const r=Math.sqrt(Math.max(0,R*R-dn*dn)),pixel=1/Math.max(ppm||1,1);
 return Math.max(.14*r,1.35*pixel)+1e-10>=1.5*pixel;
}

/** Cached ancillary mask of one ownership pass, or undefined. Equality is
 * that of the former joined String key: === per field, NaN equal to NaN. The
 * Map key dn uses SameValueZero, which is exactly that relation. Each bucket
 * is a flat [wall, ppm, sdu, sdv, sa, mask] list. Self-contained: tests
 * compose these functions into the ownership module by source text. */
export function nativeAncillaryMaskFind(masks,wall,ppm,dn,sdu,sdv,sa){
 const same=(a,b)=>a===b||(a!==a&&b!==b),list=masks.get(dn);
 if(list)for(let i=0;i<list.length;i+=6)
  if(same(list[i+2],sdu)&&same(list[i+3],sdv)&&same(list[i+4],sa)&&same(list[i],wall)&&same(list[i+1],ppm))return list[i+5];
 return undefined;
}
export function nativeAncillaryMaskStore(masks,wall,ppm,dn,sdu,sdv,sa,mask){
 const list=masks.get(dn);
 if(list)list.push(wall,ppm,sdu,sdv,sa,mask);else masks.set(dn,[wall,ppm,sdu,sdv,sa,mask]);
}
/** Replace the value of an entry nativeAncillaryMaskFind finds (same
 * equality), e.g. the growth pass's first-face marker false. */
export function nativeAncillaryMaskReplace(masks,wall,ppm,dn,sdu,sdv,sa,mask){
 const same=(a,b)=>a===b||(a!==a&&b!==b),list=masks.get(dn);
 if(list)for(let i=0;i<list.length;i+=6)
  if(same(list[i+2],sdu)&&same(list[i+3],sdv)&&same(list[i+4],sa)&&same(list[i],wall)&&same(list[i+1],ppm)){list[i+5]=mask;return;}
 throw Error('Native ancillary mask entry missing');
}

/** #1671: per growth-record entry slot of non-drip ancillary pieces, valid
 * from tn >= 1.45 while R, kind, seed, contract shapes and the mask-key fields
 * stay identical (=== per field, NaN equal to NaN). Self-contained, as above. */
export function nativeSettledAncillarySlot(g,index){
 const slots=g._s3SettledAncillary||(g._s3SettledAncillary=[]);
 return slots[index]||(slots[index]={stored:false});
}
export function nativeSettledAncillaryMatches(slot,g,contract,wall,ppm,dn,sdu,sdv,sa){
 const same=(a,b)=>a===b||(a!==a&&b!==b);
 return slot.stored&&slot.shapes===contract.shapes&&same(slot.R,g.R)&&same(slot.kind,g.kind)&&same(slot.gSeed,g.seed)&&
  same(slot.dn,dn)&&same(slot.sdu,sdu)&&same(slot.sdv,sdv)&&same(slot.sa,sa)&&same(slot.wall,wall)&&same(slot.ppm,ppm);
}
export function nativeStoreSettledAncillary(slot,g,contract,wall,ppm,dn,sdu,sdv,sa,pieces,margin,seed){
 slot.stored=true;slot.shapes=contract.shapes;slot.R=g.R;slot.kind=g.kind;slot.gSeed=g.seed;
 slot.wall=wall;slot.ppm=ppm;slot.dn=dn;slot.sdu=sdu;slot.sdv=sdv;slot.sa=sa;
 slot.pieces=pieces;slot.margin=margin;slot.seed=seed;
 // The same contract with every shape count but drips set to zero.
 slot.dripContract={...contract,shapes:contract.shapes.map(s=>s?[0,0,0,s[3]]:s)};
}
