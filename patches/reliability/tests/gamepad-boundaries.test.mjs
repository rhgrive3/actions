import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptInput} from '../input-adapter.mjs';
import assert from 'node:assert/strict';
import {boot,pad,STEP,composed,resolveFixtureModule} from './pause-fixture.mjs';
import {installInputPlatform,resetPlatformInput} from '../../local-quality/platform-input.mjs';

test('composed gamepad imports resolve production patch modules from the repository root',()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const upstream=path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE||path.join(root,'inkwave-public'));
 const importer=path.join(upstream,'src/game/player.js');
 const specifier=composed('src/game/player.js',true).match(/^import \{ updateShotGuide \} from '([^']+)';/m)?.[1];
 assert.equal(specifier,'../../patches/splatoon3/runtime/weapons-fidelity.mjs');
 const resolved=resolveFixtureModule(specifier,importer);
 assert.equal(resolved,path.join(root,'patches/splatoon3/runtime/weapons-fidelity.mjs'));
 assert.equal(fs.existsSync(resolved),true);
});

function device(axes=[0,0,0,0],mapping='standard',buttons=[]){const p=pad(buttons);p[0].mapping=mapping;p[0].axes=axes;return p;}
const minifier=process.env.INKWAVE_GAMEPAD_ESBUILD ? await import(process.env.INKWAVE_GAMEPAD_ESBUILD) : null;
const mapAdapter=process.env.INKWAVE_GAMEPAD_MAP_ADAPTER ? await import(process.env.INKWAVE_GAMEPAD_MAP_ADAPTER) : null;
const platform=minifier ? await import('data:text/javascript;base64,'+Buffer.from(minifier.transformSync(fs.readFileSync(new URL('../../local-quality/platform-input.mjs',import.meta.url),'utf8'),{minify:true,format:'esm'}).code).toString('base64')) : {installInputPlatform};
async function rig(){const h=await boot(true,{transform:(rel,source)=>{if(mapAdapter)source=mapAdapter.adaptMapLook(rel,source);return minifier?minifier.transformSync(source,{minify:true,format:'esm'}).code:source;}});platform.installInputPlatform(h.input.constructor);return h;}
for(const extra of [-1,1])test(`#681 unused non-standard axis ${extra} cannot hold consumed sticks disabled`,async()=>{
 const h=await rig();resetPlatformInput(h.input,h.controller);h.setPads(device([0,0,0,0,extra],''));h.input.pollPad();
 assert.equal(h.input._platformPadAxes,false);
 h.setPads(device([.7,0,.8,0,extra],''));h.input.pollPad();const out={};h.input.padStick(2,3,out);assert.ok(out.x>0);assert.ok(h.input.padAxis(0)>0);
 h.controller.update(STEP);assert.ok(h.actor.intent.move.length()>0);assert.notEqual(h.rig.yaw,0);
});
for(const mapping of ['standard',''])for(const axis of [0,1,2,3])test(`#681 ${mapping||'raw'} held gameplay axis ${axis} remains gated until neutral`,async()=>{
 const h=await rig(),axes=[0,0,0,0,-1];axes[axis]=.9;resetPlatformInput(h.input,h.controller);h.setPads(device(axes,mapping));
 for(let i=0;i<5;i++){h.input.pollPad();assert.equal(h.input._platformPadAxes,true);assert.equal(h.input.padAxis(axis),0);const out={};h.input.padStick(2,3,out);assert.equal(out.mag,0);}
 axes[axis]=0;h.input.pollPad();assert.equal(h.input._platformPadAxes,false);axes[axis]=.9;h.input.pollPad();assert.ok(h.input.padAxis(axis)>0);
});
test('#681 unused axes may change while centered sticks and button rebase keep their owners',async()=>{
 const h=await rig();resetPlatformInput(h.input,h.controller);h.setPads(device([0,0,0,0,-1],'',[0]));h.input.pollPad();assert.equal(h.input.padButton(0),false);assert.equal(h.input.padPressed.size,0);
 h.setPads(device([0,0,0,0,1],'',[0]));h.input.pollPad();assert.equal(h.input._platformPadAxes,false);assert.equal(h.input.padButton(0),false);
 h.setPads(device([0,0,0,0,1],''));h.input.pollPad();h.setPads(device([0,0,0,0,-1],'',[0]));h.input.pollPad();assert.equal(h.input.padPressed.has(0),true);assert.equal(h.input.padButton(0),true);
});
for(const hz of [30,60,120,144])test(`#676 disconnect/reconnect at ${hz}Hz cannot replay filtered camera turn`,async()=>{
 const h=await rig();h.setPads(device([0,0,1,.6]));for(let i=0;i<hz;i++){h.input.pollPad();h.controller.update(1/hz);h.input.endFrame();}assert.ok(h.controller.padLook.x>.8);
 assert.equal(h.controller.edgeT,0,'S3 uses steady right-stick yaw without the old edge timer');
 h.controller.edgeT=.4; // Legacy transient must be retired on disconnection.
 h.rig.pitch=0; // Keep the comparison away from pitch clamp saturation.
 const before=[h.rig.yaw,h.rig.pitch];h.setPads([]);for(let i=0;i<hz;i++){h.input.pollPad();h.controller.update(1/hz);}
 assert.equal(h.controller.padLook.x,0);assert.equal(h.controller.padLook.y,0);assert.equal(h.controller.edgeT,0);assert.deepEqual([h.rig.yaw,h.rig.pitch],before);
 h.setPads(device());h.input.pollPad();h.controller.update(1/hz);assert.deepEqual([h.rig.yaw,h.rig.pitch],before);
 h.setPads(device([0,0,.8,.4]));h.input.pollPad();h.controller.update(1/hz);assert.notEqual(h.rig.yaw,before[0]);assert.notEqual(h.rig.pitch,before[1]);
});
test('#676 absent pad clears only pad filters while mouse look remains live',async()=>{
 const h=await rig();h.controller.padLook.x=.8;h.controller.padLook.y=.4;h.controller.edgeT=.5;h.input.mouse.dx=20;h.input.mouse.dy=5;h.setPads([]);h.input.pollPad();h.controller.update(STEP);
 assert.equal(h.controller.padLook.x,0);assert.equal(h.controller.padLook.y,0);assert.equal(h.controller.edgeT,0);assert.notEqual(h.rig.yaw,0);assert.notEqual(h.rig.pitch,0);
});

