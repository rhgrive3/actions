import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import path from 'node:path';import {runPassProbe} from '../lib/inkwave-wiper-pass-probe.mjs';
const root=process.env.WIPER_SOURCE_ROOT||'/workspace/shared/iwphase';
function method(pathname,start,end,globals){const source=fs.readFileSync(path.join(root,pathname),'utf8');const begin=source.indexOf(start);assert.notEqual(begin,-1,`source method start absent: ${pathname}`);const finish=source.indexOf(end,begin);assert.notEqual(finish,-1,`source method end absent: ${pathname}`);const body=source.slice(begin,finish+end.indexOf('}')+1).trim();return {run:vm.runInNewContext('({'+body+'}).render',globals),sha256:crypto.createHash('sha256').update(source).digest('hex')};}
const compSource=method('inkwave-public/vendor/three/jsm/postprocessing/EffectComposer.js','\n\trender( deltaTime ) {','\n\t}\n',{MaskPass:class MaskPass{},ClearMaskPass:class ClearMaskPass{}});
const rendererSource=method('inkwave-public/src/core/renderer.js','\n  render() {','\n  }\n}',{G:{env:null}});
test('actual source R.render + EffectComposer.render stops at first failing pass and preserves wrappers',()=>{
 const calls=[];let pending=0;const gl={NO_ERROR:0,getError(){const e=pending;pending=0;return e;}};
 const first={enabled:true,needsSwap:false,render(){calls.push('first');pending=0x502;}},second={enabled:true,needsSwap:false,render(){calls.push('second');}};
 const native={getRenderTarget(){return null;},setRenderTarget(){calls.push('restore-target');}};
 const composer={render:compSource.run,passes:[first,second],timer:{update(){},getDelta(){return 1/60;}},renderer:native,renderToScreen:true,isLastEnabledPass(){return false;}};
 const renderer={render:rendererSource.run,composer,resize(){calls.push('resize');},_contextLost:false};const p0=first.render,p1=second.render,co=composer.render;
 const result=runPassProbe(gl,renderer);assert.equal(result.error.kind,'gl-error');assert.equal(result.state.failure.code,0x502);assert.equal(result.state.failure.boundary,'after-pass[0]');assert.deepEqual(calls,['resize','first']);assert.equal(first.render,p0);assert.equal(second.render,p1);assert.equal(composer.render,co);assert.equal(result.state.coverage.composerCalls,1);assert.equal(result.state.coverage.passItemsSame,true);
 console.log('source sha256 renderer='+rendererSource.sha256+' composer='+compSource.sha256);
});
test('actual source context-lost early return cannot appear covered',()=>{const renderer={render:rendererSource.run,composer:{passes:[],render(){}},resize(){throw Error('must not run')},_contextLost:true};const gl={NO_ERROR:0,getError(){return 0;}};const r=runPassProbe(gl,renderer);assert.equal(r.ok,false);assert.equal(r.error.kind,'composer-call-count');assert.equal(r.state.coverage.composerCalls,0);});
