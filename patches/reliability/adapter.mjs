// Build-only reliability corrections, after gameplay and touch-layout adaptation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptInput } from './input-adapter.mjs';
import { adaptNet } from './net-adapter.mjs';
import { adaptResults } from './results-adapter.mjs';
import { adaptMobile } from './mobile-adapter.mjs';
import { adaptTouchEdges } from './touch-edge-adapter.mjs';
import { adaptIntro } from './intro-adapter.mjs';
import { adaptStart } from './start-adapter.mjs';
import { adaptAttract } from './attract-adapter.mjs';
import { adaptHud } from './hud-adapter.mjs';
import { adaptGyro } from './gyro-adapter.mjs';
import { adaptPause } from './pause-adapter.mjs';

export const RELIABILITY_ROOT = fileURLToPath(new URL('./', import.meta.url));
const adapters = [adaptInput, adaptNet, adaptResults, adaptMobile, adaptTouchEdges, adaptIntro, adaptStart, adaptAttract, adaptHud, adaptGyro, adaptPause];
export function adaptReliability(rel, code) {
  for (const adapt of adapters) code = adapt(rel, code);
  return code;
}
export function reliabilityIdentity() {
  const files = ['adapter.mjs', 'input-adapter.mjs', 'net-adapter.mjs', 'results-adapter.mjs', 'mobile-adapter.mjs', 'touch-edge-adapter.mjs', 'intro-adapter.mjs', 'start-adapter.mjs', 'attract-adapter.mjs', 'hud-adapter.mjs', 'gyro-adapter.mjs', 'pause-adapter.mjs'];
  return Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(new URL(file, import.meta.url))).digest('hex')]));
}
