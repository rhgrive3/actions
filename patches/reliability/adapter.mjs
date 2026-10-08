import { adaptNetHitPayload } from './net-hit-payload-adapter.mjs';
import { adaptIssue464 } from './issue-464-adapter.mjs';
// Build-only reliability corrections, after gameplay and touch-layout adaptation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptSpecialWater } from './special-water-adapter.mjs';
import { adaptSpecialBarrier } from './special-barrier-adapter.mjs';
import { adaptSubAction } from './sub-action-adapter.mjs';
import { adaptInputOwnership } from './input-ownership-adapter.mjs';
import { adaptControls } from './controls-adapter.mjs';
import { adaptNavigation } from './navigation-adapter.mjs';
import { adaptMapGyro } from './map-gyro-adapter.mjs';
import { adaptRespawnNavigation } from './respawn-navigation-adapter.mjs';
import { adaptTouchPointerLock } from './touch-pointerlock-adapter.mjs';
import { adaptTouchGyroOwner } from './touch-gyro-owner-adapter.mjs';
import { adaptInput } from './input-adapter.mjs';
import { adaptPadHandoff } from './pad-handoff-adapter.mjs';
import { adaptNet } from './net-adapter.mjs';
import { adaptResults } from './results-adapter.mjs';
import { adaptMobile } from './mobile-adapter.mjs';
import { adaptTouchEdges } from './touch-edge-adapter.mjs';
import { adaptIntro } from './intro-adapter.mjs';
import { adaptStart } from './start-adapter.mjs';
import { adaptAttract } from './attract-adapter.mjs';
import { adaptHud } from './hud-adapter.mjs';
import { adaptGyro } from './gyro-adapter.mjs';
import { adaptGyroInvert } from './gyro-invert-adapter.mjs';
import { adaptPause } from './pause-adapter.mjs';
import { adaptCombatLife } from './combat-life-adapter.mjs';
import { adaptCombatCredit } from './combat-credit-adapter.mjs';
import { adaptHoldCancel } from './hold-cancel-adapter.mjs';
import { adaptPinTap } from './pin-tap-adapter.mjs';
import { adaptMapLook } from './map-look.mjs';
import { adaptSixFollowup } from './inkwave-six-followup-adapter.mjs';
import { adaptEightFollowup } from './inkwave-eight-followup-adapter.mjs';

export const RELIABILITY_ROOT = fileURLToPath(new URL('./', import.meta.url));
// adaptMapLook runs after the shared reliability stack so mapUp ownership composes with input/pause adapters.
const adapters = [adaptInput, adaptNet, adaptResults, adaptMobile, adaptTouchEdges, adaptIntro, adaptStart, adaptAttract, adaptHud, adaptGyro, adaptGyroInvert, adaptPause, adaptCombatLife, adaptCombatCredit, adaptInputOwnership, adaptControls, adaptNavigation, adaptRespawnNavigation, adaptMapGyro, adaptSubAction, adaptSpecialBarrier, adaptSpecialWater, adaptTouchPointerLock, adaptTouchGyroOwner, adaptPadHandoff, adaptIssue464, adaptNetHitPayload, adaptHoldCancel, adaptPinTap, adaptMapLook, adaptSixFollowup, adaptEightFollowup];
export function adaptReliability(rel, code) {
  for (const adapt of adapters) code = adapt(rel, code);
  return code;
}
export function reliabilityIdentity() {
  const files = ['menu-takeover.mjs', 'net-hit-payload-adapter.mjs', 'issue-464-adapter.mjs', 'adapter.mjs', 'special-water-adapter.mjs', 'special-barrier-adapter.mjs', 'sub-action-adapter.mjs', 'input-ownership-adapter.mjs', 'controls-adapter.mjs', 'navigation-adapter.mjs', 'respawn-navigation-adapter.mjs', 'map-gyro-adapter.mjs', 'touch-pointerlock-adapter.mjs', 'input-adapter.mjs', 'net-adapter.mjs', 'results-adapter.mjs', 'mobile-adapter.mjs', 'touch-edge-adapter.mjs', 'intro-adapter.mjs', 'start-adapter.mjs', 'attract-adapter.mjs', 'hud-adapter.mjs', 'gyro-adapter.mjs', 'gyro-invert-adapter.mjs', 'pause-adapter.mjs', 'combat-life-adapter.mjs', 'combat-credit-adapter.mjs', 'touch-gyro-owner-adapter.mjs', 'pad-handoff-adapter.mjs', 'hold-cancel-adapter.mjs', 'pin-tap-adapter.mjs', 'map-look.mjs', 'inkwave-six-followup-adapter.mjs', 'inkwave-eight-followup-adapter.mjs'];
  return Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(new URL(file, import.meta.url))).digest('hex')]));
}
