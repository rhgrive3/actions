import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {restoreQueueThrowPredictionSource} from './inkwave-throw-prediction-source-epoch-20261031.mjs';

export const HISTORICAL_MENU_LAYOUT_SHA256='f694cc7e2cecfc612c054faad7a60e2656bdac18c743977c17c35f5ec40bb55d';
export const CURRENT_MENU_LAYOUT_SHA256='ff0a0c479e5aca4f88082836c17d8631e2d835caae7fc9c8eddcaa26e76918d9';
export const HISTORICAL_MENU_INSTALLER_SHA256='c5991f05eaa7b8b81ca43f36d9278237e00dfc44c714b7a60fe635203c98cb0f';
export const ICON_MENU_INSTALLER_SHA256='43c46f4e81cd6f73c27d7c8ba4dc6507561c638b48ef379c341dd4fd88d6e6ac';
export const SQUIDROLL_MENU_INSTALLER_SHA256='897584395e2e3e070e5d499d1e579c7fd2eb0b5e833e96bff874602a5435aea8';
export const THROW_PREDICTION_MENU_INSTALLER_SHA256='7c76f6c1dde17a1f6ec9fda5e7959d1dbcdc69de4af5ea2f5eb83814e1ec8cb8';
export const MENU_ICON_INPUT_SHA256=Object.freeze({
 'patch/runtime/ui-kit-icons.mjs':'d4196644a1867263f6ba22814d7d0174426ec838031c5b3df51e6360d47e2e08',
 'patch/runtime/ui-sub-icons.mjs':'0fe024784718d29fcc552a9f981b4eb78e359cfd4eb6a49e273da4a212978e2d',
 'patch/runtime/ui-special-icons.mjs':'4b0ea14d27aae5129e2e98568e6cceb30a9bc1dfc688c000d01efba9e29851dc',
});
export const SQUIDROLL_MENU_INPUT_SHA256=Object.freeze({
 'patch/runtime/squidroll-effects.mjs':'bb5f11890f3eaef9780319aeebed5b60d5a8aa86c966ae0eb6184599794b4453',
});
export const THROW_PREDICTION_MENU_INPUT_SHA256=Object.freeze({
 'patch/runtime/throw-prediction.mjs':'5906dd38cdc58cc3cba60a1f46267f42d022b4d7a14a0cefc4f01f2035f9378e',
});
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
// The current main installer adds precisely the prediction import and its
// final installation site. The full Squid Roll predecessor is frozen from
// da597310b85daa91f961d77dffc261bfc3980a11, whose complete bytes already match
// SQUIDROLL_MENU_INSTALLER_SHA256. No historical pin or epoch is relabelled.
const throwPredictionChanges=[
 ["import { installAllSpecials, replaySpecial } from './all-specials.mjs';\n", "import { installAllSpecials, replaySpecial } from './all-specials.mjs';\nimport { installThrowPrediction } from './throw-prediction.mjs';\n"],
 ['  installMainWeaponCatalogRuntime(api, profile);\n', '  installMainWeaponCatalogRuntime(api, profile);\n  // Every weapon-specific flight/activation owner is now installed. Render\n  // its exact prediction instead of falling back to the Splat Bomb equation.\n  installThrowPrediction(api);\n'],
];
function assertSquidrollInstaller(source,frozenSquidroll){
 assert.equal(typeof frozenSquidroll,'string','Frozen Squid Roll menu installer required');
 assert.equal(hash(frozenSquidroll),SQUIDROLL_MENU_INSTALLER_SHA256,'Frozen Squid Roll menu installer epoch');
 assert.equal(source,frozenSquidroll,'Complete Squid Roll menu installer bytes');
}
export function projectThrowPredictionMenuInstaller(source,frozenSquidroll){
 assertSquidrollInstaller(source,frozenSquidroll);
 for(const [before,after] of throwPredictionChanges)source=once(source,before,after);
 assert.equal(hash(source),THROW_PREDICTION_MENU_INSTALLER_SHA256,'Reviewed throw prediction menu installer epoch');return source;
}
export function restoreThrowPredictionMenuInstaller(source,frozenSquidroll){
 assert.equal(hash(source),THROW_PREDICTION_MENU_INSTALLER_SHA256,'Reviewed throw prediction menu installer epoch');
 for(const [before,after] of [...throwPredictionChanges].reverse())source=once(source,after,before);
 assertSquidrollInstaller(source,frozenSquidroll);return source;
}
export function verifyMenuInstallerSourceIdentity(source,manifestDigest,historicalDigest,frozen,iconInputs={},frozenIcon,frozenSquidroll){
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
  let squidrollSource=source;
  if(observed===THROW_PREDICTION_MENU_INSTALLER_SHA256){
   squidrollSource=restoreThrowPredictionMenuInstaller(source,frozenSquidroll);
   epoch='catalogue-kit-icons-squidroll-effects-and-throw-prediction';
  }else{
   assert.equal(observed,SQUIDROLL_MENU_INSTALLER_SHA256,'Reviewed Squid Roll menu installer epoch');
   epoch='catalogue-kit-icons-and-squidroll-effects';
  }
  const iconInstaller=restoreSquidrollMenuInstaller(squidrollSource,frozenIcon);
  restoreReviewedMenuInstaller(iconInstaller,frozen);
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
 const effectOwners=[];
 if(observed===SQUIDROLL_MENU_INSTALLER_SHA256||observed===THROW_PREDICTION_MENU_INSTALLER_SHA256)effectOwners.push(['Squid Roll effect',SQUIDROLL_MENU_INPUT_SHA256]);
 if(observed===THROW_PREDICTION_MENU_INSTALLER_SHA256)effectOwners.push(['throw prediction',THROW_PREDICTION_MENU_INPUT_SHA256]);
 for(const [label,inputs] of effectOwners)for(const [key,expected] of Object.entries(inputs)){
  const input=iconInputs[key];
  assert.ok(input&&typeof input.source==='string','Required '+label+' source: '+key);
  const actual=hash(input.source);
  if(key==='patch/runtime/throw-prediction.mjs'&&actual!==expected) {
   assert.equal(hash(restoreQueueThrowPredictionSource(input.source)),expected,'Reviewed throw prediction source predecessor');
  } else assert.equal(actual,expected,'Reviewed '+label+' source: '+key);
  assert.equal(input.manifestDigest,actual,'Emitted '+label+' input matches actual repository source: '+key);
  effectHashes[key]=actual;
 }
 return {epoch,sourceSha256:observed,historicalSha256:HISTORICAL_MENU_INSTALLER_SHA256,iconInputs:iconHashes,effectInputs:effectHashes};
}
