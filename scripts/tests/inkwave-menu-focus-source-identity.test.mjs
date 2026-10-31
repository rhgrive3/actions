import {HISTORICAL_THROW_PREDICTION_SOURCE_SHA256,QUEUE_THROW_PREDICTION_SOURCE_SHA256,restoreQueueThrowPredictionSource} from '../lib/inkwave-throw-prediction-source-epoch-20261031.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CURRENT_MENU_LAYOUT_SHA256,HISTORICAL_MENU_LAYOUT_SHA256,HISTORICAL_MENU_INSTALLER_SHA256,ICON_MENU_INSTALLER_SHA256,SQUIDROLL_MENU_INSTALLER_SHA256,MENU_ICON_INPUT_SHA256,SQUIDROLL_MENU_INPUT_SHA256,projectReviewedMenuInstaller,restoreReviewedMenuInstaller,projectSquidrollMenuInstaller,restoreSquidrollMenuInstaller,verifyMenuInstallerSourceIdentity,restoreReviewedMenuLayout,verifyMenuLayoutSourceIdentity} from '../lib/inkwave-menu-focus-source-identity.mjs';
import {THROW_PREDICTION_MENU_INSTALLER_SHA256,THROW_PREDICTION_MENU_INPUT_SHA256,projectThrowPredictionMenuInstaller,restoreThrowPredictionMenuInstaller} from '../lib/inkwave-menu-focus-source-identity.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const before=fs.readFileSync(new URL('../../patches/splatoon3/tests/fixtures/menu-layout-cache-1915-before.mjs.txt',import.meta.url),'utf8');
const current=fs.readFileSync(new URL('../../patches/splatoon3/runtime/menu-layout.mjs',import.meta.url),'utf8');

test('reviewed menu owner restores the complete independently frozen source and binds both exact epochs',()=>{
 assert.equal(hash(before),HISTORICAL_MENU_LAYOUT_SHA256);
 assert.equal(hash(current),CURRENT_MENU_LAYOUT_SHA256);
 assert.equal(restoreReviewedMenuLayout(current),before);
 assert.equal(verifyMenuLayoutSourceIdentity(before,hash(before),hash(before)).epoch,'historical-stage-picker');
 assert.equal(verifyMenuLayoutSourceIdentity(current,hash(current),hash(before)).epoch,'a1381283-screen-owned-caches');
 const pins=JSON.parse(fs.readFileSync(new URL('../inkwave-menu-focus-pins.json',import.meta.url)));
 assert.equal(pins.inputs['patch/runtime/menu-layout.mjs'],hash(before),'original focus fixture pin is unchanged');
});

test('changed source, mismatched build input and relabelled historical identity remain rejected',()=>{
 assert.throws(()=>verifyMenuLayoutSourceIdentity(current,hash(before),hash(before)),/actual repository source bytes/);
 assert.throws(()=>verifyMenuLayoutSourceIdentity(current+'\n',hash(current+'\n'),hash(before)),/Reviewed current/);
 assert.throws(()=>verifyMenuLayoutSourceIdentity(current,hash(current),hash(current)),/Frozen menu focus/);
});

test('each reviewed menu owner site is exact once; drop, duplicate and semantic tamper cannot restore',()=>{
 const anchors=[
  "  const modeRow = scr.el.querySelector('.iw-modesel__row');",
  '      if (i < 0 || row?.isConnected === false || cards.some(card => card.parentNode !== row)) return onNav?.(dir);',
  "    for (const c of cards) { const hidden = key !== 'all' && c.dataset.cat !== key; if (c.hidden !== hidden) c.hidden = hidden; }",
 ];
 for(const anchor of anchors){
  assert.equal(current.split(anchor).length,2,'independently identified owner site');
  assert.throws(()=>restoreReviewedMenuLayout(current.replace(anchor,'')),/exactly one reviewed owner site/);
  assert.throws(()=>restoreReviewedMenuLayout(current.replace(anchor,anchor+'\n'+anchor)),/exactly one reviewed owner site|complete frozen source epoch/);
 }
 assert.throws(()=>restoreReviewedMenuLayout(current.replace('card.parentNode !== row','card.parentNode === row')),/exactly one reviewed owner site/);
});

