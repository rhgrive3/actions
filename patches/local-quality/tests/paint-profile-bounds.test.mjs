import test from 'node:test';
import assert from 'node:assert/strict';
import { profilePaintBounds, PROFILE_BATCH_LIMIT } from '../paint-profile-bounds.mjs';
import { profileShaderSources } from '../paint-profile-shader.mjs';
import { PaintDryRegions } from '../paint-dry-region-grid.mjs';

function rng() {let n=0x74da342a;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32);}
function fixture({size=2048,R=3,plane=.02,age=.5,angle=0,amount=.4,count=1,x=128,y=128,w=1024,h=1024,extent=15}={}) {
  const p={size,quads:count,aPos:new Float32Array(count*8),aLocal:new Float32Array(count*12),
    aSplat:new Float32Array(count*16),aStretch:new Float32Array(count*12),aGrow:new Float32Array(count*16)};
  for(let q=0;q<count;q++)for(let c=0;c<4;c++){
    const i=q*4+c,right=c===1||c===2,top=c>=2;
    p.aPos.set([((x+(right?w:0))/size)*2-1,((y+(top?h:0))/size)*2-1],i*2);
    p.aLocal.set([right?extent:-extent,top?extent:-extent,plane],i*3);
    p.aSplat.set([R,q%2,.25,(10+q%10)*2+q%2],i*4);
    p.aStretch.set([Math.cos(angle),Math.sin(angle),amount],i*3);
    p.aGrow.set([age,.5,0,1234],i*4);
  }
  return p;
}

test('conservative bounds enclose the entire analytic profile box across 3000 rotated/stretched stamps',()=>{
  const random=rng();let accepted=0,samples=0;
  for(let i=0;i<3000;i++){
    const size=[512,1024,2048,4096][i%4],R=.2+random()*8,amount=random()*4;
    const extent=R*(1+amount)*2.2,w=size*.8,h=size*.8,x=size*.1,y=size*.1;
    const p=fixture({size,R,plane:R*(random()*1.6-.8),age:random()*2-.1,angle:random()*Math.PI*2,amount,w,h,x,y,extent});
    const copies=['aPos','aLocal','aSplat','aStretch','aGrow'].map(k=>p[k].slice());
    const bounds=new Int32Array(4),ok=profilePaintBounds(p,bounds);
    for(const [j,k] of ['aPos','aLocal','aSplat','aStretch','aGrow'].entries())assert.deepEqual(p[k],copies[j],'inputs are immutable');
    if(!ok)continue;accepted++;
    const [dx,dy,sa]=p.aStretch,norm=dx*dx+dy*dy;
    const r=Math.sqrt(p.aSplat[0]**2-p.aLocal[2]**2);
    const t=Math.max(0,Math.min(1,p.aGrow[0])),radius=r*(.4+.6*(1-(1-t)**4));
    const px0=(p.aPos[0]+1)*size*.5,py0=(p.aPos[1]+1)*size*.5;
    const sx=(p.aPos[2]-p.aPos[0])*size*.5/(p.aLocal[3]-p.aLocal[0]);
    const sy=(p.aPos[5]-p.aPos[1])*size*.5/(p.aLocal[7]-p.aLocal[1]);
    for(let along=-1;along<=1;along+=.25)for(let across=-1;across<=1;across+=.25){
      const a=along*radius/(1-norm+norm/(1+(along>0?sa:.25*sa))),b=across*radius;
      const u=(dx*a-dy*b)/norm,v=(dy*a+dx*b)/norm;
      const px=px0+(u-p.aLocal[0])*sx,py=py0+(v-p.aLocal[1])*sy;
      if(px<0||px>=size||py<0||py>=size)continue;
      assert.ok(px>=bounds[0]&&px<=bounds[0]+bounds[2],`X support escaped case ${i}`);
      assert.ok(py>=bounds[1]&&py<=bounds[1]+bounds[3],`Y support escaped case ${i}`);samples++;
    }
  }
  assert.ok(accepted>2500);assert.ok(samples>200000);
});

test('unknown, mixed, clipped and undersampled inputs fall back instead of clipping ink',()=>{
  const mutations=[
    p=>{p.quads=0;},p=>{p.quads=PROFILE_BATCH_LIMIT+1;},p=>{p.aPos[0]=-1.1;},
    p=>{p.aLocal[0]=NaN;},p=>{p.aSplat[4]=2;},p=>{p.aGrow[4]=.6;},
    p=>{for(let i=0;i<4;i++)p.aStretch[i*3+2]=-.1;},
    p=>{for(let i=0;i<4;i++)p.aSplat[i*4+3]=14;},
    p=>{for(let i=0;i<4;i++)p.aStretch[i*3]=0;},
    p=>{for(let i=0;i<4;i++)p.aLocal[i*3+2]=p.aSplat[0]*.999999;},
    p=>{p.aGrow[3]=Infinity;},p=>{p.size=0;},
  ];
  for(const mutate of mutations){const p=fixture();mutate(p);assert.equal(profilePaintBounds(p,new Int32Array(256)),false);}
  assert.equal(profilePaintBounds(fixture(),new Int32Array(2)),false);
  assert.equal(profileShaderSources({vertexShader:'custom',fragmentShader:'custom'}),null);
});

test('pixel-rectangle wet tracking covers guarded edges, expires conservatively and resets',()=>{
  const g=new PaintDryRegions(2048);assert.equal(g.axis,64);
  g.markPixelRects(new Int32Array([0,0,1,1,2047,2047,1,1,128,160,100,120]),3,10);
  const before=g.live;assert.ok(before>0);g.credit=265;g.expire();assert.equal(g.live,before);
  g.credit=266;g.expire();assert.equal(g.live,0);
  g.markPixelRects(new Int32Array([0,0,2048,2048]),1,0);g.rebuild();assert.equal(g.full,true);
  g.reset();g.rebuild();assert.equal(g.live,0);assert.equal(g.count,0);assert.equal(g.full,false);
});
