// The Practice Range stage entry. Deliberately NOT part of config MAPS: the offline stage picker, the online lobby,
// boss fallbacks, OFFLINE_MAPS and every other list built from MAPS never see it, so it cannot leak into a Turf War,
// a Boss Battle or an online room. Only startMatch({ mapId: 'range' }) (the PLAY → PRACTICE RANGE card, ?range) reaches it.
import { isJa } from '../../src/i18n.js';

export const RANGE_ID = 'range';
export const RANGE_MAP = Object.freeze({
  id: RANGE_ID,
  name: isJa ? '試し撃ちラボ' : 'Practice Range',
  blurb: isJa ? 'ブキ・ヒト移動・イカ移動・ボム・スペシャルをためせる練習施設。'
    : 'The INKWAVE test lab: measure range, damage, paint, movement, bombs and specials.',
  theme: 'day',
  // one fixed reference light: before/after screenshots must be comparable (dusk is not offered on the range)
  times: { day: 'day', dusk: 'day' },
  practice: true, noBots: true, noBoss: true,
});

export const isRangeMap = (map) => !!map && map.id === RANGE_ID;
export const rangeMapFor = (id) => (id === RANGE_ID ? RANGE_MAP : null);
