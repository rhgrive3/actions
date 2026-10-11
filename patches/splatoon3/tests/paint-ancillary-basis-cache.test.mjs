import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareAncillary as baseline,pointInsideAncillary as oldInside} from './fixtures/paint-ancillary-baseline.mjs';
const source=fs.readFileSync(new URL('../runtime/paint-ownership.mjs',import.meta.url),'utf8');
const candidate=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {prepareAncillary,pointInsideAncillary};').toString('base64'));
const shapes=[[5,0,0,3],[3,0,0,2],[7,0,0,4],[10,0,0,5],[3,0,0,2],[2,0,0,1],[0,0,0,0],[0,0,0,0]];
const contract={shapes,kind:{speck:7}};
const face={wall:true,atlas:{ppm:30}},g={R:1.56,seed:.37,kind:0};
function check(tn,dT,dn=0,sdu=1,sdv=0,sa=0,c=contract){
 const args=[g,face,2,3,dn,sdu,sdv,sa,tn,dT,c],a=baseline(...args),b=candidate.prepareAncillary(...args);
 assert.deepEqual(b,a,'cached coefficients must preserve every output bit');
 if(a)for(const [x,y]of [[0,0],[1,.2],[-.3,-2],[2,-1]])assert.equal(candidate.pointInsideAncillary(b,x,y,b.seed),oldInside(a,x,y,a.seed));
}
test('cached native mask stays bit-exact across growth, wall/floor, seed, radius and stretch',()=>{
 for(const seed of [0,.00001,.37,.999999])for(const R of [.08,.65,1.56,3.74])for(let kind=0;kind<8;kind++)for(const wall of [false,true]){
  Object.assign(g,{seed,R,kind});face.wall=wall;
  for(const tn of [0,.2,.6,1,1.43,3])for(const dT of [0,.4,1])check(tn,dT,R*.1,.6,.8,.7);
 }
});
test('pooled growth and reused face mutations invalidate basis without retaining stale math',()=>{
 for(let i=0;i<200;i++){
  Object.assign(g,{seed:(i*37%101)/101,R:.1+(i%13)/4,kind:i%6});face.wall=!!(i%2);face.atlas.ppm=10+i%31;
  check(.75,.65,g.R*.25,Math.cos(i),Math.sin(i),i%3*.3);check(3,1,g.R*.5,Math.cos(i),Math.sin(i),i%3*.3);
 }
});
test('alternate shape contract preserves satellite and spatter branches exactly',()=>{
 const c={...contract,shapes:shapes.map(()=>[4,3,3,3])};Object.assign(g,{R:2.4,seed:.51,kind:3});
 for(const wall of [false,true])for(const sa of [0,.4,1.7])for(const tn of [0,.4,.8,1.2,1.6,3]){face.wall=wall;check(tn,.8,.2,.6,.8,sa,c);}
 c.shapes[3][0]=6;c.shapes[3][1]=1;check(2,1,0,1,0,0,c);
 check(2,1,0,1,0,0,contract);
});
