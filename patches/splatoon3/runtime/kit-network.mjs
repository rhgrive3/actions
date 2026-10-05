import { INK_VAC_EVENTS } from './kit-ink-vac.mjs';
export const BUBBLER_EVENTS = Object.freeze({ deploy: 'kit:bubbler:deploy', hit: 'kit:bubbler:hit', expire: 'kit:bubbler:collapse', proposal: 'kit:bubbler:damage-proposal' });
export const KIT_FORWARD = Object.freeze([...Object.values(INK_VAC_EVENTS), ...Object.values(BUBBLER_EVENTS)]);
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
    if (Object.values(BUBBLER_EVENTS).includes(name)) {
      if (name === BUBBLER_EVENTS.proposal) {
        // The shooter is bound to the transport above. Only the client owning
        // the named dome can adjudicate; session host status is irrelevant.
        if (event.shooter !== `n${actor.nid}` || event.shooterTeam !== actor.team) return true;
        const owner = [...this.byNid.values()].find(a => `n${a.nid}` === event.domeOwner);
        if (!owner || owner.remote || owner.owner !== this.myId) return true;
        G.projectiles?.kitBubbleAdjudicate?.(event, { host: true, roster: this.byNid.values() });
      } else {
        // A sender may only change domes belonging to its actual actor.
        if (event.team !== actor.team || typeof event.domeId !== 'string' ||
            !event.domeId.startsWith(`${actor.team}:n${actor.nid}:`)) return true;
        const stage = Object.keys(BUBBLER_EVENTS).find(k => BUBBLER_EVENTS[k] === name);
        const payload = stage === 'deploy' && event.pos?.isVector3
          ? { ...event, pos: [event.pos.x, event.pos.y, event.pos.z] } : event;
        G.projectiles?.kitBubbleReplay?.(stage, actor, payload);
      }
      return true;
    }
    api.replayInkVac(name, actor, event, { from });
    return true;
  };
  return api;
}
