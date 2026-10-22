// Source-parametric low-ink mode for added Roller/Brush attack groups.
// Mirrors the already installed native Splat Roller policy: a positive, under-
// cost ink tank emits the reduced group once; a truly empty tank does not.
const EPS=1e-9;
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
export function catalogDepletedDescriptor(source,unit,depleted=false){
  if(!depleted||!unit)return source;
  const rate=unit?.UnitParam?.CollisionParam?.DepletionRate;
  const fieldRate=Number.isFinite(rate)&&rate>=0&&rate<=1?rate:1;
  const c={...source.c};
  for(const key of ['InitRadiusForPlayer','EndRadiusForPlayer','InitRadiusForField','EndRadiusForField']){
    if(Number.isFinite(c[key]))c[key]*=fieldRate;
  }
  const param=unit?.UnitParam?.PaintParam;
  const paintRate=Number.isFinite(param?.DepletionDepthWidthRate)?param.DepletionDepthWidthRate:1;
  const paint={...source.b?.PaintParam};
  for(const key of Object.keys(paint)){
    if((key.startsWith('WidthHalf')||key.startsWith('DepthScale'))&&Number.isFinite(paint[key]))
      paint[key]*=paintRate;
  }
  return {...source,depleted:true,c,b:{...source.b,CollisionParam:c,PaintParam:paint},
    radius:source.radius*paintRate};
}
