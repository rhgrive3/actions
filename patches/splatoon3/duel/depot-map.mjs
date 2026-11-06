// Inkbox Depot entry for the dedicated 2v2 / 1v1 mode. Like the Practice Range it is
// deliberately NOT part of config MAPS: the ordinary Turf War / ranked / Boss stage
// pickers, OFFLINE_MAPS and boss fallbacks never list it. It is reached only through
// the PLAY → 2v2・1v1 card (offline) and the online lobby's 2v2 / 1v1 modes.
import { isJa } from '../../../src/i18n.js';

export const DEPOT_ID = 'depot';
export const DEPOT_MAP = Object.freeze({
  id: DEPOT_ID,
  name: isJa ? 'インクボックス倉庫' : 'Inkbox Depot',
  blurb: isJa ? '2対2・1対1専用の屋内倉庫。コンテナの山と荷捌きデッキ、パレットラックが遮蔽になる。'
    : 'An indoor warehouse built for 2v2 and 1v1: container stacks, a loading dock and a pallet rack.',
  theme: 'day',
  times: { day: 'day', dusk: 'sunset' },
  duel: true, noBoss: true, teamSize: 2,
});
export const DUEL_MODES = Object.freeze({ duo: 2, solo: 1 });
export const isDuelMode = (m) => m === 'duo' || m === 'solo';
export const isDepotMap = (map) => !!map && map.id === DEPOT_ID;
export const depotMapFor = (id) => (id === DEPOT_ID ? DEPOT_MAP : null);
