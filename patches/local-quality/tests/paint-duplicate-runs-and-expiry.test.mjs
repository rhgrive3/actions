import test from 'node:test';
import assert from 'node:assert/strict';
import { PaintDryRegions } from '../paint-dry-region-grid.mjs';
import { buildProfileDrawRuns } from '../paint-profile-draw-runs.mjs';

// Independent original expiration loop. All mark logic is shared.
class SlowRegions extends PaintDryRegions {
  expire() {
    let removed = false;
    for (let i = 0; i < this.expiry.length; i++) {
      if (this.expiry[i] && this.expiry[i] <= this.credit) {
        this.expiry[i] = 0; this.live--; removed = true;
      }
    }
    if (removed) this.dirty = true;
  }
}
const rng = (seed = 34) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);

test('dry region deadline cache retains original behavior over 30k operations', () => {
  const random = rng();
  for (const size of [1, 7, 64, 65, 512, 2048]) {
    const slow = new SlowRegions(size, .73), fast = new PaintDryRegions(size, .73);
    for(let step = 0; step < 5000; step++) {
      const k = random();
      if(k < .02) { slow.reset(); fast.reset(); }
      else if(k < .64) {
        const r = Int32Array.of(random()*size|0,random()*size|0,random()*40|0,random()*40|0);
        const at = slow.credit + random()*10;
        slow.markPixelRects(r, 1, at); fast.markPixelRects(r, 1, at);
      } else if(k < .83) {
        const r = Float32Array.of(random()*2-1,random()*2-1,random(),0,0,random(),0,0);
        if(step%211===0) r[0]=NaN;
        slow.markPositions(r,1,slow.credit);fast.markPositions(r,1,fast.credit);
      } else {
        const dt = random()<.025?-100:random()*80;
        slow.credit+=dt;fast.credit+=dt;slow.expire();fast.expire();
      }
      assert.deepEqual(fast.expiry,slow.expiry);
      assert.equal(fast.live,slow.live);
      assert.equal(fast.dirty,slow.dirty);
      assert.equal(fast.rebuild(),slow.rebuild());
      assert.equal(fast.full,slow.full);
      assert.equal(fast.count,slow.count);
      assert.deepEqual(fast.rects.subarray(0,fast.count*4),slow.rects.subarray(0,slow.count*4));
    }
  }
});

test('identical clipped draw runs preserve geometry order and all effective scissors', () => {
  const random=rng(3412),out=new Int32Array(64*6);
  for(let iteration=0;iteration<12000;iteration++) {
    const count=random()*65|0,rect=new Int32Array(count*4);
    for(let q=0;q<count;q++) {
      if(q&&random()<.4)rect.set(rect.subarray((q-1)*4,q*4),q*4);
      else rect.set([random()*80-15|0,random()*80-15|0,random()*50-5|0,random()*50-5|0],q*4);
    }
    const clip=random()<.5?null:{x:random()*30|0,y:random()*30|0,z:random()*60|0,w:random()*60|0};
    const runs=buildProfileDrawRuns(rect,count,clip,out),actual=[],expected=[];
    for(let q=0;q<count;q++) {
      const k=q*4;let x=rect[k],y=rect[k+1],right=x+rect[k+2],top=y+rect[k+3];
      if(clip){x=Math.max(x,clip.x);y=Math.max(y,clip.y);right=Math.min(right,clip.x+clip.z);top=Math.min(top,clip.y+clip.w);}
      const w=Math.max(0,right-x),h=Math.max(0,top-y);
      if(w&&h)expected.push([q,x,y,w,h]);
    }
    for(let r=0;r<runs;r++) {
      const k=r*6;
      for(let q=out[k];q<out[k]+out[k+1];q++)actual.push([q,out[k+2],out[k+3],out[k+4],out[k+5]]);
    }
    assert.deepEqual(actual,expected);
  }
});

test('matching scissors coalesce; clipped-out quads cannot join disjoint runs', () => {
  const clip={x:0,y:0,z:8,w:8},out=new Int32Array(64*6);
  assert.equal(buildProfileDrawRuns(Int32Array.from([-10,-10,40,40,0,0,8,8]),2,clip,out),1);
  assert.deepEqual([...out.subarray(0,6)],[0,2,0,0,8,8]);
  assert.equal(buildProfileDrawRuns(Int32Array.from([0,0,8,8,20,20,1,1,0,0,8,8]),3,clip,out),2);
  assert.equal(out[6],2);
  assert.throws(()=>buildProfileDrawRuns(new Int32Array(8),2,null,new Int32Array(6)),RangeError);
});
