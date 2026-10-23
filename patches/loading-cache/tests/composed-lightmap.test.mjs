import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptCompiledMain} from '../adapter.mjs';
import {parse} from '../vendor/acorn.mjs';

// Exercise the actual build boundary that a source-method unit test cannot see.
const composed=adaptBuildSource('src/main.js',fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'));
const compiled=transformSync(composed,{loader:'js',minify:true,charset:'utf8',legalComments:'inline',sourcefile:'src/main.js'}).code;
function method(code){
 const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
 const game=ast.body.find(n=>n.type==='ClassDeclaration'&&n.body.body.some(m=>m.key?.name==='boot'));
 const m=game.body.body.find(m=>m.key?.name==='_loadLightmap');assert(m);return{start:m.start,end:m.end,text:code.slice(m.start,m.end)};
}
function changeMethod(edit){const m=method(compiled);return compiled.slice(0,m.start)+edit(m.text)+compiled.slice(m.end);}
test('actual composed and production-minified main retains the strict single-site compiled lightmap contract',()=>{
 const before=method(compiled).text;assert.equal(before.match(/cache:"no-cache"/g)?.length,1);
 const result=adaptCompiledMain(compiled),after=method(result.code).text;
 assert.equal(after.match(/cache:"force-cache"/g)?.length,1);assert(!after.includes('.png?h='));
 assert.equal(result.phases.length,22);assert.equal(result.redundantLightmapQueryRemoved,true);
});
test('compiled lightmap adapter still rejects added or missing metadata cache sites and changed PNG topology',()=>{
 assert.throws(()=>adaptCompiledMain(changeMethod(s=>s.replace('cache:"no-cache"','cache:"no-cache",extra:{cache:"no-cache"}'))),/lightmap cache topology changed/);
 assert.throws(()=>adaptCompiledMain(changeMethod(s=>s.replace('cache:"no-cache"','cache:"default"'))),/lightmap cache topology changed/);
 assert.throws(()=>adaptCompiledMain(changeMethod(s=>s.replace('.png?h=','.png?changed='))),/lightmap cache topology changed/);
});
