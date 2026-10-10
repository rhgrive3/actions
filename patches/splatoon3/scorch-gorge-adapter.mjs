// Scorch Gorge stage adapter (#203).
// Adapts the published INKWAVE target without modifying frozen inkwave-public/ files.
// Registers Scorch Gorge layout into MAP_LAYOUTS and stage metadata into MAPS / i18n.

export function adaptScorchGorge(rel, code, replaceOnce) {
  if (rel === 'src/world/maps.js') {
    if (code.includes('scorch-layout.mjs')) {
      throw new Error('INKWAVE patch conflict (scorch-gorge): already connected to maps.js');
    }
    code = replaceOnce(
      code,
      'export const MAP_LAYOUTS = { tidewater: TIDEWATER, kelpline: KELPLINE, halyard: HALYARD, cargo: CARGO };',
      "import { LAYOUT as SCORCH } from '../../patches/splatoon3/stage/scorch-layout.mjs';\n" +
      'export const MAP_LAYOUTS = { tidewater: TIDEWATER, kelpline: KELPLINE, halyard: HALYARD, cargo: CARGO };\n' +
      'MAP_LAYOUTS.scorch = SCORCH;',
      'scorch-gorge-maps-layout'
    );
    return code;
  }

  if (rel === 'src/config.js') {
    if (code.includes("'scorch'")) {
      throw new Error('INKWAVE patch conflict (scorch-gorge): already connected to config.js');
    }
    code = replaceOnce(
      code,
      "  { id: 'cargo', name: 'Cargo Terminal', blurb: 'A container terminal at shift change: a gantry crane straddles the pier between two moored box ships.', theme: 'day', times: { day: 'day', dusk: 'sunset' }, onlineOnly: true, noBots: true, noBoss: true },\n];",
      "  { id: 'cargo', name: 'Cargo Terminal', blurb: 'A container terminal at shift change: a gantry crane straddles the pier between two moored box ships.', theme: 'day', times: { day: 'day', dusk: 'sunset' }, onlineOnly: true, noBots: true, noBoss: true },\n" +
      "  { id: 'scorch', name: 'Scorch Gorge', blurb: 'An arid desert canyon with elevated perches, high grates, and drop-offs to the gorge floor.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },\n];",
      'scorch-gorge-config-maps'
    );
    return code;
  }

  if (rel === 'src/i18n.js') {
    if (code.includes('scorch:')) {
      throw new Error('INKWAVE patch conflict (scorch-gorge): already connected to i18n.js');
    }
    code = replaceOnce(
      code,
      "    halyard: ['ハリヤードマリーナ', '浮き桟橋に陸揚げされたタグボート、中央にはカーフェリー。水に落ちないように注意。'],\n  },",
      "    halyard: ['ハリヤードマリーナ', '浮き桟橋に陸揚げされたタグボート、中央にはカーフェリー。水に落ちないように注意。'],\n" +
      "    scorch: ['ユノハナ大渓谷', '高台と金網が交差する乾いた渓谷。奈落の谷底に注意。'],\n  },",
      'scorch-gorge-i18n-maps'
    );
    return code;
  }

  return code;
}
