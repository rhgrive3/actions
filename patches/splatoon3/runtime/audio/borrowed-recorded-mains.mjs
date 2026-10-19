// 2022-only source pack bridge for eleven later-added S3 main weapons.
// Every source ID here has an actual 2022-extracted, SHA-pinned local MP3.
// IMPORTANT: the source weapon's real recording is a TEMPORARY family proxy,
// NOT a recording of the target weapon and NOT a recovered S3 11.3.0 cue.
// Playback-only. Never rewrite catalog weapon IDs, network ownership, model,
// projectile behavior, kit IDs or sound manifest provenance.
//
// This provisional map is intentionally explicit and auditable. Remove each
// row when that target weapon's licensed, correct 11.3.0 recording is found.
export const BORROWED_RECORDED_MAIN = Object.freeze({
  's3-shooter-quicklong': 's3-shooter-long',       // Space Shooter -> Jet Squelcher
  's3-blaster-precision': 'blaster',              // S-BLAST '92 -> Blaster
  's3-roller-wide': 'roller',                     // Big Swig -> Splat Roller
  's3-brush-heavy': 's3-brush-normal',            // Painbrush -> Inkbrush
  's3-charger-pencil': 's3-charger-light',        // R-PEN -> Bamboozler
  's3-slosher-double': 'slosher',                 // Dread Wringer -> Slosher
  's3-spinner-hypershort': 'splatling',           // Heavy Edit -> Heavy Splatling
  's3-maneuver-long': 's3-maneuver-dual',         // Douser Dualies -> Dualie Squelchers
  's3-shelter-focus': 's3-shelter-normal',        // Recycled Brella -> Splat Brella
  's3-stringer-explosion': 's3-stringer-normal',  // Wellstring -> Tri-Stringer
  's3-saber-heavy': 's3-saber-normal',            // Decavitator -> Splatana Stamper
});
export const borrowedRecordedMainId = mainId =>
  typeof mainId === 'string' && Object.hasOwn(BORROWED_RECORDED_MAIN,mainId)
    ? BORROWED_RECORDED_MAIN[mainId] : mainId;
export const isBorrowedRecordedMain = mainId =>
  typeof mainId === 'string' && Object.hasOwn(BORROWED_RECORDED_MAIN,mainId);
