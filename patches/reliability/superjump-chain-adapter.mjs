// #412: after the navigation owners have composed all confirmation paths,
// admit an already-jumping teammate only with a finite committed destination.
import { replaceOnce } from './input-adapter.mjs';
export function adaptSuperJumpChain(rel, code) {
  const patch = (before, after) => { code = replaceOnce(code, before, after, '#412 chain-jump ' + rel); };
  const ready = actor => `(!${actor}.superJumpState || hasCommittedSuperJumpDestination(${actor}))`;
  if (rel === 'src/game/player.js') {
    patch('o && o.alive && !o.superJumpState', `o && o.alive && ${ready('o')}`);
    patch('G.actors.includes(target) && target.alive && !target.superJumpState',
      `G.actors.includes(target) && target.alive && ${ready('target')}`);
    patch('!destination.alive || destination.superJumpState',
      '!destination.alive || (destination.superJumpState && !hasCommittedSuperJumpDestination(destination))');
  } else if (rel === 'src/ui/hud.js') {
    patch('ok: !!(o.alive && !o.superJumpState)', `ok: !!(o.alive && ${ready('o')})`);
  } else if (rel === 'src/ui/diorama.js') {
    patch('ok = !!(o.alive && !o.superJumpState)', `ok = !!(o.alive && ${ready('o')})`);
    patch('p.target && p.target.alive && !p.target.superJumpState',
      `p.target && p.target.alive && ${ready('p.target')}`);
  } else return code;
  return "import { hasCommittedSuperJumpDestination } from '../../patches/splatoon3/runtime/superjump-destination.mjs';\n" + code;
}
