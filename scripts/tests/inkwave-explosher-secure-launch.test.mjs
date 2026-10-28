import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {secureExplosherDriver,SECURE_EXPLOSHER_LAUNCH} from '../lib/inkwave-explosher-secure-launch.mjs';
const driver=readFileSync(new URL('../render-inkwave-projectile-shapes.mjs',import.meta.url),'utf8');
test('inherited launcher is strictly replaced with sandbox and no explicit flags',()=>{
 const actual=secureExplosherDriver(driver);
 assert.deepEqual(SECURE_EXPLOSHER_LAUNCH,{headless:true,chromiumSandbox:true,explicitArgs:[]});
 assert.match(actual,/chromium\.launch\(\{ headless: true, chromiumSandbox: true \}\)/);
 assert.doesNotMatch(actual,/--no-sandbox|--enable-unsafe-swiftshader|--ignore-gpu-blocklist|chromiumSandbox\s*:\s*false/);
});
test('unexpected or duplicate launcher fails closed',()=>{
 assert.throws(()=>secureExplosherDriver(driver.replace('--no-sandbox','--no-sandbox-changed')));
 assert.throws(()=>secureExplosherDriver(driver+driver));
});
test('both wrappers invoke the transformation and record options and helper hash',()=>{
 for(const path of ['../check-inkwave-explosher-flight-glitter.mjs','../check-inkwave-current-explosher-native.mjs']) {
  const s=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.match(s,/driver=secureExplosherDriver\(driver\)/);
  assert.match(s,/secureLaunch:SECURE_EXPLOSHER_LAUNCH/);
  assert.match(s,/secureLaunchHelperSha256/);
 }
 const historical=readFileSync(new URL('../check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');
 assert.match(historical,/\['inkwave-explosher-secure-launch\.mjs','inkwave-explosher-startup\.mjs'/);
});
test('isolated workflow pins original tree and keeps original gate commands in order',()=>{
 const s=readFileSync(new URL('../../.github/workflows/inkwave-explosher-sandbox-diagnostic.yml',import.meta.url),'utf8');
 assert.match(s,/a8877a086cc377074a07de60eba5f17c7b1213a1/);
 assert.match(s,/5ae30f11763b952df917d7b272a884e4fbc8a98e/);
 assert.match(s,/ref: 364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c/);
 assert.match(s,/cmp \.built-site\/explosher-current\/inkwave-build\.json \.built-site\/explosher-candidate\/inkwave-build\.json/);
 assert.doesNotMatch(s,/continue-on-error|if:\s*false/);
 const names=['Require pinned candidate native Explosher input and rendering','Compile reviewed inverse pair without changing production artifacts','Short admitted same-build native preflight before long capture','Enforce original absolute Explosher geometry guard','Capture admitted inverse baseline stills','Capture admitted inverse candidate stills','Require all-frame same-build inverse acceptance'];
 let pos=-1; for(const name of names){const i=s.indexOf(name);assert.ok(i>pos,name);pos=i;}
 assert.match(s,/readExplosherStagePair\('preflight'/);
 assert.match(s,/readExplosherStagePair\('stills'/);
 assert.match(s,/check-inkwave-explosher-absolute-geometries\.mjs preflight/);
 assert.match(s,/check-inkwave-explosher-absolute-geometries\.mjs stills/);
 assert.match(s,/if: always\(\)/);
});
