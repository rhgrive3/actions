import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const near=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
async function nativeFloor(bridgeControl = false) {
  const f=await fixture({productionComposition:true,realProjectiles:true,fullRuntime:true,
    adaptRuntime:(rel,code)=>bridgeControl && rel==='patches/splatoon3/runtime/weapons-fidelity.mjs'
      ? code.replace('export function fidelityDualiesNativeImpactPaint(p, hit) {',
        'export function fidelityDualiesNativeImpactPaint(p, hit) { return null; // test-only bridge-off control') : code,
    extraExports:"export { paintShape } from './inkwave-public/src/game/inkFlight.js';"});
  const V=f.THREE.Vector3,G=f.G,ps=G.projectiles;
  const face={id:0,block:0,origin:new V(-20,0,-5),u:new V(1,0,0),v:new V(0,0,1),n:new V(0,1,0),
    su:40,sv:45,wall:false,turf:true,paintable:true};
  const block={id:0,solid:true,grate:false,center:new V(0,-1,17.5),half:new V(20,1,22.5),
    axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,0,-1,-1,-1],
    aabbMin:new V(-20,-2,-5),aabbMax:new V(20,0,40)};
  G.level={faces:[face],blocks:[block],groundHeight:()=>0,pointInside:()=>false,
    queryBlocks(_x0,_z0,_x1,_z1,out=[]){out.length=0;out.push(0);return out;}};
  G.physics=new f.Physics(G.level);G.camera=new f.THREE.PerspectiveCamera();G.settings={};
  class CpuPaint extends f.PaintSystem {_initGPU(){this.quads=0;} _pushQuad(){}}
  G.paint=new CpuPaint(null,G.level,{atlasSize:1024,maxDensity:8,cell:.25});
  const records=[],splat=G.paint.splat;
  G.paint.splat=function(center,radius,team,opts={}){
    const area=splat.call(this,center,radius,team,opts);
    records.push({center:center.toArray(),radius,team,kind:opts.kind,stretch:opts.stretchAmt,area});return area;
  };
  const actor=f.make('dualies');actor.pos.set(0,0,0);actor.character.root.position.copy(actor.pos);
  actor.nid=42;actor.owner='local';actor._nearCamera=()=>false;
  let turf=0;actor.addTurf=area=>{turf+=area;};f.setRandom(()=>.31);
  let genericImpacts=0;const impact=ps._impact;
  ps._impact=function(...args){genericImpacts++;return impact.apply(this,args);};
  const contacts=[],nativeImpact=ps.inkFlight.impact;
  ps.inkFlight.impact=function(p,hit){contacts.push({phase:p.inkPhase,fallbackPhase:p.fidelityPhase,
    distance:p.start.distanceTo(hit.point),angle:Math.asin(Math.abs(p.vel.dot(hit.normal))/p.vel.length())*180/Math.PI,
    legacy:f.paintShape(p.inkProfile,p.start.distanceTo(hit.point),Math.asin(Math.abs(p.vel.dot(hit.normal))/p.vel.length())*180/Math.PI,p.inkPhase,Math.max(0,p.inkPeak-hit.point.y))});
    return nativeImpact.call(this,p,hit);};
  return {f,actor,ps,records,contacts,turf:()=>turf,generic:()=>genericImpacts};
}
function fire(s,{height=0,angle=22.5,hand=0,ghost=false}={}) {
  const {actor:a,ps}=s,rad=angle*Math.PI/180;
  a.pos.y=height;a.character.root.position.copy(a.pos);a.aimDir.set(0,-Math.sin(rad),Math.cos(rad));
  a.aimPoint.copy(a.pos).add(new s.f.THREE.Vector3(0,1.05,0)).addScaledVector(a.aimDir,80);
  ps.fireDualies(a,a.weapon,0,hand);const p=ps.list.at(-1);p.ghost=ghost;
  assert.equal(p.inkKey,'dualies');assert.equal(p.trailEvery,0,'generic trail is already disabled');
  assert.equal(p.inkPlan.count,1,'existing detached-drop owner already caps one droplet');return p;
}
function advance(s,rate=60,seconds=3) {
  let carry=0;
  for(let i=0;i<rate*seconds;i++) {carry+=1/rate;
    while(carry>=1/60-1e-10){s.f.G.time+=1/60;s.ps.update(1/60);carry-=1/60;}
  }
}

