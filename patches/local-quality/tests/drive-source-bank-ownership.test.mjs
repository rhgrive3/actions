import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const rel='src/game/motion/source-bank.js';
const code=adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'))
  .replace("from 'three'",`from '${new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url).href}'`);
const {SourceBank,SourcePose}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('same-clip sample must restore public raw and observe mutable base translations',()=>{
  const data=new Float32Array([1,1,1,2,3,4,0,0,0,1]);
  const meta={byteLength:data.byteLength,bones:[{name:'root',parent:-1,flags:0,scale:[1,1,1],translation:[0,0,0],rotation:[0,0,0,1]}],
    clips:[{name:'idle',base:0,curves:10,curveCount:0,frames:60,loop:true,boneFlags:[0],rotationMode:'eulerXYZ'}]};
  const bank=new SourceBank(meta,data.buffer),pose=new SourcePose(bank);
  bank.sample('idle',0,pose);assert.equal(pose.p[0].x,2);
  pose.raw[3]=987;bank.sample('idle',1,pose);assert.equal(pose.raw[3],2,'raw is publicly mutable and the next sample restores it');
  bank.data[3]=7;bank.sample('idle',2,pose);assert.equal(pose.p[0].x,7,'same clip baseView sees a bank write without a revision');
  pose.rest();assert.equal(pose.raw[3],0);bank.sample('idle',3,pose);assert.equal(pose.p[0].x,7,'rest does not preserve the clip base');
  assert.equal(Object.isFrozen(pose),false);assert.equal(Object.isFrozen(bank),false);
});
