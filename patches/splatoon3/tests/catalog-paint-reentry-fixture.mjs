import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

// Exercises actual catalogue projectile impact -> actual PaintSystem.splat.
// The old-policy mutation is source-only and guarded by exact source anchors.
export async function runNativePaintReentry({legacy=false,hook='recSplat'}={}){
 if(legacy)assert.equal(!!process.env.INKWAVE_BUILT_SITE,false,'source counterfactual cannot use an emitted artifact');
 const lease=`    const depthSlot=_paintDepth++;
    try {
    let scratch=_paintScratch[depthSlot];
    if(!scratch){
      scratch={tangent:new THREE.Vector3(),cross:new THREE.Vector3(),centre:new THREE.Vector3()};
      if(depthSlot<8)_paintScratch[depthSlot]=scratch;
    }
    const _paintTangent=scratch.tangent,_paintCross=scratch.cross,_paintCentre=scratch.centre;
`;
 const adaptRuntime=(rel,source)=>{
  if(!legacy||rel!=='patches/splatoon3/runtime/main-weapon-catalog.mjs')return source;
  assert.equal(source.split(lease).length,2,'exact current lease boundary');
  assert.equal(source.split('    } finally { _paintDepth--; }\n  }\n  function floorPaint').length,2,'exact lease exit');
  return source.replace(lease,'').replace('    } finally { _paintDepth--; }\n  }\n  function floorPaint','  }\n  function floorPaint');
 };
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime,extraExports:"export{installMainWeaponCatalogRuntime}from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 const {paint,level}=makePaintWorld(f),{G}=f;G.settings={};f.setRandom(()=>.5);
 const actors=[f.make('s3-shooter-short'),f.make('s3-shooter-short')];
 for(const [i,a] of actors.entries()){
  a.team=i;a.form='kid';a.pos.set(i*15,0,0);a.aimDir.set(0,-.2,1).normalize();a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,12);
  a.intent.fire=true;a.weaponRunner.update(1/60,{fire:true,firePressed:true,sub:false});
 }
 const shots=G.projectiles.list.filter(p=>p.catalog);assert.ok(shots.length>=2,'two real catalogue births');
 const [outer,inner]=shots;outer.pos.set(0,.05,0);outer.prev.copy(outer.pos);outer.vel.set(1,-12,2);
 inner.pos.set(15,.05,0);inner.prev.copy(inner.pos);inner.vel.set(-2,-12,1);
 const packets=[];let nested=false,paintDepth=0;
 const nativeSplat=paint.splat;
 paint.splat=function(center,r,team,opts){
  const snap=()=>({center:center.toArray(),stretch:opts.stretch?.toArray(),r,team,seed:opts.seed,kind:opts.kind,face:opts.face,stretchAmt:opts.stretchAmt});
  const before=snap();paintDepth++;
  try{return nativeSplat.call(this,center,r,team,opts);}finally{paintDepth--;packets.push({before,after:snap()});}
 };
 const trigger=()=>{if(!nested){nested=true;G.projectiles._step(inner,1/60);}};
 if(hook==='recSplat')G.netm={mute:0,applying:false,recSplat(){trigger();return null;}};
 else if(hook==='queryBlocks'){
  const query=level.queryBlocks;level.queryBlocks=function(...args){if(paintDepth>0)trigger();return query.apply(this,args);};
 }else throw Error('unknown hook');
 try{
  G.projectiles._step(outer,1/60);assert.ok(nested,'real paint reached the requested callback');assert.equal(packets.length,2,'both actual impacts entered PaintSystem');
  assert.ok(packets.every(p=>p.before.stretch?.length===3&&p.before.kind==='source-shot'),JSON.stringify(packets));
  assert.notDeepEqual(packets[0].before.center,packets[1].before.center,'two real distinct impact packets');
  return packets;
 }finally{G.netm=null;G.projectiles.clear();f.restoreRandom();}
}
