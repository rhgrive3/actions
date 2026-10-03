import fs from 'node:fs';
import path from 'node:path';
import {walkingFixture,detailFixture} from './inkwave-motion-gate-fixtures.mjs';
// Fault injection for CLI result publication; no browser or GPU is launched.
export const chromium={async launchPersistentContext(){
 let routeHandler,url;
 const page={on(){},async route(_pattern,callback){routeHandler=callback;},async goto(value){
  url=value;const site=process.argv[process.argv.indexOf('--site')+1],manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
  if(process.env.INKWAVE_GATE_FAULT!=='missing-receipts')for(const key of Object.keys(manifest.artifacts))await routeHandler({async fetch(){return {async body(){return fs.readFileSync(path.join(site,key));},url(){return new URL('/'+key,url).href;}};},async fulfill(){},async abort(){}});
 },async addScriptTag(){},async evaluate(_fn,args){if(!args)return {faultFixture:true};return url.endsWith('/motion-detail')?detailFixture():walkingFixture();},async screenshot({path:destination}){fs.writeFileSync(destination,'fabricated publication-test placeholder; not PNG evidence\n');}};
 return {async newPage(){return page;},async close(){if(process.env.INKWAVE_GATE_FAULT==='cleanup')throw Error('Injected browser cleanup failure');}};
}};
