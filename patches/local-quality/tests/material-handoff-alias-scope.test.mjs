// Exercise only the actual fixture's alias mapper with plain function stubs.
// No Character, renderer, runtime/game code, or emitted method is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./material-handoff.test.mjs',import.meta.url),'utf8');
assert.match(source,/import\s*\{claimPreloadedMusic,cancelPreloadedMusic\}\s*from\s*['"]\.\.\/\.\.\/splatoon3\/runtime\/audio\/music-preload-owner\.mjs['"]/);
const start=source.indexOf('function aliasScope('),end=source.indexOf('\nfunction attractMethod(',start);
assert.ok(start>=0 && end>start,'extract the actual fixture alias mapper only');
const claim=()=>{},cancel=()=>{},other=()=>{};
const aliasScope=vm.runInNewContext('('+source.slice(start,end)+')',
 {claimPreloadedMusic:claim,cancelPreloadedMusic:cancel,T:{},assert});
const imports='import{claimPreloadedMusic as Mt,cancelPreloadedMusic as rt}from"./music-preload-owner.mjs";import{other as ot}from"./other.mjs";';

test('import aliases preserve default fixture-scope function bindings',()=>{
 const scope=aliasScope(imports,{other});
 assert.equal(scope.Mt,claim);
 assert.equal(scope.rt,cancel);
 assert.equal(scope.ot,other);
});
test('explicit fixture overrides bind both original and imported aliases',()=>{
 const overrideClaim=()=>{},overrideCancel=()=>{};
 const scope=aliasScope(imports,{other,claimPreloadedMusic:overrideClaim,cancelPreloadedMusic:overrideCancel});
 assert.equal(scope.claimPreloadedMusic,overrideClaim);
 assert.equal(scope.cancelPreloadedMusic,overrideCancel);
 assert.equal(scope.Mt,overrideClaim);
 assert.equal(scope.rt,overrideCancel);
});
