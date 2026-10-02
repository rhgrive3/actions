import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
let cached;
export function realCharacter(){return cached??=(async()=>{
 const src=path.join(ROOT,'inkwave-public'),context=vm.createContext({console,performance}),modules=new Map();
 const load=requested=>{const file=requested.startsWith(path.join(src,'patches')+path.sep)?path.join(ROOT,path.relative(src,requested)):requested;if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(adaptSource(path.relative(src,file),fs.readFileSync(file,'utf8')),{context,identifier:file});modules.set(file,m);return m;};
 const entry=new vm.SourceTextModule(`export * from './inkwave-public/src/game/character.js'; export * as THREE from 'three'; export {G} from './inkwave-public/src/core/ctx.js'; export {installWalkMotion} from './patches/splatoon3/runtime/walk.mjs'; export {installRollerMotion} from './patches/splatoon3/runtime/roller.mjs';`,{context,identifier:path.join(ROOT,'fixture-entry.mjs')});
 await entry.link((spec,from)=>load(spec==='three'?path.join(src,'vendor/three/build/three.module.js'):spec.startsWith('three/addons/')?path.join(src,'vendor/three/jsm',spec.slice('three/addons/'.length)):path.resolve(path.dirname(from.identifier),spec)));
 await entry.evaluate();const api={...entry.namespace};api.profile=JSON.parse(fs.readFileSync(path.join(ROOT,'patches/splatoon3/profile.json')));api.installWalkMotion(api,api.profile);api.installRollerMotion(api,api.profile);return api;
})();}
export async function character(){const api=await realCharacter();const ch=new api.Character({name:'motion regression',weapon:'shooter',style:{hair:0,skin:2,outfit:0,eyes:0}});ch.onEvent=null;const state={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:false,charge:0,ink:1,hp:1,vy:0};for(let i=0;i<90;i++)ch.update(1/60,state);return {api,ch,state};}
