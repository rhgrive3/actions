// Runtime installers register against their actual game context. The final
// disconnect policy may replace NetMatch.onLeave after those installers run;
// it still reaches these owners without depending on prototype wrap order.
const owners = new WeakMap();
export function registerReplicaRetirement(game, retire) {
  let callbacks = owners.get(game);
  if (!callbacks) { callbacks = new Set(); owners.set(game, callbacks); }
  callbacks.add(retire);
}
export function retireActorReplicas(game, actor) {
  if (!game || !actor) return;
  for (const retire of owners.get(game) || []) retire(actor);
}
