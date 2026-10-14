// Source-guided, visual-only main-projectile profile for catalog-added weapons.
// DrawSizeParam and Tail* are from pinned Leanny/splat3 11.3.0 records.
// The source does not publish a matching shooter pixel/mesh radius. The bounded
// shooter cross-section multiplier below is an INKWAVE visual calibration,
// never used for player or field collision, damage, trajectory or turf paint.
const finite=(v,f)=>Number.isFinite(v)?v:f;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
// Pinned Leanny/splat3 11.3.0, commit 7280ff9cde8bb1c5dcef46c700c326471584d2e6.
// The compressed main-weapon catalog omits DrawSizeParam. Each row is per
// UnitGroupParam.Unit order: Init, End, ChangeFrame, AfterInit, AfterEnd,
// TailMin, TailMax, TailSolidFrame. Never derive graphics radius from a hitbox.
const SOURCE_DRAW_ROWS_1130 = {
  WeaponSlosherDiffusion: [
    [1.4,1.4,0,-1.4,-1.4,.5,2,5], [.8,.8,0,-.1,-.1,.5,2,5],
    [1,1,0,0,0,.5,2,5], [1,1,0,0,0,.5,2,5]],
  WeaponSlosherBathtub: [
    [.16,.8,5,0,0,0,0,0], [.104,.52,5,-.006,-.03,0,0,0]],
  WeaponSlosherStrong: [
    [1.2,1.2,0,.4,.4,.5,4,5], [.5625,1,0,-.05,-.03,.5,4,5],
    [.6,.6,0,-.1,-.1,.5,4,5]],
  WeaponSlosherWashtub: [[.7,.7,0,0,0,.5,4,1]],
  WeaponSlosherDouble: [[0,1.4,0,0,-.16,.5,4,5], [0,1.2,0,0,-.14,.5,4,5]],
  WeaponSlosherLauncher: [[.1,.1,0,0,0,.5,.5,5], [0,0,0,0,0,.5,.5,5]],
};
export const SOURCE_DRAW_1130=Object.freeze(Object.fromEntries(
  Object.entries(SOURCE_DRAW_ROWS_1130).map(([actor,rows])=>[actor,Object.freeze(rows.map(row=>Object.freeze({
    InitRadius:row[0],EndRadius:row[1],ChangeFrame:row[2],
    AfterOffsetInitRadius:row[3],AfterOffsetEndRadius:row[4],
    TailLengthMin:row[5],TailLengthMax:row[6],TailSolidFrame:row[7],
  })))])));

