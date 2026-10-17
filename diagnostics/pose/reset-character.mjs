// Harness-only prototype. Use the installed Character constructor, keeping the
// existing gameplay Actor, WeaponRunner and normal projectile emitter unchanged.
export async function resetCaptureCharacter(actor) {
  const old = actor.character, parent = old.root.parent;
  const fresh = new old.constructor({ color: actor.color, weapon: actor.weaponId,
    style: old.style, name: actor.name, isLocal: actor.isLocal });
  fresh.actor = actor;
  fresh.onEvent = old.onEvent;
  try {
    // Character's normal loader also owns late source-motion initialization.
    // Do not let that initialization race the first physical capture.
    await fresh._sourceMotionLoader;
    if (fresh.sourceMotion?.status !== 'ready')
      throw new Error('Fresh native Character source motion failed readiness');
    fresh.root.position.copy(old.root.position);
    fresh.root.quaternion.copy(old.root.quaternion);
    fresh.setVisible(old.visible);
  } catch (error) { fresh.dispose(); throw error; }
  // Commit only after successful initialization; disposal failures must never
  // dispose the replacement now owned by the gameplay Actor.
  actor.character = fresh;
  if (parent) parent.add(fresh.root);
  old.dispose();
  fresh.root.updateMatrixWorld(true);
  return fresh;
}
