import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

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
 'patch/runtime/squidroll-effects.mjs':'e1413dade8d551faa29f0c3b48350981b88771464d2ba824882cf172dcbeb337',
});
// Complete static import closure of the newly installed preview owner. These
// identities bind its readiness input as well as its own presentation source;
// the unchanged historical installer pins do not admit arbitrary dependencies.
export const THROW_PREDICTION_MENU_INPUT_SHA256=Object.freeze({
 'patch/runtime/throw-prediction.mjs':'2c81656cd7dac29a9eb3ceb2c4e9c4ed81d96249d09705ba9029ebd0e27db769',
 'patch/runtime/sub-ready.mjs':'90b2f0d183a00cd667d32a3bb0125c795baf0b6919e0e7e7c33ab0f000e5de55',
 'patch/runtime/weapon-gates.mjs':'e40959671ba7d8f3a2d205e2b7a0986c1d13a89894cc51fbe7e91e690c713a85',
 'patch/runtime/sub-release-forecast.mjs':'bb02684890ad2033df6a7d4e24b2e2249586cba7cc7c651c452eab6af645faad',
});

// The current preview owner adds a recyclable numeric polyline workspace and
// an immutable legacy-arc compatibility delegate. Verify each exact successor
// and reconstruct the *entire* previously sealed source, not just anchor text.
// Neither the installer identity nor any older hash is changed.
export const PREVIOUS_THROW_PREDICTION_SOURCE_SHA256='5906dd38cdc58cc3cba60a1f46267f42d022b4d7a14a0cefc4f01f2035f9378e';
const reviewedThrowSourceInverses=Object.freeze([
 ["  // Keep the exact pre-forecast native preview as a stable compatibility\n  // owner. Legacy 30Hz/cache/contact oracles exercise this fallback, while\n  // the public updateArc continues to use the shared current forecast.\n  const preservedNativeArc=Projectiles.prototype[Symbol.for('inkwave.s3.arc-preview-performance.wrapper.v1')] || nativeArc;\n  Object.defineProperty(Projectiles.prototype,Symbol.for('inkwave.s3.throw-prediction.native-arc.v1'),\n    { value:preservedNativeArc, configurable:false, writable:false });\n",''],
 ["// Spend the fixed vertex budget on bends, bounces and the arc apex. Uniform\n// time samples can omit a wall contact and draw a shortcut through the wall.\nconst polylineWorkspaces = new WeakMap();\nfunction newPolylineWorkspace() { return { indices: [], segments: [], records: [], used: 0 }; }\nfunction addPolylineSegment(points, work, first, last) {\n    if (last - first < 2) return;\n    const a = points[first], b = points[last], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;\n    const length2 = dx * dx + dy * dy + dz * dz;\n    let error = -1, at = Math.floor((first + last) / 2);\n    for (let i = first + 1; i < last; i++) {\n      const p = points[i], x = p.x - a.x, y = p.y - a.y, z = p.z - a.z;\n      const t = length2 > 1e-20 ? Math.max(0, Math.min(1, (x * dx + y * dy + z * dz) / length2)) : 0;\n      const ex = x - t * dx, ey = y - t * dy, ez = z - t * dz, e = ex * ex + ey * ey + ez * ez;\n      if (e > error + 1e-12) { error = e; at = i; }\n    }\n    if (error < 1e-12) at = Math.floor((first + last) / 2);\n    const record = work.records[work.used] ||= {};\n    work.used++; record.first=first; record.last=last; record.at=at; record.error=error;\n    work.segments.push(record);\n}\nfunction polylineIndices(points, budget, work = newPolylineWorkspace()) {\n  const indices=work.indices, segments=work.segments;\n  indices.length=segments.length=0; work.used=0;\n  if (points.length <= budget) {\n    indices.length=points.length;\n    for(let i=0;i<points.length;i++) { if(i in points)indices[i]=i; else delete indices[i]; }\n    return indices;\n  }\n  if (budget < 2) { indices.push(points.length - 1); return indices; }\n  indices.push(0, points.length - 1);\n  addPolylineSegment(points, work, 0, points.length - 1);\n  while (indices.length < budget && segments.length) {\n    let best = 0;\n    for (let i = 1; i < segments.length; i++) {\n      const s = segments[i], b = segments[best];\n      if (s.error > b.error + 1e-12 || Math.abs(s.error - b.error) <= 1e-12 && s.last - s.first > b.last - b.first) best = i;\n    }\n    const s = segments[best];\n    for(let i=best+1;i<segments.length;i++)segments[i-1]=segments[i];\n    segments.length--; indices.push(s.at);\n    addPolylineSegment(points, work, s.first, s.at); addPolylineSegment(points, work, s.at, s.last);\n  }\n  return indices.sort((a, b) => a - b);\n}\n\nfunction writePolyline(geometry, points, endpoint) {\n  const position = geometry.attributes.position, distance = geometry.attributes.lineDistance;\n  let leases=polylineWorkspaces.get(geometry);\n  if(!leases){leases={depth:0,frames:[]};polylineWorkspaces.set(geometry,leases);}\n  const depth=leases.depth++, work=leases.frames[depth] ||= newPolylineWorkspace();\n  try {\n  const indices = polylineIndices(points, Math.min(position.count, distance.count), work);\n  let length = 0;\n  for (let i = 0; i < indices.length; i++) {\n    const p = i === indices.length - 1 && endpoint ? endpoint : points[indices[i]];\n    position.setXYZ(i, p.x, p.y, p.z);\n    if (i) {\n      const j = i * position.itemSize, a = position.array;\n      length += Math.hypot(a[j] - a[j - position.itemSize], a[j + 1] - a[j - position.itemSize + 1], a[j + 2] - a[j - position.itemSize + 2]);\n    }\n    distance.setX(i, length);\n  }\n  position.clearUpdateRanges(); position.addUpdateRange(0, indices.length * position.itemSize); position.needsUpdate = true;\n  distance.clearUpdateRanges(); distance.addUpdateRange(0, indices.length); distance.needsUpdate = true;\n  geometry.setDrawRange(0, indices.length);\n  return indices.length;\n  } finally {\n    // Numeric segment/index records cannot retain prediction actors or vectors.\n    work.indices.length=work.segments.length=0; leases.depth--;\n  }\n}\n\n","// Spend the fixed vertex budget on bends, bounces and the arc apex. Uniform\n// time samples can omit a wall contact and draw a shortcut through the wall.\nfunction polylineIndices(points, budget) {\n  if (points.length <= budget) return points.map((_, i) => i);\n  if (budget < 2) return [points.length - 1];\n  const indices = [0, points.length - 1], segments = [];\n  function addSegment(first, last) {\n    if (last - first < 2) return;\n    const a = points[first], b = points[last], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;\n    const length2 = dx * dx + dy * dy + dz * dz;\n    let error = -1, at = Math.floor((first + last) / 2);\n    for (let i = first + 1; i < last; i++) {\n      const p = points[i], x = p.x - a.x, y = p.y - a.y, z = p.z - a.z;\n      const t = length2 > 1e-20 ? Math.max(0, Math.min(1, (x * dx + y * dy + z * dz) / length2)) : 0;\n      const ex = x - t * dx, ey = y - t * dy, ez = z - t * dz, e = ex * ex + ey * ey + ez * ez;\n      if (e > error + 1e-12) { error = e; at = i; }\n    }\n    if (error < 1e-12) at = Math.floor((first + last) / 2);\n    segments.push({ first, last, at, error });\n  }\n  addSegment(0, points.length - 1);\n  while (indices.length < budget && segments.length) {\n    let best = 0;\n    for (let i = 1; i < segments.length; i++) {\n      const s = segments[i], b = segments[best];\n      if (s.error > b.error + 1e-12 || Math.abs(s.error - b.error) <= 1e-12 && s.last - s.first > b.last - b.first) best = i;\n    }\n    const s = segments.splice(best, 1)[0]; indices.push(s.at);\n    addSegment(s.first, s.at); addSegment(s.at, s.last);\n  }\n  return indices.sort((a, b) => a - b);\n}\n\nfunction writePolyline(geometry, points, endpoint) {\n  const position = geometry.attributes.position, distance = geometry.attributes.lineDistance;\n  const indices = polylineIndices(points, Math.min(position.count, distance.count));\n  let length = 0;\n  for (let i = 0; i < indices.length; i++) {\n    const p = i === indices.length - 1 && endpoint ? endpoint : points[indices[i]];\n    position.setXYZ(i, p.x, p.y, p.z);\n    if (i) {\n      const j = i * position.itemSize, a = position.array;\n      length += Math.hypot(a[j] - a[j - position.itemSize], a[j + 1] - a[j - position.itemSize + 1], a[j + 2] - a[j - position.itemSize + 2]);\n    }\n    distance.setX(i, length);\n  }\n  position.clearUpdateRanges(); position.addUpdateRange(0, indices.length * position.itemSize); position.needsUpdate = true;\n  distance.clearUpdateRanges(); distance.addUpdateRange(0, indices.length); distance.needsUpdate = true;\n  geometry.setDrawRange(0, indices.length);\n  return indices.length;\n}\n\n"],
]);
export function restoreReviewedThrowPredictionInput(source){
 for(const [after,before] of reviewedThrowSourceInverses)source=once(source,after,before);
 assert.equal(hash(source),PREVIOUS_THROW_PREDICTION_SOURCE_SHA256,
   'complete sealed pre-workspace throw predictor source epoch');
 return source;
}

