import { INK_VAC_EVENTS } from './kit-ink-vac.mjs';
export const KIT_FORWARD = Object.freeze(Object.values(INK_VAC_EVENTS));
export function installKitNetwork(api) {
  const { NetMatch, G } = api;
  api.installInkVacSenderValidator((actor, from) => actor.remote === true &&
    actor.owner === from && G.netm?.byNid.get(actor.nid) === actor);
  NetMatch.prototype.replayKitEvent = function (name, event, from) {
    if (!KIT_FORWARD.includes(name)) return false;
    const actor = event.actor;
    // Bind the actual unpacked actor to the transport's sender, for both state
    // packets and absorption proposals. The payload cannot choose another owner.
    if (!actor || !actor.remote || actor.owner !== from || this.byNid.get(actor.nid) !== actor) return true;
    api.replayInkVac(name, actor, event, { from });
    return true;
  };
  return api;
}
