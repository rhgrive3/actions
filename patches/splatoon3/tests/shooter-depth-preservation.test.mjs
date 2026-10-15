import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
import {reset,launch,finish} from '../../../scripts/measure-weapons-fidelity.mjs';

const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);
const clamp=v=>Math.max(0,Math.min(1,v));
const mix=(a,b,t)=>a+(b-a)*t;
// This preserves the existing native height/angle selector. The numeric depth
// values have source provenance; this selector is not a new retail-policy claim.
function expected(p,hit) {
  const q=p.inkProfile.paint,w=(p.s3Weapon||p.owner.weapon).impactPaint;
  const angle=Math.asin(Math.min(1,Math.abs(p.vel.dot(hit.normal))/p.vel.length()))*180/Math.PI;
  const height=Math.max(0,p.inkPeak-hit.point.y);
  const high=p.inkPhase===0?q.depthMax:q.depthMaxFall;
  const low=p.inkPhase===0?q.depthMin:mix(q.depthMin,q.depthMinFall,clamp((height-q.heightLow)/(q.heightHigh-q.heightLow)));
  const depth=mix(high,low,clamp((angle-q.angleLow)/(q.angleHigh-q.angleLow)));
  const distance=p.start.distanceTo(hit.point);
  const radius=distance<=w.distanceMiddle?
    mix(w.widthNear,w.widthMiddle,clamp((distance-w.distanceNear)/(w.distanceMiddle-w.distanceNear))):
    mix(w.widthMiddle,w.widthFar,clamp((distance-w.distanceMiddle)/(w.distanceFar-w.distanceMiddle)));
  const stretch=1.6*Math.max(0,depth-1);
  return {radius,stretch,centreBack:.375*radius*stretch,depth};
}
async function setup(){
  const f=await fixture({site:process.env.INKWAVE_BUILT_SITE,fidelity:true});
  const flight=f.projectiles.inkFlight,paint=flight.paint,splat=f.G.paint.splat;
  let checked=0,active;
  flight.paint=function(p,hit,shape,heading,kind){
    if(kind!=='shot'||p.inkKey!=='shooter')return paint.call(this,p,hit,shape,heading,kind);
    const want=expected(p,hit);for(const key of ['radius','stretch','centreBack'])near(shape[key],want[key],key);
    active={p,hit,want};checked++;
    try{return paint.call(this,p,hit,shape,heading,kind);}finally{active=null;}
  };
  f.G.paint.splat=function(center,radius,team,opts){
    if(active){const {p,hit,want}=active;assert.equal(opts.kind,'source-shot');assert.equal(opts.face,hit.face);assert.equal(opts.seed,p.seed);assert.equal(team,p.team);near(radius,want.radius,'splat radius');near(opts.stretchAmt,want.stretch,'splat stretch');
      const dx=p.vel.x,dz=p.vel.z,n=Math.hypot(dx,dz);
      near(center.x,hit.point.x-dx/n*want.centreBack,'centre x');near(center.z,hit.point.z-dz/n*want.centreBack,'centre z');near(center.y,hit.point.y+.005,'face offset');
    }
    return splat.call(this,center,radius,team,opts);
  };
  return {f,flight,count:()=>checked};
}
for(const height of [0,3,12])test(`Shooter native flight preserves depth at actor height ${height}`,async()=>{
  const {f,count}=await setup(),a=reset(f,{id:'shooter'},null,height);launch(f,a,{id:'shooter'});finish(f,a);assert.equal(count(),1,'one admitted native head impact');
});
test('Shooter bridge preserves native height interpolation in every flight phase',async()=>{
  const {f,flight,count}=await setup();
  for(const phase of [0,1,2])for(const height of [1.05,5,12])for(const angle of [5,20,45]){
    const a=reset(f,{id:'shooter'});launch(f,a,{id:'shooter'});const p=f.projectiles.list[0];
    p.inkPhase=phase;p.inkPeak=height;p.start.set(0,1.05,.3);p.vel.set(0,-20*Math.sin(angle*Math.PI/180),20*Math.cos(angle*Math.PI/180));
    const hit={point:p.pos.clone().set(0,0,12),normal:p.pos.clone().set(0,1,0),face:0};
    const want=expected(p,hit);if(phase!==0&&angle===45){if(height===1.05)near(want.depth,1.31,'low native depth');if(height===12)near(want.depth,1.12,'high native depth');if(height===5)assert.ok(want.depth>1.12&&want.depth<1.31,'interpolated depth');}
    flight.impact(p,hit);
  }
  assert.equal(count(),27,'all phase/height/angle combinations reached actual impact');
});
