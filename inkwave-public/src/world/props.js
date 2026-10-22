// Compatibility entry: synchronous PropKit and the complete, ordered catalogue.
// The game loads props-core.js and prepares only the selected stage's packs.
import { registerPropPack } from './props-core.js';
import { registerMarinaVessels } from './props-marina-vessels.js';
import { registerMarinaDock } from './props-marina-dock.js';
import { STAGES } from './stages/index.js';
registerPropPack('marina-vessels', registerMarinaVessels);
registerPropPack('marina-dock', registerMarinaDock);
for (const [id, stage] of Object.entries(STAGES)) {
  if (!stage.register) continue;
  try { registerPropPack(id, stage.register); }
  catch (error) { console.error(`[inkwave] stage prop pack ${id} failed`, error); }
}
export { PropKit, PROP_TYPES, PALETTE } from './props-core.js';
