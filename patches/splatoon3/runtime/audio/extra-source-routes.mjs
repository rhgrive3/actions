/**
 * Narrow routes from existing gameplay actions to already-shipped 2022 MP3s.
 * These are conservative naming-based candidates, NOT a recovered retail SLINK graph.
 * If a dedicated registered sound becomes available, it takes priority.
 * Other 2022 MP3s remain callable by their source:* ID, never guessed onto events.
 */
export const EXTRA_SOURCE_EVENT_ROUTES = Object.freeze({
  // The recorded family-neutral flying bomb sound covers thrown, moving subs.
  'sub:bomb:fire': 'source:Wp_BombFly_00',
  'sub:suction:fire': 'source:Wp_BombFly_00',
  'sub:burst:fire': 'source:Wp_BombFly_00',
  'sub:autobomb:fire': 'source:Wp_BombFly_00',
  'sub:fizzy:fire': 'source:Wp_BombFly_00',
  'sub:toxicMist:fire': 'source:Wp_BombFly_00',
  'sub:sprinkler:fire': 'source:Wp_BombFly_00',
  'sub:pointSensor:fire': 'source:Wp_MarkingFly_00',
  // These names distinguish activation from firing, and ending from starting.
  'special:tentaMissiles:open': 'source:Sp_MultiMissile_Attach_00',
  'special:storm:release': 'source:Sp_InkStorm_UpEnd_00',
  'special:inkVac:release': 'source:Sp_Blower_InhaleOff_00',
});
export const sourceEventRoute = (id,event) => EXTRA_SOURCE_EVENT_ROUTES[id+':'+event] || null;