test('#992 native fire-to-floor path consumes retained source while never visiting generic _impact',async()=>{
  const s=await nativeFloor(),paint=s.f.profile.weaponsFidelityCompletion.weapons.dualies.PaintParam;
  // Deliberately distinct wiring canary, NOT a new S3 value. Previously the
  // frozen native InkFlight profile ignored this installed source record.
  paint.WidthHalfNear+=1;paint.WidthHalfMiddle+=1;paint.WidthHalfFar+=1;
  paint.DepthScaleMax+=.5;paint.DepthScaleMin+=.5;
  fire(s);advance(s);
  assert.equal(s.generic(),0);assert.equal(s.contacts.length,1);
  const hit=s.contacts[0],body=s.records.find(r=>r.kind==='shot');
  assert.equal(hit.phase,0);assert.ok(body?.area>0);
  const t=Math.max(0,Math.min(1,(hit.distance-1.1)/(20-1.1)));
  near(body.radius,2.71+(2.66-2.71)*t,'installed width reaches native CPU paint');
  near(body.stretch,2.74+(1.81-2.74)*Math.max(0,Math.min(1,(hit.angle-10)/25))-1,'installed angle depth');
  near(s.turf(),s.records.reduce((sum,row)=>sum+row.area,0),'same native paint owns credit');
  const control=await nativeFloor(true),cp=control.f.profile.weaponsFidelityCompletion.weapons.dualies.PaintParam;
  cp.WidthHalfNear+=1;cp.WidthHalfMiddle+=1;cp.WidthHalfFar+=1;cp.DepthScaleMax+=.5;cp.DepthScaleMin+=.5;
  fire(control);advance(control);const before=control.records.find(r=>r.kind==='shot');
  near(body.radius-before.radius,1,'bridge-off control still ignores installed width');
  near(body.stretch-before.stretch,.5,'bridge-off control still ignores installed angle source');
});

test('#992 native break/free phase retains its existing height model rather than using stale fallback phase zero',async()=>{
  const s=await nativeFloor();fire(s,{height:4,angle:0});advance(s);
  assert.equal(s.generic(),0);assert.equal(s.contacts.length,1);
  const hit=s.contacts[0],body=s.records.find(r=>r.kind==='shot');
  assert.ok(hit.phase>0);assert.equal(hit.fallbackPhase,0,'separate generic phase is stale for native heads');
  near(body.radius,hit.legacy.radius);near(body.stretch,hit.legacy.stretch);
});

test('#992 full installed native head/drop paint and CPU turf agree across 30/60/120 render schedules',async()=>{
  const outcomes=[];
  for(const rate of [30,60,120]) {const s=await nativeFloor();fire(s);advance(s,rate);
    assert.equal(s.generic(),0);assert.equal(s.contacts.length,1);
    outcomes.push(JSON.parse(JSON.stringify({paint:s.records,counts:Array.from(s.f.G.paint.counts),turf:s.turf()})));
  }
  assert.deepEqual(outcomes[1],outcomes[0]);assert.deepEqual(outcomes[2],outcomes[0]);
});

test('#992 existing seven-shot native drop sequence is capped per projectile and ghost birth cannot score',async()=>{
  const s=await nativeFloor();const sequences=[];
  for(let n=0;n<7;n++) {const before=s.ps.inkFlight.stats.spawned,p=fire(s,{height:4,angle:0,hand:n%2});
    sequences.push(p.inkSequence);advance(s);assert.ok(p.inkSpawned<=1);
    assert.ok(s.ps.inkFlight.stats.spawned-before<=1,'no extra generic droplets');
  }
  assert.deepEqual(sequences,[0,1,2,3,4,5,6]);assert.equal(s.generic(),0);
  assert.ok(s.records.some(r=>r.kind==='drop'||r.kind==='trail'),'native detached droplets reach CPU paint');
  const before=s.records.length,turf=s.turf();fire(s,{height:4,angle:0,ghost:true});advance(s);
  assert.equal(s.records.length,before);near(s.turf(),turf);
});
