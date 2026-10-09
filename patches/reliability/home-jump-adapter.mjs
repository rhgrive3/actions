// #779: all Base selectors consume the same existing stage endpoint as the HUD.
// Keep respawn/spawner metadata and the legacy no-home fallback independent.
import { replaceOnce } from './input-adapter.mjs';
export function adaptHomeJump(rel, code) {
  const patch = (before, after, label) => { code = replaceOnce(code, before, after, 'home jump: ' + label); };
  if (rel === 'src/game/player.js') {
    patch('const p = G.level.spawnPads[a.team]; a.superJump(p.clone());',
      'const p = G.level?.homeSuperJumpPoints?.[a.team] || G.level?.spawnPads?.[a.team]; if (p) a.superJump(p.clone());',
      'live keyboard touch and raw-pad home');
    patch('const target = i === 3 ? G.level.spawnPads?.[a.team]?.clone() : allies[i];',
      'const target = i === 3 ? (G.level?.homeSuperJumpPoints?.[a.team] || G.level?.spawnPads?.[a.team])?.clone() : allies[i];',
      'deferred respawn home');
    patch('const destination = liveTarget.spawn ? G.level.spawnPads?.[a.team]?.clone() : liveTarget.actor;',
      'const destination = liveTarget.spawn ? (G.level?.homeSuperJumpPoints?.[a.team] || G.level?.spawnPads?.[a.team])?.clone() : liveTarget.actor;',
      'standard-pad home confirmation');
  }
  if (rel === 'src/ui/diorama.js') {
    patch("} else if (i === 3) { tgt = G.level?.spawnPads?.[me.team] || null; ok = !!tgt; }",
      "} else if (i === 3) { tgt = G.level?.homeSuperJumpPoints?.[me.team] || G.level?.spawnPads?.[me.team] || null; ok = !!tgt; }",
      'rendered base pin');
    patch('if (i === 3) { const pad = G.level?.spawnPads?.[me.team];',
      'if (i === 3) { const pad = G.level?.homeSuperJumpPoints?.[me.team] || G.level?.spawnPads?.[me.team];',
      'diorama home request');
  }
  return code;
}
