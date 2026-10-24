// Source-parametric low-ink mode for added Roller/Brush attack groups.
// Mirrors the already installed native Splat Roller policy: a positive, under-
// cost ink tank emits the reduced group once; a truly empty tank does not.
const EPS=1e-9;
const COLLISION_KEYS=['InitRadiusForPlayer','EndRadiusForPlayer','InitRadiusForField','EndRadiusForField'];
export function catalogDepletionPayment(ink,fullCost,sourceRate=.5){
  if(!Number.isFinite(ink)||!Number.isFinite(fullCost)||!(fullCost>0))return null;
  if(ink<=EPS)return null;
  if(ink+EPS>=fullCost)return {depleted:false,cost:fullCost};
  // InkConsumeRateDepletion exists for Carbon/Dynamo/Big Swig; sparse added
  // Roller/Brush rows inherit the neutral 0.5 owner calibration unless native
  // engine defaults are recovered. Always debit actual ink, never inject ink.
  const rate=Number.isFinite(sourceRate)&&sourceRate>0&&sourceRate<=1?sourceRate:.5;
  return {depleted:true,cost:Math.min(ink,fullCost*rate)};
}
export function catalogDepletedUnitCount(unit,depleted=false){
  if(!depleted)return Math.max(0,Math.floor(unit?.BulletNum??1));
  return Math.max(0,Math.floor(unit?.DepletionBulletNum??unit?.BulletNum??1));
}
export function catalogDepletedUnitSpeed(unit,index,depleted=false,sampledBaseSpeed=null){
  const speed=(Number.isFinite(sampledBaseSpeed)?sampledBaseSpeed:(unit?.SpawnSpeedBase??0))+
    index*(unit?.AfterOffsetSpawnSpeed??0);
  return speed*(depleted?(unit?.DepletionSpeedRate??1):1);
}
export function catalogDepletedDescriptor(source,unit,depleted=false,cache=null){
  if(!depleted||!unit)return source;
  const rate=unit?.UnitParam?.CollisionParam?.DepletionRate;
  const fieldRate=Number.isFinite(rate)&&rate>=0&&rate<=1?rate:1;
  const c={...source.c};
  const previous=cache?.collision;
  let sameCollision=!!previous&&Object.is(previous.rate,fieldRate);
  if(sameCollision)for(const key of COLLISION_KEYS)if(!Object.is(previous.input[key],c[key])){sameCollision=false;break;}
  if(sameCollision){
    for(const key of COLLISION_KEYS)if(Number.isFinite(c[key]))c[key]=previous.output[key];
  }else{
    const input=cache?{...c}:null;
    for(const key of COLLISION_KEYS)if(Number.isFinite(c[key]))c[key]*=fieldRate;
    if(cache)cache.collision={rate:fieldRate,input,output:{...c}};
  }
  const param=unit?.UnitParam?.PaintParam;
  const paintRate=Number.isFinite(param?.DepletionDepthWidthRate)?param.DepletionDepthWidthRate:1;
  const paint={...source.b?.PaintParam};
  let samePaint=!!cache?.paint&&Object.is(cache.paint.rate,paintRate),ownCount=0;
  if(samePaint){
    for(const key in paint)if(Object.hasOwn(paint,key)){
      ownCount++;if(!Object.hasOwn(cache.paint.input,key)||!Object.is(cache.paint.input[key],paint[key]))samePaint=false;
    }
    samePaint=samePaint&&ownCount===cache.paint.count;
  }
  if(samePaint){
    for(const key of cache.paint.keys)paint[key]=cache.paint.output[key];
  }else{
    const input=cache?{...paint}:null,keys=cache?[]:null;ownCount=0;
    for(const key in paint)if(Object.hasOwn(paint,key)){
      ownCount++;
      if((key.startsWith('WidthHalf')||key.startsWith('DepthScale'))&&Number.isFinite(paint[key])){
        paint[key]*=paintRate;if(keys)keys.push(key);
      }
    }
    if(cache)cache.paint={rate:paintRate,input,output:{...paint},count:ownCount,keys};
  }
  return {...source,depleted:true,c,b:{...source.b,CollisionParam:c,PaintParam:paint},
    radius:source.radius*paintRate};
}
