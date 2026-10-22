// CPU-only generated fixture; no browser import, launch, runtime mutation or native evidence.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {prepareSequencedDriver,bindDiagnosticDriver} from './entry-driver.mjs';
import {prepareAaRunner} from './run.mjs';
import {preparePostprocessDiagnostic} from './postprocess-driver.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'material-diagnostic-fixture-'));
try{
 fs.mkdirSync(path.join(root,'node_modules/playwright'),{recursive:true});fs.mkdirSync(path.join(root,'scripts/lib'),{recursive:true});
 fs.writeFileSync(path.join(root,'node_modules/playwright/index.mjs'),'export const chromium=null; // CPU fixture only\n');
 fs.writeFileSync(path.join(root,'node_modules/playwright/package.json'),JSON.stringify({name:'playwright',version:'1.51.1'}));
 for(const name of ['inkwave-runtime-evidence.mjs','inkwave-range-menu-entry.mjs'])fs.copyFileSync(new URL('../../scripts/lib/'+name,import.meta.url),path.join(root,'scripts/lib',name));
}catch(e){fs.rmSync(root,{recursive:true,force:true});throw e;}
export const bindings=Object.fromEntries(['./lib/inkwave-runtime-evidence.mjs','./lib/inkwave-range-menu-entry.mjs','playwright'].map(spec=>[spec,pathToFileURL(path.join(root,spec==='playwright'?'node_modules/playwright/index.mjs':'scripts/'+spec.slice(2))).href]));
export const helperUrl=pathToFileURL(path.join(root,'scripts/lib/inkwave-material-normal-admission.mjs')).href;
let extended;
try{extended=preparePostprocessDiagnostic(prepareSequencedDriver(fs.readFileSync(new URL('../../scripts/check-inkwave-material-native-frame.mjs',import.meta.url),'utf8'),bindings,undefined,root),prepareAaRunner(fs.readFileSync(new URL('../../scripts/check-inkwave-material-native-paired.mjs',import.meta.url),'utf8'),helperUrl));}
finally{fs.rmSync(root,{recursive:true,force:true});}
export const prepared=extended.prepared,paired=extended.pairedProgram;
export const retainedImports=prepared.provenance.imports.map(item=>({...item,url:'file:///home/runner/work/actions/actions/'+(item.specifier==='playwright'?'node_modules/playwright/index.mjs':'scripts/'+item.specifier.slice(2))}));
export const retainedFrame=prepared.provenance.imports.reduce((s,item,i)=>s.replace('from '+JSON.stringify(item.url),'from '+JSON.stringify(retainedImports[i].url)),prepared.program);
export const retainedPaired=bindDiagnosticDriver(paired.replace('from '+JSON.stringify(helperUrl),'from "file:///home/runner/work/actions/actions/scripts/lib/inkwave-material-normal-admission.mjs"'),'/home/runner/work/actions/actions/work/material-aa/settled-native-frame.mjs');
