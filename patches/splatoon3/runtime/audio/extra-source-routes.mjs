/**
 * Narrow routes from existing gameplay actions to already-shipped 2022 MP3s.
 * These are conservative naming-based candidates, NOT a recovered retail SLINK graph.
 * If a dedicated registered sound becomes available, it takes priority.
 * Other 2022 MP3s remain callable by their source:* ID, never guessed onto events.
 */
export const EXTRA_SOURCE_EVENT_ROUTES = Object.freeze({
  // Flight-loop filenames (Wp_BombFly / Wp_MarkingFly) are NOT throw one-shots.
  // Do not play their full recorded duration without a projectile lifecycle.
  // These names distinguish activation from firing, and ending from starting.
  'special:tentaMissiles:open': 'source:Sp_MultiMissile_Attach_00',
  'special:storm:release': 'source:Sp_InkStorm_UpEnd_00',
  'special:inkVac:release': 'source:Sp_Blower_InhaleOff_00',
});
export const sourceEventRoute = (id,event) => EXTRA_SOURCE_EVENT_ROUTES[id+':'+event] || null;

// Explicit action names, when emitted, can play their matching existing clip.
// These are never mapped to an unrelated generic ready/impact event.
export const EXTRA_SPECIAL_ACTION_SOURCE = Object.freeze({
  'booyahBomb:cheer': 'source:Sp_NiceBall_NiceReceive_00',
  'inkVac:absorb': 'source:Sp_Blower_Inhale_InkGet_00',
  'crabTank:jump': 'source:Sp_Chariot_Jump_00',
  'crabTank:land': 'source:Sp_Chariot_Land_00',
  'reefslider:land': 'source:Sp_Skewer_Land_00',
  'zipcaster:wallJump': 'source:Sp_SuperHook_WallJump_00',
  'inkjet:boost': 'source:Sp_JetPack_Boost_00',
  'tentaMissiles:alert': 'source:Sp_MultiMissile_AlertOn_00',
  'tentaMissiles:lockTrigger': 'source:Sp_MultiMissile_LockTrigger_00',
  'ultraStamp:throwReady': 'source:Sp_UltraStamp_ThrowReady_00',
});
export const sourceSpecialActionRoute = (id,action) => EXTRA_SPECIAL_ACTION_SOURCE[id+':'+action] || null;
