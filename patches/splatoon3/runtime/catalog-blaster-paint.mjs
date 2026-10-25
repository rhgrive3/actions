import { BLASTER_BURST_PARAM_DEFAULTS } from './weapons-fidelity.mjs';
import { spawnSplashDrop } from './blaster-flight-paint.mjs';
import { SOURCE_SHOT_PAINT_KIND, SOURCE_SPLASH_PAINT_KIND } from './source-shot-footprint.mjs';
import { mainInkBurstFootprint } from './main-ink-footprints.mjs';

// Added Blasters use the same sphere + falling-drop ownership as the native
// Blaster. Explicit 11.3.0 mode fields override the documented sparse defaults.
// Damage radius and paint radius are independent; an absent nearby floor must
// not discard an airburst or turn its falling drop into instant floor paint.
export function paintCatalogBlasterBurst(game, projectile, collision = false, hit = null) {
  const p=projectile,descriptor=p.catalog?.descriptor;
  if(p.ghost||!p.owner||p.owner.remote)return;
  const burst={...BLASTER_BURST_PARAM_DEFAULTS,...descriptor.b.BlasterBurstParam};
  const sphere=collision?burst.SplashPaintShotColHitRadius:burst.SplashPaintRadius;
  const radius=collision?burst.SplashDropPaintShotColHitRadius:burst.SplashDropPaintRadius;
  const direction=p.vel.clone().setY(0).normalize(),footprint=mainInkBurstFootprint(p.catalog.r);
  if(sphere>0){
    const area=game.paint.splat(p.pos,sphere,p.team,{seed:p.seed,kind:SOURCE_SHOT_PAINT_KIND,
      face:-1,footprint,stretch:direction,stretchAmt:0,claimOwner:p.owner});
    if(Number.isFinite(area)&&area)p.owner.addTurf(area);
  }
  // Jump-mode rows are sparse overrides of the same Blaster move class.
  const gravity=descriptor.m.FreeGravity??p.catalog.r.parameters.MoveParam.FreeGravity;
  if(burst.SplashDropOn&&radius>0&&Number.isFinite(gravity)&&gravity>0){
    const from=p.pos.clone(),normal=hit?.normal;
    if(collision&&normal&&Number.isFinite(normal.y)&&Math.abs(normal.y)<.45)
      from.addScaledVector(normal,Math.max(.05,burst.SplashDropCollisionRadius));
    else if(collision)from.y+=.05;
    spawnSplashDrop(game,{owner:p.owner,team:p.team,seed:p.seed,salt:collision?0x1107:0x1106,
      from,direction,radius,spec:{gravity:gravity*3600,
        depthScaleMax:1,depthScaleMin:1,dropHeightMax:0,dropHeightMin:0,randomVelocity:null},
      depth:false,kind:SOURCE_SPLASH_PAINT_KIND,footprint,
      initialDownSpeed:Math.max(0,burst.SplashDropInitSpeed)*60,catchUpSeconds:p.catalog.carry});
  }
}
