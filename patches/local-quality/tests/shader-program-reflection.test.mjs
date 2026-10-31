import test from 'node:test';
import assert from 'node:assert/strict';
import {warmProgramReflection} from '../shader-program-reflection.mjs';

test('warms each ready compiled program once per call, leaving unready variants alone', () => {
  const material = {}, calls = [];
  const ready = {isReady:()=>true,getUniforms:()=>calls.push('ready')};
  const pending = {isReady:()=>false,getUniforms:()=>calls.push('pending')};
  const duplicate = new Map([['back', ready], ['front', ready], ['pending', pending]]);
  const renderer = {extensions:{has:name=>name==='KHR_parallel_shader_compile'},getContext:()=>({isContextLost:()=>false}),properties:{get:m=>m===material?{programs:duplicate}:undefined}};
  assert.equal(warmProgramReflection(renderer, material), 1);
  assert.deepEqual(calls, ['ready']);
});

test('is a safe no-op for unavailable, disposed, lost and unsupported renderers', () => {
  const mat = {}; let calls = 0, readinessChecks = 0;
  const program = {isReady:()=>{readinessChecks++;return true;},getUniforms:()=>calls++};
  const ext = {has:name=>name==='KHR_parallel_shader_compile'};
  const gl = {isContextLost:()=>false};
  assert.equal(warmProgramReflection(null, mat), 0);
  assert.equal(warmProgramReflection({extensions:{has:()=>false},getContext:()=>gl,properties:{get:()=>({programs:new Map([['p', program]])})}}, mat), 0, 'no extension must not query reflection');
  assert.equal(warmProgramReflection({extensions:ext,getContext:()=>gl,properties:{get:()=>({})}}, mat), 0);
  assert.equal(warmProgramReflection({extensions:ext,getContext:()=>({isContextLost:()=>true}),properties:{get:()=>({programs:new Map([['p', program]])})}}, mat), 0);
  assert.equal(warmProgramReflection({extensions:ext,getContext:()=>gl,properties:{get:()=>{throw Error('disposed');}}}, mat), 0);
  assert.equal(warmProgramReflection({extensions:ext,getContext:()=>gl,properties:{get:()=>({programs:new Map([['p',{isReady:()=>true,getUniforms:()=>{throw Error('driver');}}]])})}}, mat), 0);
  assert.equal(warmProgramReflection({extensions:ext,getContext:()=>gl,properties:{get:()=>({programs:new Proxy(new Map(), {})})}}, mat), 0);
  assert.equal(calls, 0); assert.equal(readinessChecks, 0, 'unsupported and lost contexts do not check programs');
});
