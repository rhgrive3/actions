// Only placement-referenced optional builders are loaded. Descriptors and the public
// full synchronous facade remain separate, so default Tidewater never evaluates
// Cargo or marina builder modules. Native ESM memoizes successful module loads.
import { registerPropPacks } from './props-core.js';
import { dressingFor } from './dressing.js';
import { prepareStageData } from './stages/data.js';
const PACKS = [
  { id: "marina-vessels", types: ["ferry_hull", "ferry_cabin", "ferry_bridge", "ferry_locker", "ferry_cargo", "ferry_stair", "tug_ramp_rails", "tug_dress", "houseboat_dress", "yacht_sail", "yacht_motor", "boat_fishing", "boat_rib", "marina_pontoon", "marina_gate", "dinghy_trailer"], load: () => import("./props-marina-vessels.js").then(module => module.registerMarinaVessels) },
  { id: "marina-dock", types: ["pieredge", "fuelpump", "dockbox", "pumpout", "keelblocks", "quaycrates", "fuelhut", "fueldocksign", "clubhouse", "boathouse", "harbouroffice", "cafeset", "mapboard", "kayakrack", "shorepower", "bollardlight", "travellift", "tarpboat", "scaffold", "workbench", "beacon", "breakwater", "channelmarker", "gangwayrails", "grandstair"], load: () => import("./props-marina-dock.js").then(module => module.registerMarinaDock) },
  { id: "cargo", types: ["cargo_crane", "cargo_box", "cargo_loosebox", "cargo_stair", "cargo_ops", "cargo_reeferrack", "cargo_hatch", "cargo_gate", "cargo_chassis", "cargo_tractor", "cargo_reachstacker", "cargo_straddle", "cargo_cage", "cargo_quayedge", "cargo_mast", "cargo_flatrack", "cargo_lighttower", "cargo_signboard", "cargo_cabin", "cargo_pickup", "cargo_forklift", "cargo_backyard", "cargo_gangway", "cargo_kiosk", "cargo_rail", "cargo_ship"], load: () => import("./stages/cargo/props.js").then(module => module.register) },
  { id: 'range', types: ['range_gantry'], load: () => import('../../../patches/practice-range/stage/props.mjs').then(module => module.register) },
];
export async function preparePropPacks(layoutId, current = () => true) {
  await prepareStageData(layoutId);
  if (!current()) return false;
  const types = new Set(dressingFor(layoutId).map(placement => placement.type));
  const selected = PACKS.filter(pack => pack.types.some(type => types.has(type)));
  const registers = await Promise.all(selected.map(pack => pack.load()));
  if (!current()) return false;
  registerPropPacks(selected.map((pack, i) => [pack.id, registers[i]]));
  return true;
}

export { PropKit } from './props-core.js';
