import assert from 'node:assert/strict';import fs from 'node:fs';import{createHash}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';import path from'node:path';
export const CANONICAL_FRAME_SHA256='440a225f6f27ddf5fdf6880b5fc2448f9ea97707cb46b3bc8762a9e58fe6119e';
export const SEQUENCED_FRAME_SHA256='196ab1f3ce16152630ad324578b1199fe8f4030ebc43cf2e40d1868ffb38df8a';
export const sha256=body=>createHash('sha256').update(body).digest('hex');
export function prepareSequencedDriver(canonical,bindings,helper=fs.readFileSync(new URL('./condition-entry.mjs',import.meta.url),'utf8'),qaRoot=fileURLToPath(new URL('../../',import.meta.url))){
 assert.equal(sha256(canonical),CANONICAL_FRAME_SHA256,'canonical frame body');
 const start=canonical.indexOf('// QA only. Source-bound .45s orbit/follow transition, not adaptive frame alignment.');
 const end=canonical.indexOf('\nconst [siteArg,sourceArg,overlayArg,outArg,variant,mode]',start);
 assert.ok(start>=0&&end>start);assert.equal(helper.split('export async function').length,2);
 const sequenced=canonical.slice(0,start)+helper.replace('export async function','async function')+canonical.slice(end);
 assert.equal(sha256(sequenced),SEQUENCED_FRAME_SHA256,'independently reviewed sequence body');
 let program=sequenced;const imports=[];
 for(const [original,url]of Object.entries(bindings)){
  assert.ok(['./lib/inkwave-runtime-evidence.mjs','./lib/inkwave-range-menu-entry.mjs','playwright'].includes(original));
  assert.equal(new URL(url).protocol,'file:');
  const relative=original==='playwright'?'node_modules/playwright/index.mjs':'scripts/'+original.slice(2);
  assert.equal(url,pathToFileURL(path.join(qaRoot,relative)).href,'exact QA import owner');
  const expected={'./lib/inkwave-runtime-evidence.mjs':'2b27816952ff5e871b36d0e9dc7b34c9ecba0886852b052e58f9b34506b6a2db','./lib/inkwave-range-menu-entry.mjs':'1ef06e5bbdeca02e3bccf3da40ad2156a0a49960ecc6e7f092dc0c84de48f15c'};
  if(expected[original])assert.equal(sha256(fs.readFileSync(fileURLToPath(url))),expected[original],'canonical QA helper body');
  const needle='from '+JSON.stringify(original).replaceAll('"',"'");
  assert.equal(program.split(needle).length,2,'unique native import');program=program.replace(needle,'from '+JSON.stringify(url));
  imports.push({specifier:original,url,sha256:sha256(fs.readFileSync(fileURLToPath(url)))});
 }
 assert.deepEqual(imports.map(x=>x.specifier).sort(),['./lib/inkwave-range-menu-entry.mjs','./lib/inkwave-runtime-evidence.mjs','playwright']);
 const packagePath=path.join(qaRoot,'node_modules/playwright/package.json'),packageBody=fs.readFileSync(packagePath),packageJson=JSON.parse(packageBody);
 assert.equal(packageJson.name,'playwright');assert.equal(packageJson.version,'1.51.1');
 return{program,provenance:{canonicalFrameSha256:CANONICAL_FRAME_SHA256,sequencedFrameSha256:SEQUENCED_FRAME_SHA256,generatedFrameSha256:sha256(program),conditionHelperSha256:sha256(helper),playwrightPackage:{path:packagePath,sha256:sha256(packageBody),version:packageJson.version},imports}};
}
export function bindDiagnosticDriver(program,driverPath){
 const needle="['scripts/check-inkwave-material-native-frame.mjs',site,source,overlay,out,variant,settledDiagnostic?'--settled-diagnostic':'--diagnostic']";
 assert.equal(program.split(needle).length,2,'unique diagnostic launch');
 return program.replace(needle,'['+JSON.stringify(driverPath)+",site,source,overlay,out,variant,settledDiagnostic?'--settled-diagnostic':'--diagnostic']");
}
export function assertGeneratedEvidence({program,provenance},driverPath){
 assert.equal(sha256(fs.readFileSync(driverPath)),provenance.generatedFrameSha256,'actual generated driver body');
 assert.equal(sha256(program),provenance.generatedFrameSha256);
 assert.equal(sha256(fs.readFileSync(provenance.playwrightPackage.path)),provenance.playwrightPackage.sha256,'Playwright package body');
 for(const item of provenance.imports)assert.equal(sha256(fs.readFileSync(fileURLToPath(item.url))),item.sha256,'bound import body: '+item.specifier);
}