const oldInstaller=fs.readFileSync(new URL('../fixtures/inkwave-menu-installer-before-icons-1915.mjs.txt',import.meta.url),'utf8');
const iconInstaller=fs.readFileSync(new URL('../fixtures/inkwave-menu-installer-before-squidroll-20261029.mjs.txt',import.meta.url),'utf8');
const squidrollInstaller=fs.readFileSync(new URL('../fixtures/inkwave-menu-installer-before-throw-prediction-20261031.mjs.txt',import.meta.url),'utf8');
const currentInstaller=fs.readFileSync(new URL('../../patches/splatoon3/runtime/install.mjs',import.meta.url),'utf8');
const iconInputs=Object.fromEntries(Object.entries(MENU_ICON_INPUT_SHA256).map(([key,digest])=>{
 const file=key.replace(/^patch\//,'../../patches/splatoon3/');
 return [key,{source:fs.readFileSync(new URL(file,import.meta.url),'utf8'),manifestDigest:digest}];
}));
const squidrollInputs=Object.fromEntries(Object.entries(SQUIDROLL_MENU_INPUT_SHA256).map(([key,digest])=>{
 const file=key.replace(/^patch\//,'../../patches/splatoon3/');
 return [key,{source:fs.readFileSync(new URL(file,import.meta.url),'utf8'),manifestDigest:digest}];
}));
const predictionInputs=Object.fromEntries(Object.entries(THROW_PREDICTION_MENU_INPUT_SHA256).map(([key,digest])=>{
 const file=key.replace(/^patch\//,'../../patches/splatoon3/');
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 assert.equal(digest,HISTORICAL_THROW_PREDICTION_SOURCE_SHA256,'historical source pin never relabelled');
 return [key,{source,manifestDigest:hash(source)}];
}));
test('installer preserves the original full pin and independently frozen two-hunk inverse',()=>{
 const pins=JSON.parse(fs.readFileSync(new URL('../inkwave-menu-focus-pins.json',import.meta.url)));
 assert.equal(pins.inputs['patch/runtime/install.mjs'],HISTORICAL_MENU_INSTALLER_SHA256);
 assert.equal(hash(oldInstaller),HISTORICAL_MENU_INSTALLER_SHA256);
 assert.equal(hash(iconInstaller),ICON_MENU_INSTALLER_SHA256);
 assert.equal(projectReviewedMenuInstaller(oldInstaller,oldInstaller),iconInstaller);
 assert.equal(restoreReviewedMenuInstaller(iconInstaller,oldInstaller),oldInstaller);
 assert.equal(verifyMenuInstallerSourceIdentity(oldInstaller,hash(oldInstaller),pins.inputs['patch/runtime/install.mjs'],oldInstaller).epoch,'historical-installer');
 const current=verifyMenuInstallerSourceIdentity(iconInstaller,hash(iconInstaller),pins.inputs['patch/runtime/install.mjs'],oldInstaller,iconInputs);
 assert.equal(current.epoch,'catalogue-kit-icons');assert.deepEqual(current.iconInputs,MENU_ICON_INPUT_SHA256);
});
test('installer source, full frozen predecessor and both exact owner sites fail closed on edits',()=>{
 const changes=["import { installCatalogueKitIcons } from './ui-kit-icons.mjs';\n",'  installCatalogueKitIcons(api);\n'];
 for(const anchor of changes){
  assert.equal(iconInstaller.split(anchor).length,2);
  for(const changed of [iconInstaller.replace(anchor,''),iconInstaller.replace(anchor,anchor+anchor),iconInstaller.replace(anchor,anchor.replace('installCatalogueKitIcons','installCatalogueKitIconsTampered'))])
   assert.throws(()=>restoreReviewedMenuInstaller(changed,oldInstaller),/Reviewed icon menu installer epoch/);
 }
 assert.throws(()=>projectReviewedMenuInstaller(oldInstaller+'\n',oldInstaller),/Complete historical/);
 assert.throws(()=>restoreReviewedMenuInstaller(iconInstaller,oldInstaller+'\n'),/Frozen menu installer epoch/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(iconInstaller,hash(oldInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,iconInputs),/actual repository source bytes/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(iconInstaller,hash(iconInstaller),ICON_MENU_INSTALLER_SHA256,oldInstaller,iconInputs),/Original menu installer pin/);
});
test('new installer requires all exact source and manifest icon hashes; old installer does not',()=>{
 for(const [key,input] of Object.entries(iconInputs)){
  const missing={...iconInputs};delete missing[key];
  assert.throws(()=>verifyMenuInstallerSourceIdentity(iconInstaller,hash(iconInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,missing),/Required menu icon source/);
  assert.throws(()=>verifyMenuInstallerSourceIdentity(iconInstaller,hash(iconInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,[key]:{...input,source:input.source+'\n'}}),/Reviewed menu icon source/);
  assert.throws(()=>verifyMenuInstallerSourceIdentity(iconInstaller,hash(iconInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,[key]:{...input,manifestDigest:'0'.repeat(64)}}),/Emitted menu icon input/);
  assert.throws(()=>verifyMenuInstallerSourceIdentity(iconInstaller,hash(iconInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,[key]:{...input,manifestDigest:undefined}}),/Emitted menu icon input/);
 }
 assert.deepEqual(verifyMenuInstallerSourceIdentity(oldInstaller,hash(oldInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller).iconInputs,{});
});
test('Squid Roll installer is a separately frozen two-hunk successor of the exact icon epoch',()=>{
 assert.equal(hash(squidrollInstaller),SQUIDROLL_MENU_INSTALLER_SHA256);
 assert.equal(projectSquidrollMenuInstaller(iconInstaller,iconInstaller),squidrollInstaller);
 assert.equal(restoreSquidrollMenuInstaller(squidrollInstaller,iconInstaller),iconInstaller);
 assert.equal(restoreReviewedMenuInstaller(restoreSquidrollMenuInstaller(squidrollInstaller,iconInstaller),oldInstaller),oldInstaller);
 const verified=verifyMenuInstallerSourceIdentity(squidrollInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,...squidrollInputs},iconInstaller);
 assert.equal(verified.epoch,'catalogue-kit-icons-and-squidroll-effects');
 assert.deepEqual(verified.iconInputs,MENU_ICON_INPUT_SHA256);assert.deepEqual(verified.effectInputs,SQUIDROLL_MENU_INPUT_SHA256);
});
test('Squid Roll owner sites, frozen predecessor and manifest identity reject tampering',()=>{
 for(const anchor of ["import { installSquidrollEffects } from './squidroll-effects.mjs';\n",'  installSquidrollEffects(api, profile);\n']){
  assert.equal(squidrollInstaller.split(anchor).length,2);
  for(const changed of [squidrollInstaller.replace(anchor,''),squidrollInstaller.replace(anchor,anchor+anchor),squidrollInstaller.replace(anchor,anchor.replace('installSquidrollEffects','installSquidrollEffectsTampered'))])
   assert.throws(()=>restoreSquidrollMenuInstaller(changed,iconInstaller),/Reviewed Squid Roll menu installer epoch/);
 }
 assert.throws(()=>projectSquidrollMenuInstaller(iconInstaller+'\n',iconInstaller),/Complete icon menu installer bytes/);
 assert.throws(()=>restoreSquidrollMenuInstaller(squidrollInstaller,iconInstaller+'\n'),/Frozen icon menu installer epoch/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(squidrollInstaller,hash(iconInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,...squidrollInputs},iconInstaller),/actual repository source bytes/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(squidrollInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,...squidrollInputs}),/Frozen icon menu installer required/);
});
test('Squid Roll epoch requires every icon and exact effect source and manifest identity',()=>{
 const all={...iconInputs,...squidrollInputs};
 for(const [key,input] of Object.entries(all)){
  const missing={...all};delete missing[key];
  assert.throws(()=>verifyMenuInstallerSourceIdentity(squidrollInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,missing,iconInstaller),/Required (menu icon|Squid Roll effect) source/);
  assert.throws(()=>verifyMenuInstallerSourceIdentity(squidrollInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...all,[key]:{...input,source:input.source+'\n'}},iconInstaller),/Reviewed (menu icon|Squid Roll effect) source/);
  for(const manifestDigest of [undefined,'0'.repeat(64)])assert.throws(()=>verifyMenuInstallerSourceIdentity(squidrollInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...all,[key]:{...input,manifestDigest}},iconInstaller),/Emitted (menu icon|Squid Roll effect) input/);
 }
});

test('throw prediction is a separately frozen two-hunk successor of the complete Squid Roll epoch',()=>{
 assert.equal(hash(squidrollInstaller),SQUIDROLL_MENU_INSTALLER_SHA256);
 assert.equal(hash(currentInstaller),THROW_PREDICTION_MENU_INSTALLER_SHA256);
 assert.equal(projectThrowPredictionMenuInstaller(squidrollInstaller,squidrollInstaller),currentInstaller);
 assert.equal(restoreThrowPredictionMenuInstaller(currentInstaller,squidrollInstaller),squidrollInstaller);
 assert.equal(restoreReviewedMenuInstaller(restoreSquidrollMenuInstaller(restoreThrowPredictionMenuInstaller(currentInstaller,squidrollInstaller),iconInstaller),oldInstaller),oldInstaller);
 const verified=verifyMenuInstallerSourceIdentity(currentInstaller,hash(currentInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,...squidrollInputs,...predictionInputs},iconInstaller,squidrollInstaller);
 assert.equal(verified.epoch,'catalogue-kit-icons-squidroll-effects-and-throw-prediction');
 assert.deepEqual(verified.iconInputs,MENU_ICON_INPUT_SHA256);
 assert.deepEqual(verified.effectInputs,{...SQUIDROLL_MENU_INPUT_SHA256,'patch/runtime/throw-prediction.mjs':QUEUE_THROW_PREDICTION_SOURCE_SHA256});
});

test('throw prediction owner sites, complete predecessor and manifest identity reject tampering',()=>{
 for(const anchor of ["import { installThrowPrediction } from './throw-prediction.mjs';\n",'  installThrowPrediction(api);\n']){
  assert.equal(currentInstaller.split(anchor).length,2);
  for(const changed of [currentInstaller.replace(anchor,''),currentInstaller.replace(anchor,anchor+anchor),currentInstaller.replace(anchor,anchor.replace('installThrowPrediction','installThrowPredictionTampered'))])
   assert.throws(()=>restoreThrowPredictionMenuInstaller(changed,squidrollInstaller),/Reviewed throw prediction menu installer epoch/);
 }
 assert.throws(()=>projectThrowPredictionMenuInstaller(squidrollInstaller+'\n',squidrollInstaller),/Complete Squid Roll menu installer bytes/);
 assert.throws(()=>restoreThrowPredictionMenuInstaller(currentInstaller,squidrollInstaller+'\n'),/Frozen Squid Roll menu installer epoch/);
 const all={...iconInputs,...squidrollInputs,...predictionInputs};
 assert.throws(()=>verifyMenuInstallerSourceIdentity(currentInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,all,iconInstaller,squidrollInstaller),/actual repository source bytes/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(currentInstaller,hash(currentInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,all,iconInstaller),/Frozen Squid Roll menu installer required/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(currentInstaller,hash(currentInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,all,undefined,squidrollInstaller),/Frozen icon menu installer required/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(currentInstaller+'\n',hash(currentInstaller+'\n'),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,all,iconInstaller,squidrollInstaller),/Reviewed Squid Roll menu installer epoch/);
});

test('throw prediction epoch requires every exact icon, effect and prediction source and manifest input',()=>{
 const all={...iconInputs,...squidrollInputs,...predictionInputs};
 for(const [key,input] of Object.entries(all)){
  const missing={...all};delete missing[key];
  assert.throws(()=>verifyMenuInstallerSourceIdentity(currentInstaller,hash(currentInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,missing,iconInstaller,squidrollInstaller),/Required (menu icon|Squid Roll effect|throw prediction) source/);
  assert.throws(()=>verifyMenuInstallerSourceIdentity(currentInstaller,hash(currentInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...all,[key]:{...input,source:input.source+'\n'}},iconInstaller,squidrollInstaller),/Reviewed (menu icon|Squid Roll effect|throw prediction) source/);
  for(const manifestDigest of [undefined,'0'.repeat(64)])assert.throws(()=>verifyMenuInstallerSourceIdentity(currentInstaller,hash(currentInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...all,[key]:{...input,manifestDigest}},iconInstaller,squidrollInstaller),/Emitted (menu icon|Squid Roll effect|throw prediction) input/);
 }
});

test('polyline workspace successor reverses to the complete original prediction source and rejects every changed owner',()=>{
 const source=predictionInputs['patch/runtime/throw-prediction.mjs'].source;
 assert.equal(hash(source),QUEUE_THROW_PREDICTION_SOURCE_SHA256);
 const predecessor=restoreQueueThrowPredictionSource(source);
 assert.equal(hash(predecessor),THROW_PREDICTION_MENU_INPUT_SHA256['patch/runtime/throw-prediction.mjs']);
 assert.notEqual(source,predecessor);
 for(const anchor of ['const polylineWorkspaces = new WeakMap();','work.indices.length=work.segments.length=0; leases.depth--;','addPolylineSegment(points, work, s.first, s.at); addPolylineSegment(points, work, s.at, s.last);']){
  assert.equal(source.split(anchor).length,2);
  for(const modified of [source.replace(anchor,''),source.replace(anchor,anchor+anchor),source+'\n'])assert.throws(()=>restoreQueueThrowPredictionSource(modified),/Reviewed throw prediction source/);
 }
});
