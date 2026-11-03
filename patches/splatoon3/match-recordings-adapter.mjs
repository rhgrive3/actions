// Owner-supplied match music and cues (Google Drive, 2026-11-03). Applied at the
// end of the composition so every anchor below is the final composed text.
//  - opening      → "Battle Opening" (plays once through the pre-GO intro)
//  - results_win  → "Turf Master";  results_lose → "Battle Defeat" (looping)
//  - victory / defeat jingles and the judge result meter → recorded one-shots
//    (runtime/audio/match-recordings.mjs; synthesized fallback until decoded)
// The results BGM now starts after the recorded jingle instead of at a fixed 2.6 s.
const IMPORT = "import { installMatchRecordings } from '../../patches/splatoon3/runtime/audio/match-recordings.mjs';\n";
export function adaptMatchRecordings(rel, code, replaceOnce) {
  if (rel === 'src/audio/audio.js') {
    if (code.includes(IMPORT)) throw new Error('INKWAVE match recordings: repeated audio.js transform');
    return IMPORT + code + '\ninstallMatchRecordings(AudioEngine);\n';
  }
  if (rel === 'src/audio/streamedTrack.js') {
    return replaceOnce(code, '    element.loop = true;\n',
      "    // The match Opening recording plays once through the pre-GO intro.\n    element.loop = id !== 'opening';\n",
      'match recordings: one-shot file track');
  }
  if (rel === 'src/audio/music.js') {
    code = replaceOnce(code,
      "  battle: new URL('../../assets/audio/Jet_Arrow.mp3', import.meta.url).href,\n});",
      "  battle: new URL('../../assets/audio/Jet_Arrow.mp3', import.meta.url).href,\n" +
      "  // Owner-supplied match recordings (Drive, 2026-11-03). They follow the same\n" +
      "  // retry / gesture-recovery policy as menu and battle.\n" +
      "  opening: new URL('../../assets/audio/battle_opening.mp3', import.meta.url).href,\n" +
      "  results_win: new URL('../../assets/audio/result_win_turf_master.mp3', import.meta.url).href,\n" +
      "  results_lose: new URL('../../assets/audio/result_lose_battle_defeat.mp3', import.meta.url).href,\n});",
      'match recordings: file tracks');
    // Opening and results start after awaits (loading, judge); unlock their
    // media elements on the first gesture like menu/battle (iOS autoplay).
    code = replaceOnce(code,
      "    const unlocked = this._unlockedFiles || (this._unlockedFiles = new Map());\n    for (const track of REQUIRED_FILE_TRACKS) {",
      "    const unlocked = this._unlockedFiles || (this._unlockedFiles = new Map());\n    for (const track of Object.keys(FILE_TRACK_URLS)) {",
      'match recordings: gesture unlock');
    return code;
  }
  if (rel === 'src/main.js') {
    return replaceOnce(code,
      "        this._playMusic(won ? 'results_win' : 'results_lose');\n    }, 2600);",
      "        this._playMusic(won ? 'results_win' : 'results_lose');\n" +
      "    }, Math.max(2600, Math.ceil((G.audio?.recordedCueSeconds?.(won ? 'victory_fanfare' : 'defeat_jingle') || 0) * 1000)));",
      'match recordings: results BGM after the jingle');
  }
  return code;
}
