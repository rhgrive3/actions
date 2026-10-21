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
