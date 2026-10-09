// Presentation pass for charger laser sights (see frame-order-adapter.mjs). The 60 Hz tick still decides which
// sights exist and are visible; this only re-places the visible ones from the actor's current muzzle and aim point,
// after the rendered frame's camera and computeAim, so the ribbon never shows a previous frame's aim.
import { chargerSightVisible } from '../splatoon3/runtime/charger-surface.mjs';
export function syncChargerSights(projectiles) {
  for (const [actor, sight] of projectiles.sights) {
    if (!sight.visible) continue;
    if (chargerSightVisible(actor)) projectiles._placeSight(actor, sight);
    else sight.visible = false;
  }
}
