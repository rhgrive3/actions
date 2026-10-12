// Source-guided, visual-only main-projectile profile for catalog-added weapons.
// DrawSizeParam and Tail* are from pinned Leanny/splat3 11.3.0 records.
// The source does not publish a matching shooter pixel/mesh radius. The bounded
// shooter cross-section multiplier below is an INKWAVE visual calibration,
// never used for player or field collision, damage, trajectory or turf paint.
const finite=(v,f)=>Number.isFinite(v)?v:f;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
export function catalogVisualSpec(record,descriptor,index=0){
  const family=record?.family, b=descriptor?.b||{}, c=descriptor?.c||{};
  const draw=b.DrawSizeParam||b.UnitParam?.DrawSizeParam||null;
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
