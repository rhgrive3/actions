import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import crypto from 'node:crypto';
import {runMinimapCanvasProbe} from './minimap-canvas-probe.mjs';
const revision='a'.repeat(64),prefix='_versions/'+revision+'/',body=new TextEncoder().encode('controlled artifact'),digest=crypto.createHash('sha256').update(body).digest('hex');
const paths=['src/game/minimap.js','src/core/ctx.js','src/config.js','patches/splatoon3/runtime/minimap-dirty.mjs','vendor/three/build/three.module.js'];
const manifest={build:{revision},artifacts:Object.fromEntries(paths.map(p=>[prefix+p,digest]))};
const root=process.env.MINIMAP_SOURCE_ROOT||new URL('../../',import.meta.url).pathname;
async function prepared(m=manifest){let captured;await runMinimapCanvasProbe({evaluate(fn,args){captured={fn,args};throw Error('capture-only');}},{root,evidence:'/tmp',sourceSha:'controlled',contentHash:'controlled',manifest:m}).catch(e=>{if(e.message!=='capture-only')throw e;});return captured;}
function context(args){const order=[];let mapping,removed=false;const frame={hidden:false,contentDocument:{createElement:()=>({}),head:{appendChild(s){assert.equal(s.type,'importmap');mapping=JSON.parse(s.textContent).imports;order.push('map');}}},contentWindow:{Function:()=>async url=>{order.push('load');if(!mapping?.three)throw Error('Failed to resolve module specifier three');assert.equal(mapping.three,'http://fixture/'+args.emitted.three.path);throw Error('bound-module-loader-reached');}},remove(){removed=true;}};return{order,get removed(){return removed;},globals:{document:{createElement:()=>frame,body:{appendChild(){order.push('frame');}}},location:{origin:'http://fixture'},URL,crypto:crypto.webcrypto,fetch:async()=>({ok:true,arrayBuffer:async()=>body.buffer})}};}
// The page callback returns diagnostic failures for the outer browser checker
// to persist and reject. Assert that receipt rather than an uncaught page error.
async function failedCallback(source,args,c,expected){
 const result=await vm.runInNewContext('('+source+')(args)',{...c.globals,args});
 assert.equal(result.failed,true);assert.match(result.error,expected);
 assert.equal(result.cases.length,0);assert.equal(result.images.length,0);
}
test('exact emitted Three dependency and iframe map precede isolated module imports',async()=>{const {fn,args}=await prepared();assert.deepEqual(args.emitted.three,{path:prefix+paths[4],sha256:digest});const c=context(args);await failedCallback(fn.toString(),args,c,/bound-module-loader-reached/);assert.deepEqual(c.order.slice(0,3),['frame','map','load']);assert.equal(c.removed,true);});
test('old missing-map behavior rejects the bare Three import',async()=>{const {fn,args}=await prepared();const c=context(args),source=fn.toString().replace('frame.contentDocument.head.appendChild(importMap);','');await failedCallback(source,args,c,/Failed to resolve module specifier three/);assert.equal(c.removed,true);});
test('missing or foreign-revision Three rejects before page evaluation',async()=>{for(const foreign of [false,true]){const m=structuredClone(manifest);delete m.artifacts[prefix+paths[4]];if(foreign)m.artifacts['_versions/'+'b'.repeat(64)+'/'+paths[4]]=digest;await assert.rejects(prepared(m),/Unique versioned minimap dependency required/);}});
test('served Three corruption rejects before isolated module import and cleans frame',async()=>{const {fn,args}=await prepared();args.emitted.three.sha256='0'.repeat(64);const c=context(args);await failedCallback(fn.toString(),args,c,/served emitted dependency hash/);assert.equal(c.order.includes('load'),false);assert.equal(c.removed,true);});
