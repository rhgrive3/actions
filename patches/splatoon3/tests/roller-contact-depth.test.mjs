import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { rollerContactDepth, rollerPaintHalfWidth } from '../runtime/roller-contact-paint.mjs';

test('sparse roller fields use documented class defaults, not a display width or the maximum at every speed',()=>{
  const p={WidthHalfMax:2.8,SpeedMax:.132};
  assert.equal(rollerContactDepth(p),1.5);
  assert.equal(rollerContactDepth({...p,Depth:2},.5),1);
  assert.equal(rollerPaintHalfWidth(p,0),1.3);
  assert.ok(Math.abs(rollerPaintHalfWidth(p,6.48)-2.5272727272727273)<1e-12);
  assert.equal(rollerPaintHalfWidth(p,7.92),2.8);
  assert.equal(rollerPaintHalfWidth({...p,WidthHalfMin:.7},0),.7);
});

test('a wide rolling contact retains its independent full depth and transverse radius in the CPU turf grid',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true});
  const {paint,V}=makePaintWorld(f,{cell:.025});
  const radius=2.8,depth=1.5;
  paint.splat(V(0,0,5),radius,0,{kind:'source-shot',footprint:'ink-contact',seed:.37,
    face:0,stretch:V(0,0,1),stretchAmt:depth/(1.2*radius)-1,instant:true});
  let lo=Infinity,hi=-Infinity,left=Infinity,right=-Infinity;
  for(let z=3;z<7;z+=.025)for(let x=-3;x<3;x+=.025)if(paint.sampleWorld(0,V(x,0,z))===1){
    lo=Math.min(lo,z);hi=Math.max(hi,z);left=Math.min(left,x);right=Math.max(right,x);
  }
  assert.ok(hi-lo<=depth+.05&&hi-lo>depth-.1,'longitudinal length is not 1.2 times the paint half-width');
  assert.ok(right-left<=2*radius+.05&&right-left>2*radius*.95,'transverse ink is not clipped by a compressed broad phase');
  assert.equal(paint.sampleWorld(0,V(0,0,5)),1);
  assert.equal(paint.sampleWorld(0,V(0,0,6)),0,'no invisible claim beyond the contact depth');
  const before=paint.counts[0];
  for(const stretchAmt of [-1,-2,NaN,Infinity]){
    assert.equal(paint.splat(V(10,0,5),radius,0,{kind:'source-shot',footprint:'ink-contact',
      stretch:V(0,0,1),stretchAmt,face:0}),0,'invalid compression is rejected before CPU/GPU submission');
  }
  assert.equal(paint.counts[0],before);
});
