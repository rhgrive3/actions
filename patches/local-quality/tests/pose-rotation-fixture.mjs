import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
export const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const REL='src/game/motion/source-bank.js';
export const baseline=fs.readFileSync(new URL('./fixtures/source-bank-07f44b97.mjs.txt',import.meta.url),'utf8');
const assets=path.join(ROOT,'inkwave-public/assets/source-motion');
const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json')));
const inflate=names=>gunzipSync(Buffer.concat(names.map(n=>fs.readFileSync(path.join(assets,n)))));
const catalog=JSON.parse(inflate(manifest.catalog.parts));
export async function poseRotationFixture(old=false){
 const site=process.env.INKWAVE_BUILT_SITE||path.join(ROOT,'inkwave-public'),context=vm.createContext({console,URL,Map}),modules=new Map();
 const code=old?baseline:process.env.INKWAVE_BUILT_SITE?fs.readFileSync(path.join(site,REL),'utf8'):adaptBuildSource(REL,baseline);
 const three=path.join(site,'vendor/three/build/three.module.js');
 function load(file){if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});modules.set(file,m);return m;}
 const entry=new vm.SourceTextModule(code+"\nexport * as THREE from 'three'; export const VM_MATH=Math;",{context});
 await entry.link((s,from)=>load(s==='three'?three:path.resolve(path.dirname(from.identifier),s)));await entry.evaluate();
 const api={...entry.namespace};
 api.bank=name=>{const bytes=inflate(manifest.variants[name].parts),Type=vm.runInContext('ArrayBuffer',context),buffer=new Type(bytes.length);new Uint8Array(buffer).set(bytes);return new api.SourceBank(structuredClone(catalog.variants[name]),buffer);};
 return api;
}
export const poseSnapshot=p=>structuredClone({raw:Array.from(p.raw),flags:Array.from(p.flags),p:p.p.map(v=>v.toArray()),q:p.q.map(q=>q.toArray()),s:p.s.map(v=>v.toArray()),world:p.world.map(m=>Array.from(m.elements)),wp:p.wp.map(v=>v.toArray()),wq:p.wq.map(q=>q.toArray()),euler:p.euler.toArray()});
