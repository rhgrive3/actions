import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {captureRainmaker,captureRainmakerModel,validateRainmakerCapture} from './capture-rainmaker.mjs';
const source=fs.readFileSync(new URL('./capture-rainmaker.mjs',import.meta.url),'utf8');
const a=source.indexOf('const charOwner='),b=source.indexOf(';owned.push(charOwner);',a);assert.ok(a>=0&&b>a);
const owner=(scene,ch)=>Function('scene','ch','return ('+source.slice(a+'const charOwner='.length,b)+');')(scene,ch);
function fixture(removeError,disposeError){const calls=[],root={};return {calls,root,scene:{remove(r){assert.equal(r,root);calls.push('remove');if(removeError)throw removeError;}},ch:{root,dispose(){calls.push('dispose');if(disposeError)throw disposeError;}}};}
test('final Character cleanup success calls remove then dispose exactly once',()=>{const f=fixture();owner(f.scene,f.ch).dispose();assert.deepEqual(f.calls,['remove','dispose']);});
test('remove failure still attempts Character disposal and preserves original error identity',()=>{const error=Error('remove failure'),f=fixture(error);assert.throws(()=>owner(f.scene,f.ch).dispose(),e=>e===error);assert.deepEqual(f.calls,['remove','dispose']);});
test('Character disposal failure retains its original identity',()=>{const error=Error('dispose failure'),f=fixture(null,error);assert.throws(()=>owner(f.scene,f.ch).dispose(),e=>e===error);assert.deepEqual(f.calls,['remove','dispose']);});
test('simultaneous remove and Character disposal failures preserve both errors',()=>{const a=Error('remove failure'),b=Error('dispose failure'),f=fixture(a,b);assert.throws(()=>owner(f.scene,f.ch).dispose(),e=>e instanceof AggregateError&&e.errors.length===2&&e.errors[0]===a&&e.errors[1]===b);assert.deepEqual(f.calls,['remove','dispose']);});
test('shared launcher exports serialize to self-contained callable functions',()=>{assert.equal(captureRainmaker,captureRainmakerModel);assert.equal(typeof (0,eval)('('+captureRainmaker.toString()+')'),'function');assert.equal(typeof (0,eval)('('+validateRainmakerCapture.toString()+')'),'function');});
