import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const HISTORICAL_MENU_LAYOUT_SHA256='f694cc7e2cecfc612c054faad7a60e2656bdac18c743977c17c35f5ec40bb55d';
export const CURRENT_MENU_LAYOUT_SHA256='ff0a0c479e5aca4f88082836c17d8631e2d835caae7fc9c8eddcaa26e76918d9';
export const HISTORICAL_MENU_INSTALLER_SHA256='c5991f05eaa7b8b81ca43f36d9278237e00dfc44c714b7a60fe635203c98cb0f';
export const ICON_MENU_INSTALLER_SHA256='43c46f4e81cd6f73c27d7c8ba4dc6507561c638b48ef379c341dd4fd88d6e6ac';
export const SQUIDROLL_MENU_INSTALLER_SHA256='897584395e2e3e070e5d499d1e579c7fd2eb0b5e833e96bff874602a5435aea8';
export const MENU_ICON_INPUT_SHA256=Object.freeze({
 'patch/runtime/ui-kit-icons.mjs':'d4196644a1867263f6ba22814d7d0174426ec838031c5b3df51e6360d47e2e08',
 'patch/runtime/ui-sub-icons.mjs':'0fe024784718d29fcc552a9f981b4eb78e359cfd4eb6a49e273da4a212978e2d',
 'patch/runtime/ui-special-icons.mjs':'4b0ea14d27aae5129e2e98568e6cceb30a9bc1dfc688c000d01efba9e29851dc',
});
export const SQUIDROLL_MENU_INPUT_SHA256=Object.freeze({
 'patch/runtime/squidroll-effects.mjs':'e1413dade8d551faa29f0c3b48350981b88771464d2ba824882cf172dcbeb337',
});
const SQUIDROLL_OPTIMIZED_PREDECESSOR_SHA256='bb5f11890f3eaef9780319aeebed5b60d5a8aa86c966ae0eb6184599794b4453';
const squidrollOptimizationDelta=Object.freeze([
  ["        const nx=vx/speed,nz=vz/speed;\n", ""],
  ["s.velocity.set(Math.cos(angle) * 2 - nx, .8 + phase * 1.8, Math.sin(angle) * 2 - nz);",
   "s.velocity.set(Math.cos(angle) * 2 - vx / speed, .8 + phase * 1.8, Math.sin(angle) * 2 - vz / speed);"],
  ["        const arcCount=this.glows?Math.min(18,Math.max(0,this.glows.cap-this.glows.n)):0;\n        for (let i = 0; i < arcCount; i++) {",
   "        for (let i = 0; i < 18; i++) {"],
  ["s.point.set(s.pos.x + nx * along, s.pos.y + Math.sin(angle) * .44, s.pos.z + nz * along);",
   "s.point.set(s.pos.x + vx / speed * along, s.pos.y + Math.sin(angle) * .44, s.pos.z + vz / speed * along);"],
]);
const hash=source=>createHash('sha256').update(source).digest('hex');
// a138128328543f9e8236a867408b57467ab527c9: cache only screen-owned
// nodes, retain native navigation on lost ownership, and avoid unchanged writes.
const changes=[
 [
  "  const onNav = scr.onNav;\n  scr.onNav = dir => {\n    // Read the real grid on each move: the six-rule catalogue, portrait rows",
  "  const onNav = scr.onNav;\n  const modeRow = scr.el.querySelector('.iw-modesel__row');\n  const modeCards = modeRow ? [...modeRow.querySelectorAll('.iw-mode')] : [];\n  scr.onNav = dir => {\n    // Read the real grid on each move: the six-rule catalogue, portrait rows",
 ],
 [
  "    if ((touchMenu() || menus._input === 'touch') && ['up', 'down', 'left', 'right'].includes(dir)) {\n      const row = scr.el.querySelector('.iw-modesel__row');\n      const cards = [...row.querySelectorAll('.iw-mode')];\n      const i = cards.indexOf(menus._focus);",
  "    if ((touchMenu() || menus._input === 'touch') && (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right')) {\n      const row = modeRow, cards = modeCards;\n      const i = cards.indexOf(menus._focus);\n      if (i < 0 || row?.isConnected === false || cards.some(card => card.parentNode !== row)) return onNav?.(dir);",
 ],
 [
  "    for (const c of cards) c.hidden = key !== 'all' && c.dataset.cat !== key;",
  "    for (const c of cards) { const hidden = key !== 'all' && c.dataset.cat !== key; if (c.hidden !== hidden) c.hidden = hidden; }",
 ],
];
function once(source,from,to){
 const i=source.indexOf(from);
 assert.ok(i>=0&&source.indexOf(from,i+from.length)<0,'Menu focus epoch requires exactly one reviewed owner site');
 return source.slice(0,i)+to+source.slice(i+from.length);
}
export function restoreReviewedMenuLayout(source){
 for(const [before,after] of [...changes].reverse())source=once(source,after,before);
 assert.equal(hash(source),HISTORICAL_MENU_LAYOUT_SHA256,'Menu owner restoration must equal the complete frozen source epoch');
 return source;
}
export function verifyMenuLayoutSourceIdentity(source,manifestDigest,historicalDigest){
 assert.equal(historicalDigest,HISTORICAL_MENU_LAYOUT_SHA256,'Frozen menu focus source epoch');
 const observed=hash(source);
 assert.equal(manifestDigest,observed,'Emitted menu-layout input matches actual repository source bytes');
 if(observed===HISTORICAL_MENU_LAYOUT_SHA256)return {epoch:'historical-stage-picker',sourceSha256:observed,historicalSha256:observed};
 assert.equal(observed,CURRENT_MENU_LAYOUT_SHA256,'Reviewed current menu-layout source epoch');
 const restored=restoreReviewedMenuLayout(source);
 assert.equal(hash(restored),HISTORICAL_MENU_LAYOUT_SHA256,'Current menu-layout reverses to the complete frozen source epoch');
 return {epoch:'a1381283-screen-owned-caches',sourceSha256:observed,historicalSha256:hash(restored)};
}

