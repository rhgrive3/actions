// Serialized into the capture browser. Only delegates native calls and reads
// their results; never writes input, actor, paint, projectile or RNG state.
export function installSlosherPhaseObserver(){
  const G=window.__G,a=G.local,P=G.projectiles,paint=G.paint,undo=[];
  const result={schema:2,accountingProtocol:'native-cell-credit-ranges-v2',sourceActor:'WeaponSlosherWashtub',birth:null,steps:[],releases:[],credits:[],cells:[],snapshots:[],failures:[],coverageFaces:[],coverageArea:0,nonScoringChanges:[]};
  const check=(ok,why)=>{if(!ok)result.failures.push(why);};
  const grid=paint.grid.slice(),areas=new Float64Array(grid.length),eligible=new Uint8Array(grid.length),orders=new Int32Array(grid.length);
  const faces=paint.paintFaces.map(f=>({id:f.id??null,block:f.block??null,grid:f.grid,nu:f.nu,nv:f.nv,cu:f.cu,cv:f.cv,
    turf:!!f.turf,normal:f.n.toArray(),origin:f.origin.toArray(),u:f.u.toArray(),v:f.v.toArray()}));
  result.paintContext={native:paint.level?.native===true,team:a.team,gridLength:grid.length,faces,
    deadCells:Array.from(paint.dead,(dead,index)=>dead?index:-1).filter(index=>index>=0),
    initialOwnedCells:Array.from(grid,(owner,index)=>owner?[index,owner]:null).filter(Boolean),
    scoringPredicate:'face.turf && !paint.dead[index]',nativeBodySkipPredicate:'level.native && paint.dead[index]'};
  let order=0;
  for(const f of paint.paintFaces)if(f.turf){let count=0;const weight=f.cu*f.cv*Math.max(0,f.n.y);
    for(let k=f.grid;k<f.grid+f.nu*f.nv;k++)if(!paint.dead[k]){areas[k]=f.cu*f.cv;eligible[k]=1;orders[k]=order++;count++;result.coverageArea+=weight;}
    result.coverageFaces.push({grid:f.grid,nu:f.nu,nv:f.nv,cu:f.cu,cv:f.cv,normalY:f.n.y,eligibleCells:count});
  }
  const counts=()=>{const n=[0,0];for(let i=0;i<grid.length;i++)if(eligible[i]&&grid[i])n[grid[i]-1]++;return n;};
  const initial={turf:a.stats.turf,special:a.special,counts:counts()};
  let context=null,pendingBody=null,frame=0;
  function hook(obj,key,wrap){const original=obj[key];check(typeof original==='function','missing native '+key);if(typeof original!=='function')return;obj[key]=wrap(original);undo.push(()=>obj[key]=original);}
  function classification(face,index){
    const local=index-face.grid,j=Math.floor(local/face.nu),i=local-j*face.nu;
    return {faceGrid:face.grid,i,j,dead:!!paint.dead[index],turf:!!face.turf,native:result.paintContext.native};
  }
  function mark(face,i,j){
    const k=face.grid+j*face.nu+i,previous=grid[k],value=paint.grid[k];
    if(previous===value)return;
    grid[k]=value;
    result.cells.push({frame,index:k,from:previous,to:value,eligible:!!eligible[k],area:areas[k],coverageOrder:orders[k],...classification(face,k)});
    if(eligible[k]){check(previous===0&&value===a.team+1,'isolated phase scenario must claim only fresh local turf');
      check(!!context,'cell mutation without native accounting context');if(context)context.area+=areas[k];}
  }
  hook(paint,'_inkMark',native=>function(f,i,j,...rest){mark(f,i,j);return native.call(this,f,i,j,...rest);});
  hook(paint,'_inkMarkRow',native=>function(f,i0,i1,j,...rest){for(let i=i0;i<=i1;i++)mark(f,i,j);return native.call(this,f,i0,i1,j,...rest);});
  hook(paint,'_cpuSplat',native=>function(...args){const prior=context,current={kind:'body-face',area:0,cellStart:result.cells.length};context=current;
    try{const area=native.apply(this,args);check(area===current.area,'body face area differs from actual new eligible cells');
      if(prior?.kind==='body'){prior.area+=area;prior.groups.push({start:current.cellStart,end:result.cells.length,faceGrid:args[0].grid});}return area;}
    finally{context=prior;}});
  hook(paint,'splat',native=>function(...args){const prior=context,current={kind:'body',area:0,cellStart:result.cells.length,groups:[]};context=current;
    try{const area=native.apply(this,args);check(area===current.area,'splat area differs from summed face claims');pendingBody={area,cellStart:current.cellStart,cellEnd:result.cells.length,groups:current.groups};return area;}
    finally{context=prior;}});
  for(const key of ['_advanceSplatOwnership','_finishSplatOwnership'])hook(paint,key,native=>function(...args){
    const prior=context,current={kind:'ancillary',area:0,cellStart:result.cells.length};context=current;
    try{const area=native.apply(this,args);check(area===current.area,'growth area differs from actual new eligible cells');return area;}
    finally{context=prior;}});
  hook(a,'addTurf',native=>function(area,...args){
    const before={turf:this.stats.turf,special:this.special},ancillary=context?.kind==='ancillary',source=ancillary?context:pendingBody,
      oracle=source?.area,cellStart=source?.cellStart,cellEnd=ancillary?result.cells.length:source?.cellEnd,
      groups=ancillary?[{start:cellStart,end:cellEnd,faceGrid:null}]:source?.groups,
      guards={specialActive:!!this.specialActive,stormGaugeLock:Number(this.stormGaugeLock||0),s3TidalSlamGaugeFinish:!!this.s3TidalSlamGaugeFinish};
    if(area>0){check(area===oracle,'credit differs from independently observed cell area');
      check(!guards.specialActive&&!(guards.stormGaugeLock>0)&&!guards.s3TidalSlamGaugeFinish,'phase credit requires inactive unlocked special');}
    const value=native.call(this,area,...args),after={turf:this.stats.turf,special:this.special};
    check(after.turf===(area>0?before.turf+area:before.turf),'turf credit arithmetic');
    check(after.special===(area>0?Math.min(this.specialCost(),before.special+area):before.special),'special credit arithmetic');
    result.credits.push({frame,area,cellArea:oracle??null,before,after,cost:this.specialCost(),kind:ancillary?'ancillary':'body',cellRange:[cellStart,cellEnd],cellGroups:groups,guards});pendingBody=null;return value;
  });
  hook(P,'_step',native=>function(p,dt){
    if(p.catalog?.r?.sourceActor!=='WeaponSlosherWashtub')return native.call(this,p,dt);
    const c=p.catalog,d=c.descriptor,oldDrops=new Set(this._s3SplashDrops||[]),before=c.travel;
    if(!result.birth)result.birth={seed:p.seed,initialDistance:c.nextSplash,unit:d.unit,index:c.index,spacing:d.splashSpacing,count:d.splashCount,
      width:d.splashRadius,depth:d.sloshFall?.spec.depthScaleMax,drawRadius:d.sloshFall?.drawRadius};
    const retired=native.call(this,p,dt),row={frame,dt,seed:p.seed,beforeTravel:before,travel:c.travel,prev:p.prev.toArray(),pos:p.pos.toArray(),
      vel:p.vel.toArray(),age:p.age,life:p.life,damage:p.damage,retired:!!retired,dropCount:c.dropCount,nextSplash:c.nextSplash};
    result.steps.push(row);
    for(const drop of this._s3SplashDrops||[])if(!oldDrops.has(drop)&&drop.sourceActor==='WeaponSlosherWashtub')
      result.releases.push({frame,step:result.steps.length-1,position:[drop.releaseX,drop.spawnY,drop.releaseZ],radius:drop.radius,drawRadius:drop.drawRadius,depth:drop.spec.depthScaleMax});
    return retired;
  });
  const observer={frame(value){frame=value;},snapshot(label){
    for(let i=0;i<grid.length;i++)if(grid[i]!==paint.grid[i]){
      if(eligible[i]){check(false,'unobserved paint cell '+i);break;}
      // Body notifications deliberately omit buried/non-turf cells. They do
      // not grant ownership credit; retain their mutation as a diagnostic.
      const face=paint.paintFaces.find(f=>i>=f.grid&&i<f.grid+f.nu*f.nv);
      check(!!face,'non-scoring cell belongs to an actual production face');if(!face)continue;
      const raw=classification(face,i),point=face.origin.clone().addScaledVector(face.u,(raw.i+.5)*face.cu).addScaledVector(face.v,(raw.j+.5)*face.cv).addScaledVector(face.n,.06);
      const hasPredicate=typeof paint.level?.pointInsideGrid==='function'||typeof paint.level?.pointInside==='function';
      const pointInside=hasPredicate?(paint.level.pointInsideGrid?paint.level.pointInsideGrid(point,face.block):paint.level.pointInside(point,0,face.block)):null;
      const row={frame,index:i,from:grid[i],to:paint.grid[i],...raw,point:point.toArray(),pointInside,pointEligible:!!eligible[i]};
      check(row.dead||!row.turf,'unclassified non-scoring mutation');if(row.dead)check(pointInside===true,'dead cell must retain the production buried-point witness');
      result.nonScoringChanges.push(row);grid[i]=paint.grid[i];
    }
    const n=counts();check(n[0]===paint.counts[0]&&n[1]===paint.counts[1],'owned cell counts');
    const ownedAreas=[0,0];
    for(const f of paint.paintFaces)if(f.turf){const weight=f.cu*f.cv*Math.max(0,f.n.y);
      for(let k=f.grid;k<f.grid+f.nu*f.nv;k++)if(eligible[k]&&grid[k])ownedAreas[grid[k]-1]+=weight;}
    const snapshot={label,frame,creditCount:result.credits.length,cellCount:result.cells.length,turf:a.stats.turf,special:a.special,
      counts:n,turfTotal:paint.turfTotal,ownedAreas,coverage:paint.coverage()};
    const expected=result.coverageArea>0?ownedAreas.map(v=>v/result.coverageArea):[0,0];
    check(snapshot.coverage[0]===expected[0]&&snapshot.coverage[1]===expected[1],'coverage from actual projected floor area in native face/cell order');
    result.snapshots.push(snapshot);return snapshot;
  },finish(){observer.snapshot('end');result.initial=initial;for(const restore of undo.reverse())restore();delete window.__iwSlosherPhaseObserver;return result;}};
  window.__iwSlosherPhaseObserver=observer;observer.snapshot('initial');
}
