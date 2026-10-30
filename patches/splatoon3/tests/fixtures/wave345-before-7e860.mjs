// Extracted verbatim from 7e8601d233e2a56ee175f0c459ed304621e870b5.
// Oracle for the pre-Wave 3-5 interpolation and clam distance laws.
const HISTORY_CAPACITY=32,HISTORY_HZ=60,EPS=1e-9;
const {max,min,abs,sqrt}=Math;
const clamp=(n,a=0,b=1)=>max(a,min(b,n));
function firstThreeFinite(value) {
  return finiteTripleAt(value, 0, Number.isFinite);
}
function finiteTripleAt(value, offset, finite) {
  if (!Array.isArray(value) || value.length < offset + 3) return false;
  if (value.slice !== Array.prototype.slice || value.constructor !== Array ||
      Array[Symbol.species] !== Array) return value.slice(offset, offset + 3).every(finite);
  const hasX = offset in value, x = hasX ? value[offset] : undefined;
  const hasY = offset + 1 in value, y = hasY ? value[offset + 1] : undefined;
  const hasZ = offset + 2 in value, z = hasZ ? value[offset + 2] : undefined;
  return (!hasX || finite(x)) && (!hasY || finite(y)) && (!hasZ || finite(z));
}
const vec=value=>firstThreeFinite(value)?[value[0],value[1],value[2]]:[0,0,0];
export class ProjectileHistory {
  constructor() { this.data = new Float64Array(HISTORY_CAPACITY * 7); this.reset(); }
  reset() { this.count = 0; this.next = 0; this.latestAge = 0; }
  record(age, x, y, z, vx, vy, vz) {
    if (!Number.isFinite(age) || !Number.isFinite(x+y+z+vx+vy+vz)) return false;
    if (this.count && age < this.latestAge - EPS) return false;
    let i;
    if (this.count && Math.abs(age - this.latestAge) <= EPS)
      i = (this.next + HISTORY_CAPACITY - 1) % HISTORY_CAPACITY;
    else { i=this.next; this.next=(i+1)%HISTORY_CAPACITY; this.count=Math.min(HISTORY_CAPACITY,this.count+1); }
    const o=i*7, a=this.data;
    a[o]=age; a[o+1]=x; a[o+2]=y; a[o+3]=z; a[o+4]=vx; a[o+5]=vy; a[o+6]=vz;
    this.latestAge=age; return true;
  }
  get oldestAge() { return this.count ? this.data[((this.next-this.count+HISTORY_CAPACITY)%HISTORY_CAPACITY)*7] : 0; }
  sample(age, out, offset=0) {
    if (!this.count) { for(let j=0;j<6;j++)out[offset+j]=0; return false; }
    const a=this.data, first=(this.next-this.count+HISTORY_CAPACITY)%HISTORY_CAPACITY;
    if(age<=a[first*7] || age>=this.latestAge || this.count===1) {
      const o=age<=a[first*7]?first*7:((this.next+HISTORY_CAPACITY-1)%HISTORY_CAPACITY)*7;
      for(let j=0;j<6;j++)out[offset+j]=a[o+j+1]; return true;
    }
    // Actual histories are sampled on a60Hz grid: direct addressing is O(1).
    // Adjust locally for fractional births/final samples; arbitrary public
    // record() times remain valid without assuming every gap is exactly1/60.
    let j=clamp(((age-a[first*7])*HISTORY_HZ)|0,0,this.count-2);
    let lo=((first+j)%HISTORY_CAPACITY)*7,hi=((first+j+1)%HISTORY_CAPACITY)*7;
    // Preserve the previous scan's incoming-segment tangent at exact grid
    // knots, including its EPS boundary, while avoiding a scan from oldest.
    while(j>0&&a[lo]>=age-EPS){j--;lo=((first+j)%HISTORY_CAPACITY)*7;hi=((first+j+1)%HISTORY_CAPACITY)*7;}
    while(j<this.count-2&&a[hi]<age-EPS){j++;lo=hi;hi=((first+j+1)%HISTORY_CAPACITY)*7;}
    const span=a[hi]-a[lo], inverseSpan=1/max(EPS,span),u=clamp((age-a[lo])*inverseSpan), u2=u*u, u3=u2*u;
    const h00=2*u3-3*u2+1, h10=u3-2*u2+u, h01=-2*u3+3*u2, h11=u3-u2;
    for(let j=0;j<3;j++) {
      const delta=a[hi+1+j]-a[lo+1+j];
      let m0=span*a[lo+4+j],m1=span*a[hi+4+j];
      // Bounded Hermite tangents prevent a collision-truncated segment from
      // overshooting beyond its final contact sample. This slope limiter is an
      // INKWAVE interpolation choice, not recovered Nintendo effect code.
      if(abs(delta)<EPS){m0=0;m1=0;}
      else {
        if(m0*delta<0)m0=0;if(m1*delta<0)m1=0;
        const d0=m0/delta,d1=m1/delta,q2=d0*d0+d1*d1;
        if(q2>9){const scale=3/sqrt(q2);m0*=scale;m1*=scale;}
      }
      out[offset+j]=h00*a[lo+1+j]+h10*m0+h01*a[hi+1+j]+h11*m1;
      out[offset+3+j]=((6*u2-6*u)*a[lo+1+j]+(3*u2-4*u+1)*m0+
        (-6*u2+6*u)*a[hi+1+j]+(3*u2-2*u)*m1)*inverseSpan;
    }
    return true;
  }
}
export class FrozenClamDistance {
_distanceSq(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  }
_pickupDistanceSq(position, target, rejectOutsidePickup = false) {
    // Scalar distance only for ordinary dense finite coordinates. Keep the
    // original vec fallback for short, sparse and otherwise invalid inputs.
    const p = Array.isArray(position) && position.length >= 3 &&
      0 in position && 1 in position && 2 in position &&
      Number.isFinite(position[0]) && Number.isFinite(position[1]) && Number.isFinite(position[2])
      ? position : vec(position);
    // Only reject a pair strictly beyond the existing radius. Keep the exact
    // squared sum near its floating-point boundary and for unusual values.
    const dx = p[0] - target[0], dy = p[1] - target[1], dz = p[2] - target[2];
    if (rejectOutsidePickup && Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz) &&
        (Math.abs(dx) > .820001 || Math.abs(dy) > .820001 || Math.abs(dz) > .820001)) return Infinity;
    return this._distanceSq(p, target);
  }
}
