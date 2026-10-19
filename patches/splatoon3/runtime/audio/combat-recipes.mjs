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
});
