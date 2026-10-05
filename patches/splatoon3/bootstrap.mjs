import { install } from './runtime/install.mjs';
import { installQuality } from '../local-quality/install.mjs';
try {
  const response = await fetch(new URL('./profile.json', import.meta.url));
  if (!response.ok) throw new Error(`パッチ設定の読み込みに失敗しました (${response.status})`);
  const profile = await response.json();
  install(profile);
  installQuality(profile);
  await import('../../src/main.js');
} catch (error) {
  console.error('[INKWAVE patches]', error);
  const target = document.getElementById('boot-error');
  if (target) { target.textContent = 'ゲームの互換パッチを読み込めませんでした。' + error.message; target.style.display = 'block'; }
  throw error;
}