export function catalogVisualSpec(record,descriptor,index=0){
  const family=record?.family, b=descriptor?.b||{}, c=descriptor?.c||{};
  const draw=b.DrawSizeParam||b.UnitParam?.DrawSizeParam||SOURCE_DRAW_1130[record?.sourceActor]?.[descriptor?.unit]||null;
  if(family==='slosher'){
    return {style:record.sourceActor==='WeaponSlosherBathtub'?'bubble':'sheet',
      draw,index,baseRadius:.18,tailMin:Math.max(0,finite(draw?.TailLengthMin,0)),
      tailMax:Math.max(0,finite(draw?.TailLengthMax,0)),
      tailSolid:Math.max(0,finite(draw?.TailSolidFrame,0))/60};
  }
  if(family==='shooter'||family==='dualies'||family==='splatling'){
    // Shooter bullet mesh width is not explicit in this sparse parameter table.
    // Smaller fixed-width ink rod, never collider-sized spherical head.
    return {style:'rod',draw:null,index,baseRadius:clamp(finite(c.EndRadiusForPlayer,.2)*.32,.045,.08)};
  }
  if(family==='roller'||family==='brush'){
    return {style:'crown',draw,index,baseRadius:clamp(finite(c.EndRadiusForPlayer,.65)*.24,.12,.26)};
  }
  if(family==='charger'){
    return {style:'rod',draw:null,index,baseRadius:clamp(finite(c.EndRadiusForPlayer,.125)*.38,.04,.09)};
  }
  return {style:'normal',draw,index,baseRadius:.1};
}
export function catalogVisualRadius(spec,ageSeconds=0){
  if(!spec?.draw)return spec?.baseRadius??0;
  const d=spec.draw,i=spec.index,frame=Math.max(0,ageSeconds)*60;
  const init=finite(d.InitRadius,spec.baseRadius)+i*finite(d.AfterOffsetInitRadius,0);
  const end=finite(d.EndRadius,init)+i*finite(d.AfterOffsetEndRadius,0);
  const f=Math.max(0,finite(d.ChangeFrame,0));
  return Math.max(0,lerp(init,end,f>0?clamp(frame/f,0,1):1));
}
export function updateCatalogVisual(p){
  const v=p?.catalogVisual;if(!v)return;
  p.vis=catalogVisualRadius(v,p.age);
  if(v.style==='bubble')p.vis*=catalogBubbleRadiusScale(p.catalog?.bounces??0);
  if(v.style==='sheet'){
    const speed=p.vel?.length?.()??0;
    const length=clamp(speed*Math.min(Math.max(0,p.age),v.tailSolid),v.tailMin,v.tailMax);
    p.tail0=1+length/Math.max(.001,p.vis);
    p.tailK=0;p.wob=.025;p.nose=0;p.sats=0;
  }else if(v.style==='bubble'){
    p.tail0=1;p.tailK=0;p.wob=.015;p.nose=0;p.sats=0;
  }else if(v.style==='rod'){
    p.tail0=1;p.tailK=0;p.wob=.006;p.nose=0;p.sats=0;
  }else if(v.style==='crown'){
    p.tail0=.55;p.tailK=.8;p.wob=.07;p.nose=0;p.sats=0;
  }
}
// A swept sphere reports the *surface* contact point. The rebounding centre
// must be outside its own collision envelope before the next swept tick;
// moving by 0.05 regardless of source radius re-detects the same hit at t=0.
export function catalogReboundSeparation(fieldRadius){
  return Math.max(.015,finite(fieldRadius,0)+.015);
}

// Inkipedia Splatoon 3 Bloblobber physics: two floor rebounds, unlimited wall
// reflections at 0.8 velocity, projectile collision/draw radius x0.75 per hit.
export function catalogBubbleCanBounce(groundBounces,normalY){
  return normalY<=.35||groundBounces<2;
}
export function catalogBubbleRadiusScale(totalBounces){
  return Math.pow(.75,Math.max(0,Math.floor(totalBounces||0)));
}

// Source-owned, fixed-60Hz falling paint drops already live in _s3SplashDrops.
// Draw their actual positions, NOT a guessed second visual trajectory.
// This path never modifies collision, lifetime, landing paint or network state.
// A 48-instance budget and camera distance cull preserve shader/CPU budgets.
export function appendSourcedSplashVisuals(system, mesh, shapes, inkLook, petals,
  count, capacity, matrix, rotation, scale, direction, axis, cameraPosition) {
  const queue=system?._s3SplashDrops;
  if(!queue?.length)return count;
  let drawn=0;
  for(let i=queue.length-1;i>=0&&count<capacity&&drawn<48;i--){
    const d=queue[i];
    if(!d?.owner?.color||!d.pos||!d.vel||d.owner.remote)continue;
    if(cameraPosition&&cameraPosition.distanceToSquared(d.pos)>900)continue;
    const speed=d.vel.length();
    direction.copy(d.vel);
    if(speed>1e-6)direction.multiplyScalar(1/speed);
    else direction.copy(axis);
    rotation.setFromUnitVectors(axis,direction);
    // d.radius is a *floor paint* footprint, not an ink model radius.
    const radius=Math.min(.07,.042+Math.sqrt(Math.max(0,d.radius||0))*.008);
    scale.setScalar(radius);
    matrix.compose(d.pos,rotation,scale);
    mesh.setMatrixAt(count,matrix);mesh.setColorAt(count,d.owner.color);
    const o=count*4;
    shapes[o]=1.1+Math.min(1.1,speed*.009);
    shapes[o+1]=.025;shapes[o+2]=(d.seed||0)*30+(d.frames||0)*.65;shapes[o+3]=0;
    inkLook[o]=1.3;inkLook[o+1]=6;inkLook[o+2]=.35;
    inkLook[o+3]=((d.seed||0)*43.98)%(Math.PI*2);
    petals[count*2]=0;petals[count*2+1]=0;
    count++;drawn++;
  }
  return count;
}