const SQUIDROLL_OPTIMIZED_PREDECESSOR_SHA256='bb5f11890f3eaef9780319aeebed5b60d5a8aa86c966ae0eb6184599794b4453';
const squidrollOptimizationDelta=Object.freeze([
  ["        const nx=vx/speed,nz=vz/speed;\n", ""],
  ["s.velocity.set(Math.cos(angle) * 2 - nx, .8 + phase * 1.8, Math.sin(angle) * 2 - nz);",
   "s.velocity.set(Math.cos(angle) * 2 - vx / speed, .8 + phase * 1.8, Math.sin(angle) * 2 - vz / speed);"],
  ["        const arcCount=this.glows?Math.min(18,Math.max(0,this.glows.cap-this.glows.n)):0;\n        for (let i = 0; i < arcCount; i++) {",
   "        for (let i = 0; i < 18; i++) {"],
  ["s.point.set(s.pos.x + nx * along, s.pos.y + Math.sin(angle) * .44, s.pos.z + nz * along);",
   "s.point.set(s.pos.x + vx / speed * along, s.pos.y + Math.sin(angle) * .44, s.pos.z + vz / speed * along);"],
  ["s.point.set(s.pos.x + Math.cos(angle) * .48, s.pos.y + Math.sin(angle) * .4, s.pos.z - nz * .25);",
   "s.point.set(s.pos.x + Math.cos(angle) * .48, s.pos.y + Math.sin(angle) * .4, s.pos.z - vz / speed * .25);"],
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
// 03a34916 adds one import and the final preview-owner installation. The full
// Squid Roll predecessor is frozen separately; both directions require exact
// bytes, including ordering after all weapon-specific prediction owners.
const throwPredictionChanges=[
 ["import { installAllSpecials, replaySpecial } from './all-specials.mjs';\n", "import { installAllSpecials, replaySpecial } from './all-specials.mjs';\nimport { installThrowPrediction } from './throw-prediction.mjs';\n"],
 ["  installMainWeaponCatalogRuntime(api, profile);\n", "  installMainWeaponCatalogRuntime(api, profile);\n  // Every weapon-specific flight/activation owner is now installed. Render\n  // its exact prediction instead of falling back to the Splat Bomb equation.\n  installThrowPrediction(api);\n"],
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
  return {epoch:'historical-installer',sourceSha256:observed,historicalSha256:observed,iconInputs:{},effectInputs:{},predictionInputs:{}};
 }
 let epoch;
 if(observed===ICON_MENU_INSTALLER_SHA256){
  restoreReviewedMenuInstaller(source,frozen);epoch='catalogue-kit-icons';
 }else{
  let squidrollInstaller=source;
  if(observed===THROW_PREDICTION_MENU_INSTALLER_SHA256){
   squidrollInstaller=restoreThrowPredictionMenuInstaller(source,frozenSquidroll);
   epoch='catalogue-kit-icons-squidroll-effects-and-throw-prediction';
  }else{
   assert.equal(observed,SQUIDROLL_MENU_INSTALLER_SHA256,'Reviewed Squid Roll menu installer epoch');
   epoch='catalogue-kit-icons-and-squidroll-effects';
  }
  const iconInstaller=restoreSquidrollMenuInstaller(squidrollInstaller,frozenIcon);
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
 if(observed===SQUIDROLL_MENU_INSTALLER_SHA256||observed===THROW_PREDICTION_MENU_INSTALLER_SHA256)for(const [key,expected] of Object.entries(SQUIDROLL_MENU_INPUT_SHA256)){
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
 const predictionHashes={};
 if(observed===THROW_PREDICTION_MENU_INSTALLER_SHA256)for(const [key,expected] of Object.entries(THROW_PREDICTION_MENU_INPUT_SHA256)){
  const input=iconInputs[key];
  assert.ok(input&&typeof input.source==='string','Required throw prediction source: '+key);
  const actual=hash(input.source);
  assert.equal(actual,expected,'Reviewed throw prediction source: '+key);
  if(key==='patch/runtime/throw-prediction.mjs')restoreReviewedThrowPredictionInput(input.source);
  assert.equal(input.manifestDigest,actual,'Emitted throw prediction input matches actual repository source: '+key);
  predictionHashes[key]=actual;
 }
 return {epoch,sourceSha256:observed,historicalSha256:HISTORICAL_MENU_INSTALLER_SHA256,iconInputs:iconHashes,effectInputs:effectHashes,predictionInputs:predictionHashes};
}
