import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const b=fs.readFileSync(new URL('./capture-print-integration.mjs',import.meta.url),'utf8');
test('browser callback and every serialized helper parse with the current six-variant API',()=>{
 const begin=b.indexOf('return await page.evaluate(')+'return await page.evaluate('.length,end=b.indexOf(' },{prefix,ids,shared,helperSource,sorellaSource,explosherSource,workSource,variantIds:plan.variantIds,baseModelCount:plan.baseModelCount});');assert.ok(end>begin);assert.equal(typeof vm.runInNewContext('('+b.slice(begin,end)+' })'),'function');
 for(const file of ['capture-noct-milk.mjs','capture-sorella.mjs','capture-explosher.mjs','compare-native-weapon-work.mjs']){const s=fs.readFileSync(new URL('./'+file,import.meta.url),'utf8');assert.equal(typeof vm.runInNewContext('('+s.slice(s.indexOf('export async function')).replace('export ', '')+')'),'function');assert.ok(!/weaponBaseModelId|weaponDefaultAppearance|weaponVariantSpec/.test(s));}
 assert.ok(b.includes('registeredWeaponVariantModels()'));
});
test('single-site entry requires head and source/artifact identities without claiming A/B',()=>{for(const s of ['assert.match(plan.head','assert.equal(execFileSync','validateBuildBinding','validateDelivered','routeWebSocket','modelInputs','assert.equal(result.frames.length,24)','assert.equal(Object.keys(result.poses).length,20)','No baseline comparison'])assert.ok(b.includes(s),s);});
import vm from 'node:vm';import path from 'node:path';import crypto from 'node:crypto';
test('served bytes fail closed for unknown paths, traversal and changed artifacts',()=>{
 const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),bytes=Buffer.from('export{}'),manifest={build:{revision:'r'},artifacts:{'module.mjs':hash(bytes)}},site='/site',prefix='/_versions/r/';let changed=false;
 const start=b.indexOf('http.createServer('),end=b.indexOf(';\n await new Promise',start);
 const handler=vm.runInNewContext(b.slice(start,end),{http:{createServer:f=>f},URL,path,site,prefix,manifest,hash,delivered:{},fs:{readFileSync:()=>changed?Buffer.from('changed'):bytes}});
 const request=url=>{let status=200,body;handler({url},{setHeader(){},writeHead(v){status=v},end(v){body=v}});return {status,body};};
 assert.equal(request('/_versions/r/module.mjs').status,200);assert.equal(request('/_versions/r/unknown.mjs').status,404);assert.equal(request('/module.mjs').status,404);assert.equal(request('/_versions/r/../module.mjs').status,404);changed=true;assert.equal(request('/_versions/r/module.mjs').status,409);
});
test('every serialized THREE identifier is required and undefined exports fail closed',()=>{
 const files=['capture-print-integration.mjs','capture-noct-milk.mjs','capture-sorella.mjs','capture-explosher.mjs','compare-native-weapon-work.mjs'];
 const used=[...new Set(files.flatMap(file=>[...fs.readFileSync(new URL('./'+file,import.meta.url),'utf8').matchAll(/THREE\.([A-Za-z0-9_]+)/g)].map(m=>m[1])))].sort();
 const start=b.indexOf('  function validateThreeExports('),end=b.indexOf('\n  const THREE=',start),validate=vm.runInNewContext('('+b.slice(start,end).trim()+')'),complete=Object.fromEntries(used.map(k=>[k,{}]));
 assert.deepEqual(Array.from(validate(complete)).sort(),used);for(const name of used)assert.throws(()=>validate({...complete,[name]:undefined}),new RegExp('Missing emitted THREE export: '+name));
});
