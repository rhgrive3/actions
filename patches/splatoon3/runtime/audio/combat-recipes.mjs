// 2022 source-labelled combat SFX. These IDs are playback routing keys, not
// claims that the game's private SLINK graph has been fully recovered.
// Combat hit/splat events are recorded-only and NEVER eligible for synth PCM.
const make = id => Object.freeze({
  id, family:'combat', events:Object.freeze(['fire']),
  reference:'2022-extracted, source-verified; conditional use is a gameplay hypothesis',
});
export const COMBAT_AUDIO=Object.freeze({
  'combat:critical':make('combat:critical'),
  'combat:damage':make('combat:damage'),
  'combat:splat':make('combat:splat'),
  // Source-backed optional variants; not inferred from undocumented SLINK rules.
  'combat:ink_focus_normal':make('combat:ink_focus_normal'),
  'combat:ink_focus_strong':make('combat:ink_focus_strong'),
  'combat:splat_squid':make('combat:splat_squid'),
});
