import {pathToFileURL} from 'node:url';
export async function resolve(specifier,context,nextResolve){if(specifier==='three')return {url:new URL('../inkwave-public/vendor/three/build/three.module.js',import.meta.url).href,shortCircuit:true};return nextResolve(specifier,context);}
