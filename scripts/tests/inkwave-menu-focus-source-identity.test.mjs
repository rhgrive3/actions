import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as identity from '../lib/inkwave-menu-focus-source-identity.mjs';
import {THROW_PREDICTION_MENU_INSTALLER_SHA256,THROW_PREDICTION_MENU_INPUT_SHA256,projectThrowPredictionMenuInstaller,restoreThrowPredictionMenuInstaller} from '../lib/inkwave-menu-focus-source-identity.mjs';
import {CURRENT_MENU_LAYOUT_SHA256,HISTORICAL_MENU_LAYOUT_SHA256,HISTORICAL_MENU_INSTALLER_SHA256,ICON_MENU_INSTALLER_SHA256,SQUIDROLL_MENU_INSTALLER_SHA256,MENU_ICON_INPUT_SHA256,SQUIDROLL_MENU_INPUT_SHA256,projectReviewedMenuInstaller,restoreReviewedMenuInstaller,projectSquidrollMenuInstaller,restoreSquidrollMenuInstaller,verifyMenuInstallerSourceIdentity,restoreReviewedMenuLayout,verifyMenuLayoutSourceIdentity} from '../lib/inkwave-menu-focus-source-identity.mjs';
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
const throwPredictionInstaller=fs.readFileSync(new URL('../../patches/splatoon3/runtime/install.mjs',import.meta.url),'utf8');
const iconInputs=Object.fromEntries(Object.entries(MENU_ICON_INPUT_SHA256).map(([key,digest])=>{
 const file=key.replace(/^patch\//,'../../patches/splatoon3/');
 return [key,{source:fs.readFileSync(new URL(file,import.meta.url),'utf8'),manifestDigest:digest}];
}));
const squidrollInputs=Object.fromEntries(Object.entries(SQUIDROLL_MENU_INPUT_SHA256).map(([key,digest])=>{
 const file=key.replace(/^patch\//,'../../patches/splatoon3/');
 return [key,{source:fs.readFileSync(new URL(file,import.meta.url),'utf8'),manifestDigest:digest}];
}));
const throwPredictionInputs=Object.fromEntries(Object.entries(THROW_PREDICTION_MENU_INPUT_SHA256).map(([key,digest])=>{
 const file=key.replace(/^patch\//,'../../patches/splatoon3/');
 return [key,{source:fs.readFileSync(new URL(file,import.meta.url),'utf8'),manifestDigest:digest}];
}));
test('current throw-prediction workspace and preserved legacy arc reverse to the full historical source',()=>{
 const source=throwPredictionInputs['patch/runtime/throw-prediction.mjs'].source;
 assert.equal(hash(source),THROW_PREDICTION_MENU_INPUT_SHA256['patch/runtime/throw-prediction.mjs']);
 assert.equal(hash(identity.restoreReviewedThrowPredictionInput(source)),identity.PREVIOUS_THROW_PREDICTION_SOURCE_SHA256);
 for(const mutated of [source+'\\n',source.replace('polylineWorkspaces','mutatedWorkspaces'),
   source.replace('inkwave.s3.throw-prediction.native-arc.v1','inkwave.s3.throw-prediction.spoofed-arc.v1')])
  assert.throws(()=>identity.restoreReviewedThrowPredictionInput(mutated),/complete sealed|exactly one reviewed owner site/);
});
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

const allInputs={...iconInputs,...squidrollInputs,...throwPredictionInputs};
const verifyThrow=(source=throwPredictionInstaller,inputs=allInputs,frozenSquidroll=squidrollInstaller)=>verifyMenuInstallerSourceIdentity(source,hash(source),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,inputs,iconInstaller,frozenSquidroll);
test('throw prediction is an exact reversible successor without relabelling any frozen installer',()=>{
 assert.equal(hash(throwPredictionInstaller),THROW_PREDICTION_MENU_INSTALLER_SHA256);
 assert.equal(hash(squidrollInstaller),SQUIDROLL_MENU_INSTALLER_SHA256);
 assert.equal(projectThrowPredictionMenuInstaller(squidrollInstaller,squidrollInstaller),throwPredictionInstaller);
 assert.equal(restoreThrowPredictionMenuInstaller(throwPredictionInstaller,squidrollInstaller),squidrollInstaller);
 assert.equal(restoreReviewedMenuInstaller(restoreSquidrollMenuInstaller(restoreThrowPredictionMenuInstaller(throwPredictionInstaller,squidrollInstaller),iconInstaller),oldInstaller),oldInstaller);
 const verified=verifyThrow();
 assert.equal(verified.epoch,'catalogue-kit-icons-squidroll-effects-and-throw-prediction');
 assert.deepEqual(verified.iconInputs,MENU_ICON_INPUT_SHA256);
 assert.deepEqual(verified.effectInputs,SQUIDROLL_MENU_INPUT_SHA256);
 assert.deepEqual(verified.predictionInputs,THROW_PREDICTION_MENU_INPUT_SHA256);
 assert.deepEqual(verifyMenuInstallerSourceIdentity(squidrollInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,{...iconInputs,...squidrollInputs},iconInstaller).predictionInputs,{});
});
test('throw prediction import, call order, complete predecessor and manifest cannot be weakened',()=>{
 for(const anchor of ["import { installThrowPrediction } from './throw-prediction.mjs';\n",'  installThrowPrediction(api);\n']){
  assert.equal(throwPredictionInstaller.split(anchor).length,2);
  for(const changed of [throwPredictionInstaller.replace(anchor,''),throwPredictionInstaller.replace(anchor,anchor+anchor),throwPredictionInstaller.replace(anchor,anchor.replace('installThrowPrediction','installThrowPredictionTampered'))])
   assert.throws(()=>restoreThrowPredictionMenuInstaller(changed,squidrollInstaller),/Reviewed throw prediction menu installer epoch/);
 }
 const moved=throwPredictionInstaller.replace('  installThrowPrediction(api);\n','').replace('  installMainWeaponCatalogRuntime(api, profile);\n','  installThrowPrediction(api);\n  installMainWeaponCatalogRuntime(api, profile);\n');
 assert.throws(()=>restoreThrowPredictionMenuInstaller(moved,squidrollInstaller),/Reviewed throw prediction menu installer epoch/);
 assert.throws(()=>projectThrowPredictionMenuInstaller(squidrollInstaller+'\n',squidrollInstaller),/Complete Squid Roll menu installer bytes/);
 assert.throws(()=>restoreThrowPredictionMenuInstaller(throwPredictionInstaller,squidrollInstaller+'\n'),/Frozen Squid Roll menu installer epoch/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(throwPredictionInstaller,hash(throwPredictionInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,allInputs,iconInstaller),/Frozen Squid Roll menu installer required/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(throwPredictionInstaller,hash(squidrollInstaller),HISTORICAL_MENU_INSTALLER_SHA256,oldInstaller,allInputs,iconInstaller,squidrollInstaller),/actual repository source bytes/);
 assert.throws(()=>verifyMenuInstallerSourceIdentity(throwPredictionInstaller,hash(throwPredictionInstaller),THROW_PREDICTION_MENU_INSTALLER_SHA256,oldInstaller,allInputs,iconInstaller,squidrollInstaller),/Original menu installer pin/);
 assert.throws(()=>verifyThrow(throwPredictionInstaller+'\n'),/Reviewed Squid Roll menu installer epoch/);
});
test('new epoch requires every original and new dependency with exact source and manifest hashes',()=>{
 for(const [key,input] of Object.entries(allInputs)){
  const missing={...allInputs};delete missing[key];
  assert.throws(()=>verifyThrow(throwPredictionInstaller,missing),/Required (menu icon|Squid Roll effect|throw prediction) source/);
  assert.throws(()=>verifyThrow(throwPredictionInstaller,{...allInputs,[key]:{...input,source:input.source+'\n'}}),/Reviewed (menu icon|Squid Roll effect|throw prediction) source/);
  for(const manifestDigest of [undefined,'0'.repeat(64)])assert.throws(()=>verifyThrow(throwPredictionInstaller,{...allInputs,[key]:{...input,manifestDigest}}),/Emitted (menu icon|Squid Roll effect|throw prediction) input/);
 }
});
test('throw preview dependency pins cover the complete source import closure',()=>{
 const queue=['patch/runtime/throw-prediction.mjs'],visited=new Set();
 while(queue.length){
  const key=queue.pop();if(visited.has(key))continue;visited.add(key);
  const input=throwPredictionInputs[key];assert(input,'Every imported preview dependency has an independent pin: '+key);
  for(const [,specifier] of input.source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)){
   assert(specifier.startsWith('./'),'Preview imports remain local reviewed dependencies');
   queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(key),specifier)));
  }
 }
 assert.deepEqual([...visited].sort(),Object.keys(THROW_PREDICTION_MENU_INPUT_SHA256).sort());
});
test('actual browser-checker preflight loads the new predecessor and selects every emitted dependency',()=>{
 const repo=fileURLToPath(new URL('../../',import.meta.url)),scriptURL=new URL('../check-inkwave-menu-focus.mjs',import.meta.url).href;
 const checker=fs.readFileSync(new URL(scriptURL),'utf8');
 const start=checker.indexOf('const menuLayoutEpoch='),end=checker.indexOf('const emitted =',start);
 assert(start>0&&end>start,'production checker owns the tested identity and artifact selection');
 const preflight=checker.slice(start,end).replaceAll('import.meta.url','scriptURL')+'\n({menuInstallerEpoch,files});';
 const pins=JSON.parse(fs.readFileSync(new URL('../inkwave-menu-focus-pins.json',import.meta.url)));
 const files={...pins.inputs,...MENU_ICON_INPUT_SHA256,...SQUIDROLL_MENU_INPUT_SHA256,...THROW_PREDICTION_MENU_INPUT_SHA256,
  'patch/runtime/menu-layout.mjs':CURRENT_MENU_LAYOUT_SHA256,'patch/runtime/install.mjs':THROW_PREDICTION_MENU_INSTALLER_SHA256};
 const run=files=>vm.runInNewContext(preflight,{...identity,fs,path,hash,pins,manifest:{files},repo,scriptURL,URL,assert});
 const receipt=run(files);
 assert.equal(receipt.menuInstallerEpoch.epoch,'catalogue-kit-icons-squidroll-effects-and-throw-prediction');
 for(const key of Object.keys(allInputs))assert(receipt.files.includes(key.replace(/^patch\//,'patches/splatoon3/')),'real emitted artifact digest is checked: '+key);
 for(const key of Object.keys(THROW_PREDICTION_MENU_INPUT_SHA256)){
  const missing={...files};delete missing[key];
  assert.throws(()=>run(missing),/Emitted throw prediction input/);
 }
});
