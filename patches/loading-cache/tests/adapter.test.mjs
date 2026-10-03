import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {execFileSync,spawnSync} from 'node:child_process';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {parse} from '../vendor/acorn.mjs';import {adaptCompiledMain,loadingIdentity} from '../adapter.mjs';
const baseline=process.env.INKWAVE_BASELINE_SITE;
const source=baseline?fs.readFileSync(path.join(baseline,'src/main.js'),'utf8'):null;
function writableTestTmp(){
 const candidates=[process.env.INKWAVE_TEST_TMP,process.env.TMPDIR,path.resolve('.ci-scratch'),
   process.env.TMP,process.env.TEMP,process.env.CI_STORAGE,os.tmpdir()].filter(Boolean);
 const seen=new Set();
 for(const candidate of candidates){
  const root=path.resolve(candidate);if(seen.has(root))continue;seen.add(root);
  try{fs.mkdirSync(root,{recursive:true});fs.accessSync(root,fs.constants.W_OK);return root;}catch{}
 }
 throw new Error('No writable temporary directory for loading/cache regression tests');
}
const TEST_TMP=writableTestTmp();
const classMethods=s=>{const ast=parse(s,{ecmaVersion:'latest',sourceType:'module'});const cls=ast.body.find(n=>n.type==='ClassDeclaration'&&n.body.body.some(m=>m.key?.name==='boot'));return new Map(cls.body.body.filter(n=>n.type==='MethodDefinition').map(n=>[n.key.name,s.slice(n.start,n.end)]));};
function shape(node){if(Array.isArray(node))return node.map(shape);if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).filter(([k])=>!['start','end','raw'].includes(k)).map(([k,v])=>[k,shape(v)]));return node;}
function uninstrument(node){if(Array.isArray(node))return node.map(uninstrument).filter(Boolean);if(!node||typeof node!=='object')return node;
 if(node.type==='ExpressionStatement'&&(JSON.stringify(node).includes('"name":"__inkwaveStartup"')))return null;
 if(node.type==='FunctionDeclaration'&&node.id?.name==='__iwStartupMeasure')return null;
 if(node.type==='CallExpression'&&node.callee.name==='__iwStartupMeasure')return uninstrument(node.arguments[1].body);
 return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,uninstrument(v)]));}

