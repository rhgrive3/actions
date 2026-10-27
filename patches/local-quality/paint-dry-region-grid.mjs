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
  }
  reset() {
    this.expiry.fill(0); this.credit = 0; this.dirty = true;
    this.live = 0; this.full = false; this.count = 0;
  }
  expire() {
    let removed = false;
    for (let i=0; i<this.expiry.length; i++) {
      if (this.expiry[i] && this.expiry[i] <= this.credit) {
        this.expiry[i] = 0; this.live--; removed = true;
      }
    }
    if (removed) this.dirty = true;
  }
  markPositions(positions, quads, nextCredit) {
    const n=this.axis, N=this.size, tile=this.tile, expiry=nextCredit+256;
    for(let i=0;i<quads;i++) {
      const at=i*8;
      const ax=positions[at], bx=positions[at+2], ay=positions[at+1], by=positions[at+5];
      if (!Number.isFinite(ax)||!Number.isFinite(bx)||!Number.isFinite(ay)||!Number.isFinite(by)) {
        this.expiry.fill(expiry);this.live=n*n;this.dirty=true;return;
      }
      // A two-texel guard covers clipping/raster subpixel precision. We use
      // submitted Float32 clip coordinates, not rounded gameplay extents.
      const x0=Math.max(0,Math.min(n-1,Math.floor(((Math.min(ax,bx)+1)*.5*N-2)/tile)));
      const x1=Math.max(0,Math.min(n-1,Math.floor(((Math.max(ax,bx)+1)*.5*N+2)/tile)));
      const y0=Math.max(0,Math.min(n-1,Math.floor(((Math.min(ay,by)+1)*.5*N-2)/tile)));
      const y1=Math.max(0,Math.min(n-1,Math.floor(((Math.max(ay,by)+1)*.5*N+2)/tile)));
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
        const k=y*n+x;
        if(!this.expiry[k]){this.live++;this.dirty=true;}
        this.expiry[k]=expiry;
      }
    }
  }
  // Rectangles come from the canonical profile shader support bounds. They
  // already include antialias and raster guards; retain another two texels.
  markPixelRects(rectangles, count, nextCredit) {
    const n=this.axis,tile=this.tile,expiry=nextCredit+256;
    for(let i=0;i<count;i++) {
      const k=i*4,x=rectangles[k],y=rectangles[k+1],w=rectangles[k+2],h=rectangles[k+3];
      if(w<=0||h<=0)continue;
      const x0=Math.max(0,Math.min(n-1,Math.floor((x-2)/tile)));
      const x1=Math.max(0,Math.min(n-1,Math.floor((x+w+2)/tile)));
      const y0=Math.max(0,Math.min(n-1,Math.floor((y-2)/tile)));
      const y1=Math.max(0,Math.min(n-1,Math.floor((y+h+2)/tile)));
      for(let row=y0;row<=y1;row++)for(let col=x0;col<=x1;col++) {
        const at=row*n+col;
        if(!this.expiry[at]){this.live++;this.dirty=true;}
        this.expiry[at]=expiry;
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

