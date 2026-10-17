import path from 'node:path';import {pathToFileURL} from 'node:url';
const site=process.env.INKWAVE_HEADGEAR_SITE;if(!site)throw Error('INKWAVE_HEADGEAR_SITE required');
export async function resolve(specifier,context,next){if(specifier==='three')return {url:pathToFileURL(path.join(site,'vendor/three/build/three.module.js')).href,shortCircuit:true};if(specifier.startsWith('three/addons/'))return {url:pathToFileURL(path.join(site,'vendor/three/jsm',specifier.slice(13))).href,shortCircuit:true};return next(specifier,context);}
export async function load(url,context,next){return next(url,url.endsWith('.js')?{...context,format:'module'}:context);}