test('#676 player disconnect anchor is unique and fails closed on duplicate application',()=>{const rel='src/game/player.js',raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');assert.throws(()=>adaptInput(rel,''),/conflict/);assert.throws(()=>adaptInput(rel,raw+raw),/conflict/);assert.throws(()=>adaptInput(rel,adaptInput(rel,raw)),/conflict/);});
if(mapAdapter)test('#676 composes with the existing #701 Map owner in both source orders and at disconnect',async()=>{
 const rel='src/game/player.js',raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
 assert.equal(adaptInput(rel,mapAdapter.adaptMapLook(rel,raw)),mapAdapter.adaptMapLook(rel,adaptInput(rel,raw)));
 const h=await rig();h.setPads(device([0,0,1,0]));for(let i=0;i<30;i++){h.input.pollPad();h.controller.update(STEP);}
 h.rig.mapK=1;h.controller.update(STEP);const yaw=h.rig.yaw;assert.ok(h.controller.padLook.x>0);
 h.setPads([]);h.input.pollPad();h.controller.update(STEP);assert.equal(h.controller.padLook.x,0);assert.equal(h.controller.edgeT,0);assert.equal(h.rig.yaw,yaw);
 h.setPads(device());h.input.pollPad();h.controller.update(STEP);h.rig.mapK=0;h.controller.update(STEP);assert.equal(h.rig.yaw,yaw);
 h.setPads(device([0,0,1,0]));h.input.pollPad();h.controller.update(STEP);assert.notEqual(h.rig.yaw,yaw);
});
