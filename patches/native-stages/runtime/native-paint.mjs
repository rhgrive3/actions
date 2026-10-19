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
