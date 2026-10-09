import { install } from './runtime/install.mjs';
import { installWeaponsFidelity } from './runtime/weapons-fidelity.mjs';
import { installQuality } from '../local-quality/install.mjs';
import { installIssueFiveHotfixA } from './runtime/issue-five-hotfix-a.mjs';
import { installIssueFiveHotfixB } from './runtime/issue-five-hotfix-b.mjs';
import { installIssueFiveHotfixC } from './runtime/issue-five-hotfix-c.mjs';
import { installDisconnectFidelity } from './runtime/disconnect-fidelity.mjs';
import { installSlosherIntermediatePaint } from './runtime/slosher-intermediate-paint.mjs';
import { installIssueEightFollowup } from './runtime/issue-eight-followup.mjs';
try {
  const response = await fetch(new URL('./profile.json', import.meta.url));
  if (!response.ok) throw new Error(`パッチ設定の読み込みに失敗しました (${response.status})`);
  const profile = await response.json();
  const context = install(profile);
  installIssueFiveHotfixA(context, profile);
  installIssueFiveHotfixB(context, profile);
  installIssueFiveHotfixC(context, profile);
  installDisconnectFidelity(context);
  installSlosherIntermediatePaint(context, profile);
  installQuality(profile);
  installWeaponsFidelity(context, profile);
  installIssueEightFollowup(context);
  await import('../../src/main.js');
} catch (error) {
  console.error('[INKWAVE patches]', error);
  const target = document.getElementById('boot-error');
  if (target) { target.textContent = 'ゲームの互換パッチを読み込めませんでした。' + error.message; target.style.display = 'block'; }
  throw error;
}
