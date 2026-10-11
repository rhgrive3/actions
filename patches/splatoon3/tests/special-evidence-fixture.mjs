// Exact production source composition plus every bootstrap installer. The scene,
// surface/LOS and character sinks are controlled; no renderer/retail claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
const compose = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
const installers = [
  ['installIssueFiveHotfixA', 'splatoon3/runtime/issue-five-hotfix-a.mjs'],
  ['installIssueFiveHotfixB', 'splatoon3/runtime/issue-five-hotfix-b.mjs'],
  ['installIssueFiveHotfixC', 'splatoon3/runtime/issue-five-hotfix-c.mjs'],
  ['installDisconnectFidelity', 'splatoon3/runtime/disconnect-fidelity.mjs'],
  ['installSlosherIntermediatePaint', 'splatoon3/runtime/slosher-intermediate-paint.mjs'],
  ['installQuality', 'local-quality/install.mjs'],
  ['installWeaponsFidelity', 'splatoon3/runtime/weapons-fidelity.mjs'],
  ['installIssueEightFollowup', 'splatoon3/runtime/issue-eight-followup.mjs'],
];
export async function specialEvidenceFixture() {
  const extraExports = installers.map(([name, path]) => `export { ${name} } from './patches/${path}';`).join('\n') + `
    export { inkVacActorContact, inkVacState, disposeInkVac, replayInkVac, INK_VAC_EVENTS, INK_VAC_CALIBRATION } from './patches/splatoon3/runtime/kit-ink-vac.mjs';
  `;
  const f = await fixture({ fullRuntime: true, realProjectiles: true, adapt: compose, adaptRuntime: compose, extraExports });
  const source = fs.readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
  let previous = source.indexOf('const context = install(profile);');
  assert.ok(previous >= 0);
  for (const [name] of installers) {
    const index = source.indexOf(`  ${name}(`, previous);
    assert.ok(index > previous, `production bootstrap calls ${name} in this order`);
    previous = index;
    if (name === 'installQuality') f[name](f.profile);
    else f[name](f.installedRuntime, f.profile);
  }
  f.G.match.state = 'playing';
  f.G.paint.sample = () => 0;
  return f;
}
