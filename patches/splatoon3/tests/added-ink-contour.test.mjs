import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inkFootprintContains, INK_PROFILE_SECTIONS } from '../runtime/main-ink-footprints.mjs';

const reference=JSON.parse(fs.readFileSync(new URL('../reference/added-ink-contours-20261018.json',import.meta.url)));

// Independent polygon ray crossing against the measured image-space boundary.
// This checks the table approximation, not Switch geometry or mask selection.
function inside(x,y,points){
  let result=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}

test('blast table preserves the photographed lobes more closely than an ellipse',()=>{
  const sections=reference.profiles['ink-blast'].sections;
  assert.deepEqual(INK_PROFILE_SECTIONS[8],sections,'documented measurement owns runtime control sections');
  const polygon=[...sections.map(([y,l])=>[-l,y]),...sections.toReversed().map(([y,,r])=>[r,y])];
  let union=0,intersection=0,circleUnion=0,circleIntersection=0;
  for(let j=0;j<512;j++)for(let i=0;i<512;i++){
    const x=2*(i+.5)/512-1,y=2*(j+.5)/512-1;
    const expected=inside(x,y,polygon),actual=inkFootprintContains(y,x,18,0),circle=x*x+y*y<1;
    if(expected||actual)union++;if(expected&&actual)intersection++;
    if(expected||circle)circleUnion++;if(expected&&circle)circleIntersection++;
  }
  assert.ok(intersection/union>.99,'less than 1% normalized polygon discrepancy');
  assert.ok(intersection/union>circleIntersection/circleUnion+.08,'negative ellipse control must lose measured contour detail');
});