test('adapter exact baseline parses, preserves every method except three startup-owned methods',{skip:!source},()=>{
 const adapted=adaptCompiledMain(source),old=classMethods(source),current=classMethods(adapted.code);assert.equal(adapted.removedDwellMs,250);assert.equal(adapted.phases.length,22);
 for(const[name,code]of old)if(!['boot','startMatch','_loadLightmap'].includes(name))assert.equal(current.get(name),code,name);
 assert(current.get('_loadLightmap').includes('cache:"force-cache"'));assert(!current.get('_loadLightmap').includes('.png?h='));
 assert.equal(current.get('boot').match(/\.compileAsync\(/g)?.length,old.get('boot').match(/\.compileAsync\(/g)?.length);
});
test('removing profiler wrappers yields identical full AST except explicit dwell/cache edits',{skip:!source},()=>{
 const before=parse(source,{ecmaVersion:'latest',sourceType:'module'}),after=uninstrument(parse(adaptCompiledMain(source).code,{ecmaVersion:'latest',sourceType:'module'}));
 // Normalize only the three deliberately changed constants/templates in the baseline.
 function visit(node){if(!node||typeof node!=='object')return;if(node.type==='AwaitExpression'&&node.argument.type==='NewExpression'&&node.argument.callee.name==='Promise'){
 const cb=node.argument.arguments[0];if(cb?.body?.callee?.name==='setTimeout'&&cb.body.arguments[1]?.value===250)cb.body.arguments[1].value=0;
 }if(node.type==='Property'&&(node.key.name||node.key.value)==='cache'&&node.value.value==='no-cache')node.value.value='force-cache';
 if(node.type==='TemplateLiteral'&&node.quasis?.[0]?.value.raw==='assets/lightmaps/'&&node.quasis[1]?.value.raw==='.png?h='){
 node.expressions.pop();node.quasis.pop();node.quasis[1].value={raw:'.png',cooked:'.png'};node.quasis[1].tail=true;
 }
 for(const v of Object.values(node))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);
 }visit(before);assert.deepEqual(shape(after),shape(before));
});
test('adapter rejects duplicate application and unexpected source topology',{skip:!source},()=>{
 const adapted=adaptCompiledMain(source);assert.throws(()=>adaptCompiledMain(adapted.code),/twice/);
 assert.throws(()=>adaptCompiledMain(source.replace('compileAsync','compileUnknown')),/topology/);
 assert.throws(()=>adaptCompiledMain(source.replace('.png?h=','.png?wrong=')),/lightmap cache topology/);
});
test('production profiler dispatch does not alter evaluation count or synchronous return',{skip:!source},()=>{
 const helper=adaptCompiledMain(source).code.split('\n')[0];const ctx=vm.createContext({});vm.runInContext(helper,ctx);
 assert.equal(vm.runInContext('let count=0;const value=__iwStartupMeasure("x",()=>{count++;return 42;});value===42&&count===1',ctx),true);
 assert.equal(vm.runInContext('const promise=Promise.resolve(7);__iwStartupMeasure("x",()=>promise)===promise',ctx),true);
 assert.throws(()=>vm.runInContext('__iwStartupMeasure("x",()=>{throw new Error("same error");})',ctx),/same error/);
});
test('loading identity binds runtime, shell, worker, adapter and exact Acorn; excludes tests',()=>{
 const files=loadingIdentity();for(const k of ['adapter.mjs','runtime/startup.mjs','sw.js','shell.html','vendor/acorn.mjs','vendor/ACORN-LICENSE'])assert.match(files[k],/^[a-f0-9]{64}$/);
 assert(!Object.keys(files).some(k=>k.startsWith('tests/')));
});
test('exact-source checker rejects forged loading input despite self-consistent manifest',()=>{
 const root=path.resolve(new URL('../../../',import.meta.url).pathname);
 const dir=fs.mkdtempSync(path.join(TEST_TMP,'iw-identity-'));
 try{
 const fixture=path.join(dir,'repo'),site=path.join(dir,'site');fs.mkdirSync(path.join(fixture,'scripts'),{recursive:true});fs.mkdirSync(path.join(fixture,'patches/loading-cache/runtime'),{recursive:true});fs.mkdirSync(site);
 fs.copyFileSync(path.join(root,'scripts/check-inkwave-browser.mjs'),path.join(fixture,'scripts/check-inkwave-browser.mjs'));
 fs.writeFileSync(path.join(fixture,'scripts/build-inkwave.mjs'),'// committed builder\n');const target=path.join(fixture,'patches/loading-cache/runtime/startup.mjs');fs.writeFileSync(target,'// committed startup\n');
 const git=(...args)=>execFileSync('git',args,{cwd:fixture,stdio:'pipe'});
 git('init','-q');git('add','.');git('-c','user.name=Identity Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
 fs.appendFileSync(target,'// UNCOMMITTED\n');const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 const identity={artifacts:{},contentHash:hash(JSON.stringify({})),files:{'loading-cache/runtime/startup.mjs':hash(fs.readFileSync(target))},build:{script:hash(fs.readFileSync(path.join(fixture,'scripts/build-inkwave.mjs')))}};
 fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(identity));
 // The checker rejects /tmp for browser outputs. This check exits before browser use.
 const outputs=path.join(TEST_TMP,'iw-identity-outputs-'+path.basename(dir));fs.mkdirSync(outputs,{recursive:true});
 try{const check=spawnSync(process.execPath,[path.join(fixture,'scripts/check-inkwave-browser.mjs'),'--site',site,'--evidence-dir',path.join(outputs,'evidence'),'--profile-dir',path.join(outputs,'profile'),'--exact-source'],{encoding:'utf8',timeout:15000});
 assert.notEqual(check.status,0);assert(check.stderr.includes('Build input differs from commit: patches/loading-cache/runtime/startup.mjs'),check.stderr);
 }finally{fs.rmSync(outputs,{recursive:true,force:true});}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
