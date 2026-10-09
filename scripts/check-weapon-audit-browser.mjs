#!/usr/bin/env node
// Real WebGL readback without a web server: source-composed and emitted modules.
// Only ESM import specifiers are rewritten to an in-memory import map. Shader
// and gameplay bodies are unchanged. This is NOT a whole-game/online UI test.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parse } from '../patches/loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from './inkwave-source-composition.mjs';
const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i+1]; };
const site = path.resolve(option('--site', '_site'));
const out = path.resolve(option('--out', '.ci-scratch/weapon-audit-browser.json'));
const pw = option('--playwright', 'playwright');
const executable = option('--executable', null);
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const build = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
assert.equal(sha(JSON.stringify(build.files)), build.inputHash, 'build input receipt');
assert.equal(sha(JSON.stringify(build.artifacts)), build.contentHash, 'build artifact receipt');
for (const [file, digest] of Object.entries(build.artifacts)) assert.equal(sha(fs.readFileSync(path.join(site,file))), digest, file);
function graph(mode) {
  const modules = new Map(), base = mode === 'source' ? ROOT : path.join(site, '_versions', build.build.revision);
  const entry = '@probe';
  function physical(rel) {
    assert(!path.isAbsolute(rel) && !rel.split('/').includes('..'), 'bounded source graph: '+rel);
    return mode === 'source' && /^(src|vendor)\//.test(rel) ? path.join(ROOT, 'inkwave-public', rel) : path.join(base, rel);
  }
  function visit(rel) {
    if (modules.has(rel)) return;
    const id = 'iw-audit/'+rel;
    let code = rel === entry ? fs.readFileSync(path.join(ROOT,'patches/splatoon3/tests/paint-mask-browser-fixture.mjs'),'utf8') : fs.readFileSync(physical(rel),'utf8');
    if (mode === 'source' && rel !== entry) code = adaptBuildSource(rel,code);
    const originalSha256 = sha(code), row = {id, originalSha256, code:null}; modules.set(rel,row);
    const ast = parse(code,{ecmaVersion:'latest',sourceType:'module'}), changes=[];
    function walk(n) {
      if (!n || typeof n !== 'object') return;
      if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ImportExpression') && n.source) {
        const s = n.source;
        assert.equal(typeof s.value,'string','probe does not rewrite computed imports');
        let target;
        if (s.value === 'three') target = 'vendor/three/build/three.module.js';
        else if(s.value.startsWith('three/addons/')) target = 'vendor/three/jsm/'+s.value.slice(13);
        else if(s.value.startsWith('/ASSET/')) target = s.value.slice(7);
        else { assert(s.value.startsWith('.'),'unresolved import '+s.value); target = path.posix.normalize(path.posix.join(path.posix.dirname(rel),s.value)); }
        visit(target); changes.push({start:s.start,end:s.end,text:JSON.stringify('iw-audit/'+target)});
      }
      for(const [key,value] of Object.entries(n)) if(key !== 'source') {
        if(Array.isArray(value)) value.forEach(walk); else if(value && typeof value === 'object') walk(value);
      }
    }
    walk(ast);
    for(const c of changes.sort((a,b)=>b.start-a.start)) code=code.slice(0,c.start)+c.text+code.slice(c.end);
    Object.assign(row,{code,rewrittenSha256:sha(code),rewrittenImports:changes.length});
  }
  visit(entry);return {entry:'iw-audit/'+entry,modules:[...modules.values()]};
}
const {chromium} = await import(path.isAbsolute(pw) ? pathToFileURL(pw).href : pw);
const browser = await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results={status:'running',build:build.build,method:'memory ESM specifier rewrite; unchanged gameplay/shader bodies',rows:{}};
try {
  for(const mode of ['source','built']) {
    const input=graph(mode), page=await browser.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.stack));
    // about:blank + local bytes only. No HTTP request or browser policy changes.
    await page.setContent('<!doctype html><html><head></head><body><h1>INKWAVE paint-mask GPU probe</h1></body></html>');
    await page.evaluate(({modules,entry})=>{
      const imports={};
      for(const m of modules) imports[m.id]=URL.createObjectURL(new Blob([m.code],{type:'text/javascript'}));
      const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
      const run=document.createElement('script');run.type='module';run.textContent=`import {runPaintMaskProbe} from ${JSON.stringify(entry)};\nrunPaintMaskProbe().then(result=>globalThis.auditResult=result).catch(e=>globalThis.auditError=e.stack);`;document.head.append(run);
    },input);
    await page.waitForFunction(()=>globalThis.auditResult || globalThis.auditError,{},{timeout:180000});
    const {result,error}=await page.evaluate(()=>({result:globalThis.auditResult,error:globalThis.auditError}));
    assert(!error,error); assert.equal(errors.length,0,errors.join('\n')); assert(result?.rows?.length===108,'complete probe corpus');
    results.rows[mode]={...result,modules:input.modules.map(({code,...receipt})=>receipt)};
    console.log(mode,JSON.stringify({hashQueries:result.hashQueries,cells:result.cells,rows:result.rows.length,negativeUnsupported:result.negativeUnsupported,renderer:result.renderer}));
    await page.close();
  }
  for(const key of ['hashQueries','rows','cells','negativeUnsupported']) assert.deepEqual(results.rows.source[key],results.rows.built[key],key+' source/build equality');
  results.status='passed';
} catch(e) {results.status='failed';results.error=e.stack;process.exitCode=1;} finally {await browser.close();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(results,null,2)+'\n');}