// The icon integration adds precisely the icon-owner import and install call. The complete
// predecessor is frozen independently; the original menu pin stays unchanged.
const installerChanges=[
 ["import { composeKits, registerKitMetadata } from './kit-composition.mjs';\n", "import { composeKits, registerKitMetadata } from './kit-composition.mjs';\nimport { installCatalogueKitIcons } from './ui-kit-icons.mjs';\n"],
 ["  installCatalogueLoadout(api);\n", "  installCatalogueKitIcons(api);\n  installCatalogueLoadout(api);\n"],
];
function assertHistoricalInstaller(source,frozen){
 assert.equal(hash(frozen),HISTORICAL_MENU_INSTALLER_SHA256,'Frozen menu installer epoch');
 assert.equal(source,frozen,'Complete historical menu installer bytes');
}
export function projectReviewedMenuInstaller(source,frozen){
 assertHistoricalInstaller(source,frozen);
 for(const [before,after] of installerChanges)source=once(source,before,after);
 assert.equal(hash(source),ICON_MENU_INSTALLER_SHA256,'Reviewed icon menu installer epoch');
 return source;
}
export function restoreReviewedMenuInstaller(source,frozen){
 assert.equal(hash(source),ICON_MENU_INSTALLER_SHA256,'Reviewed icon menu installer epoch');
 for(const [before,after] of [...installerChanges].reverse())source=once(source,after,before);
 assertHistoricalInstaller(source,frozen);return source;
}
// Squid Roll effects are a separate two-line epoch over the independently
// frozen icon installer; no earlier installer identity is broadened.
const squidrollChanges=[
 ["import { installMovementMotion } from './movement-motion.mjs';\n", "import { installMovementMotion } from './movement-motion.mjs';\nimport { installSquidrollEffects } from './squidroll-effects.mjs';\n"],
 ["  installMovementMotion(api, profile);\n", "  installMovementMotion(api, profile);\n  installSquidrollEffects(api, profile);\n"],
];
function assertIconInstaller(source,frozenIcon){
 assert.equal(typeof frozenIcon,'string','Frozen icon menu installer required');
 assert.equal(hash(frozenIcon),ICON_MENU_INSTALLER_SHA256,'Frozen icon menu installer epoch');
 assert.equal(source,frozenIcon,'Complete icon menu installer bytes');
}
export function projectSquidrollMenuInstaller(source,frozenIcon){
 assertIconInstaller(source,frozenIcon);
 for(const [before,after] of squidrollChanges)source=once(source,before,after);
 assert.equal(hash(source),SQUIDROLL_MENU_INSTALLER_SHA256,'Reviewed Squid Roll menu installer epoch');return source;
}
export function restoreSquidrollMenuInstaller(source,frozenIcon){
 assert.equal(hash(source),SQUIDROLL_MENU_INSTALLER_SHA256,'Reviewed Squid Roll menu installer epoch');
 for(const [before,after] of [...squidrollChanges].reverse())source=once(source,after,before);
 assertIconInstaller(source,frozenIcon);return source;
}
export function verifyMenuInstallerSourceIdentity(source,manifestDigest,historicalDigest,frozen,iconInputs={},frozenIcon){
 assert.equal(historicalDigest,HISTORICAL_MENU_INSTALLER_SHA256,'Original menu installer pin');
 assert.equal(hash(frozen),HISTORICAL_MENU_INSTALLER_SHA256,'Frozen menu installer epoch');
 const observed=hash(source);
 assert.equal(manifestDigest,observed,'Emitted menu installer input matches actual repository source bytes');
 if(observed===HISTORICAL_MENU_INSTALLER_SHA256){
  assertHistoricalInstaller(source,frozen);
  return {epoch:'historical-installer',sourceSha256:observed,historicalSha256:observed,iconInputs:{},effectInputs:{}};
 }
 let epoch;
 if(observed===ICON_MENU_INSTALLER_SHA256){
  restoreReviewedMenuInstaller(source,frozen);epoch='catalogue-kit-icons';
 }else{
  assert.equal(observed,SQUIDROLL_MENU_INSTALLER_SHA256,'Reviewed Squid Roll menu installer epoch');
  const iconInstaller=restoreSquidrollMenuInstaller(source,frozenIcon);
  restoreReviewedMenuInstaller(iconInstaller,frozen);epoch='catalogue-kit-icons-and-squidroll-effects';
 }
 const iconHashes={};
 for(const [key,expected] of Object.entries(MENU_ICON_INPUT_SHA256)){
  const input=iconInputs[key];
  assert.ok(input&&typeof input.source==='string','Required menu icon source: '+key);
  const actual=hash(input.source);
  assert.equal(actual,expected,'Reviewed menu icon source: '+key);
  assert.equal(input.manifestDigest,actual,'Emitted menu icon input matches actual repository source: '+key);
  iconHashes[key]=actual;
 }
 const effectHashes={};
 if(epoch==='catalogue-kit-icons-and-squidroll-effects')for(const [key,expected] of Object.entries(SQUIDROLL_MENU_INPUT_SHA256)){
  const input=iconInputs[key];
  assert.ok(input&&typeof input.source==='string','Required Squid Roll effect source: '+key);
  const actual=hash(input.source);
  assert.equal(actual,expected,'Reviewed Squid Roll effect source: '+key);
  if(key==='patch/runtime/squidroll-effects.mjs'){
    let predecessor=input.source;
    for(const [optimized,original] of squidrollOptimizationDelta)predecessor=once(predecessor,optimized,original);
    assert.equal(hash(predecessor),SQUIDROLL_OPTIMIZED_PREDECESSOR_SHA256,
      'Squid Roll optimizer must reverse to its separately frozen source epoch');
  }
  assert.equal(input.manifestDigest,actual,'Emitted Squid Roll effect input matches actual repository source: '+key);
  effectHashes[key]=actual;
 }
 return {epoch,sourceSha256:observed,historicalSha256:HISTORICAL_MENU_INSTALLER_SHA256,iconInputs:iconHashes,effectInputs:effectHashes};
}
