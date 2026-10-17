import assert from 'node:assert/strict';
import {observe1430} from './observe.mjs';
const listeners=new Map();globalThis.document={addEventListener(type,fn,capture){listeners.set(type+capture,fn)},removeEventListener(type,fn,capture){assert.equal(listeners.get(type+capture),fn);listeners.delete(type+capture)}};
let calls=0;const receiver={};const thrown=Error('native error');const native=function(value){assert.equal(this,receiver);calls++;if(value==='throw')throw thrown;return value};
globalThis.window={advance:native,mobile:{pressed:new Set(),buttons:{fire:false},_ptr:new Map(),moveX:0,moveY:0},input:{lastDevice:'touch',navigationDevice:'touch'},actionDodges:0};
observe1430();assert.equal(listeners.size,6);assert.equal(window.advance.call(receiver,42),42);assert.equal(calls,1);assert.throws(()=>window.advance.call(receiver,'throw'),e=>e===thrown);assert.equal(calls,2);assert.equal(window.issue1430Rows.filter(x=>x.kind==='after-advance').length,2);window.stopIssue1430Observation();assert.equal(window.advance,native);assert.equal(listeners.size,0);console.log('PASS observer receiver, arguments, return, exception, single invocation, cleanup');
