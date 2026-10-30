// Bounded, renderer-independent bookkeeping. Never changes gameplay paint.
const MAX_AXIS=64,MAX_RECTS=128;
/** Pure conservative wet-region bookkeeper; one bounded grid per atlas. */
export class PaintDryRegions {
  constructor(size, top = 1) {
    if (!Number.isInteger(size) || size < 1 || !Number.isFinite(top)) throw new RangeError('Invalid paint atlas');
    this.size = size;
    this.axis = Math.min(MAX_AXIS, size);
    this.tile = size / this.axis;
    this.top = Math.max(-1, Math.min(1, top));
    this.expiry = new Float64Array(this.axis * this.axis);
    this.rects = new Int16Array(this.axis * this.axis * 4);
    this.previous = new Int16Array((this.axis + 1) * (this.axis + 1));
    this.credit = 0;
    this.dirty = true;
    this.full = false;
    this.count = 0;
    this.live = 0;
    this.nextExpiry = Infinity;
  }
  reset() {
    this.expiry.fill(0); this.credit = 0; this.dirty = true;
    this.live = 0; this.full = false; this.count = 0; this.nextExpiry = Infinity;
  }
  expire() {
    // Marks can refresh a tile before its old deadline. A stale earlier
    // deadline only causes an extra scan; it can never expire ink too early.
    if (!this.live || this.credit < this.nextExpiry) return;
    let removed = false, next = Infinity;
    for (let i=0; i<this.expiry.length; i++) {
      const expiry = this.expiry[i];
      if (expiry && expiry <= this.credit) {
        this.expiry[i] = 0; this.live--; removed = true;
      } else if (expiry && expiry < next) next = expiry;
    }
    this.nextExpiry = next;
    if (removed) this.dirty = true;
  }
  markPositions(positions, quads, nextCredit) {
    const n=this.axis, nMax=n-1, N=this.size, tile=this.tile, expiry=nextCredit+256, exp=this.expiry;
    if (quads > 0 && expiry < this.nextExpiry) this.nextExpiry = expiry;
    for(let i=0;i<quads;i++) {
      const at=i*8;
      const ax=positions[at], bx=positions[at+2], ay=positions[at+1], by=positions[at+5];
      if (!Number.isFinite(ax)||!Number.isFinite(bx)||!Number.isFinite(ay)||!Number.isFinite(by)) {
        exp.fill(expiry);this.live=n*n;this.dirty=true;return;
      }
      // A two-texel guard covers clipping/raster subpixel precision. We use
      // submitted Float32 clip coordinates, not rounded gameplay extents.
      const minX=ax<=bx?ax:bx, maxX=ax>=bx?ax:bx;
      const minY=ay<=by?ay:by, maxY=ay>=by?ay:by;
      let x0=Math.floor(((minX+1)*.5*N-2)/tile); if(x0<0)x0=0; else if(x0>nMax)x0=nMax;
      let x1=Math.floor(((maxX+1)*.5*N+2)/tile); if(x1<0)x1=0; else if(x1>nMax)x1=nMax;
      let y0=Math.floor(((minY+1)*.5*N-2)/tile); if(y0<0)y0=0; else if(y0>nMax)y0=nMax;
      let y1=Math.floor(((maxY+1)*.5*N+2)/tile); if(y1<0)y1=0; else if(y1>nMax)y1=nMax;
      for(let y=y0;y<=y1;y++) {
        const row=y*n;
        for(let x=x0;x<=x1;x++) {
          const k=row+x;
          if(!exp[k]){this.live++;this.dirty=true;}
          exp[k]=expiry;
        }
      }
    }
  }
  // Rectangles come from the canonical profile shader support bounds. They
  // already include antialias and raster guards; retain another two texels.
  markPixelRects(rectangles, count, nextCredit) {
    const n=this.axis, nMax=n-1, tile=this.tile, expiry=nextCredit+256, exp=this.expiry;
    if (count > 0 && expiry < this.nextExpiry) this.nextExpiry = expiry;
    for(let i=0;i<count;i++) {
      const k=i*4,x=rectangles[k],y=rectangles[k+1],w=rectangles[k+2],h=rectangles[k+3];
      if(w<=0||h<=0)continue;
      let x0=Math.floor((x-2)/tile); if(x0<0)x0=0; else if(x0>nMax)x0=nMax;
      let x1=Math.floor((x+w+2)/tile); if(x1<0)x1=0; else if(x1>nMax)x1=nMax;
      let y0=Math.floor((y-2)/tile); if(y0<0)y0=0; else if(y0>nMax)y0=nMax;
      let y1=Math.floor((y+h+2)/tile); if(y1<0)y1=0; else if(y1>nMax)y1=nMax;
      for(let row=y0;row<=y1;row++){
        const r=row*n;
        for(let col=x0;col<=x1;col++) {
          const at=r+col;
          if(!exp[at]){this.live++;this.dirty=true;}
          exp[at]=expiry;
        }
      }
    }
  }
  rebuild() {
    if(!this.dirty)return false;
    this.dirty=false;this.count=0;this.full=false;
    const n=this.axis, rows=Math.min(n,Math.ceil((this.top+1)*.5*n));
    // Dense or fragmented ink uses the unchanged original single quad.
    if(this.live>=n*rows*.65){this.full=true;return true;}
    this.previous.fill(-1);
    for(let y=0;y<rows;y++) {
      for(let x=0;x<n;) {
        if(!this.expiry[y*n+x]){x++;continue;}
        const x0=x;while(x<n&&this.expiry[y*n+x])x++;
        const x1=x,key=x0*(n+1)+x1, prev=this.previous[key];
        if(prev>=0&&this.rects[prev*4+3]===y){this.rects[prev*4+3]=y+1;continue;}
        if(this.count>=MAX_RECTS){this.full=true;this.count=0;return true;}
        const at=this.count++*4;this.previous[key]=at/4;
        this.rects[at]=x0;this.rects[at+1]=y;this.rects[at+2]=x1;this.rects[at+3]=y+1;
      }
    }
    return true;
  }
}

