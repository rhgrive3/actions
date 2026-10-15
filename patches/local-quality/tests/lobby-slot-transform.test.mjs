import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptLobbySlotTransform} from '../lobby-slot-transform-adapter.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
const source=adaptBuildSource('src/ui/menus.js',raw);

const start=source.indexOf('          const bots = lob.bots !== false;\n          for (const O of open) {');
const end=source.indexOf('\n        }\n        S.age += dt;',start);
assert(start>0&&end>start); const original=source.slice(start,end);
const anchor='if (a) O.el.style.transform = `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0) scale(${clamp(a.s || 1, 0.6, 1.25).toFixed(3)})`;';

const replacement='if (a) { const transform = `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0) scale(${clamp(a.s || 1, 0.6, 1.25).toFixed(3)})`; if (transform !== O._slotTransform || O.el.style.transform !== O._slotAppliedTransform) { O.el.style.transform = transform; O._slotTransform = transform; O._slotAppliedTransform = O.el.style.transform; } }';
assert.equal(original.includes(replacement),true);
const candidate=original;
const baseline=original.replace(replacement,anchor);
const run=code=>new Function('sc','open','lob','S','A','clamp','GLYPHS',code);
const aRun=run(baseline),bRun=run(candidate);
function fixture(normalize=v=>v){const counts={writes:0,anchors:0};const slots=Array.from({length:8},(_,i)=>{let transform=''; const classes=new Map();return {row:i>>2,i:i&3,el:{style:{get transform(){return transform},set transform(v){counts.writes++;transform=normalize(v)}},classList:{toggle(k,v){classes.set(k,v)}},querySelector(){return this.plus},plus:{innerHTML:''}},txt:{textContent:''},classes};});return {counts,slots};}
function compare(frames,normalize){const a=fixture(normalize),b=fixture(normalize);for(let t=0;t<frames.length;t++){const f=frames[t];if(f.external)for(const x of[a,b])for(const o of x.slots)o.el.style.transform=f.external;for(const [x,fn]of[[a,aRun],[b,bRun]]){const sc={lobbySlotAnchor(row,i){x.counts.anchors++;return f.anchor(i)}};fn(sc,x.slots,{bots:f.bots},{launching:f.launching},{},(v,min,max)=>Math.max(min,Math.min(max,v)),{bot:'B',plus:'+'});}assert.deepEqual(a.slots.map(view),b.slots.map(view));}assert.equal(a.counts.anchors,b.counts.anchors);return{baseline:a.counts,candidate:b.counts};}
function view(o){return {transform:o.el.style.transform,on:o.on,sig:o.sig,text:o.txt.textContent,plus:o.el.plus.innerHTML,classes:[...o.classes]};}
const stable=()=>({x:10.1,y:20.2,s:1,vis:1});
test('180 frames / 8 fixed slot anchors retain every frame while eliminating repeated assignments',()=>{const r=compare(Array.from({length:180},()=>({anchor:stable})));assert.equal(r.baseline.writes,1440);assert.equal(r.candidate.writes,8);console.log(JSON.stringify({scope:'repository-composed lobby block; controlled assignment counts, not browser/FPS',...r}));});
test('subpixel changes retain rounded CSS output',()=>{const r=compare(Array.from({length:180},(_,t)=>({anchor:i=>({x:10+t/1000,y:20+i,s:1+t/1e7,vis:1})})));assert.equal(r.candidate.writes,8);});
test('moving anchors, scale clamps, zero fallback and negative coordinates preserve output',()=>{compare(Array.from({length:180},(_,t)=>({anchor:i=>({x:t/2-i,y:-t/3,s:[0,.1,.8,1,2][t%5],vis:1})})));});
test('missing anchor / visibility / launching / bots transitions preserve classes and content',()=>{compare(Array.from({length:180},(_,t)=>({anchor:i=>t%7===0?null:{x:t%5,y:i,s:1,vis:t%3===0?0:1},launching:t%11===0,bots:t%2===0})));});
test('fresh slot lifecycle writes initial transform again',()=>{for(let i=0;i<3;i++)assert.equal(compare([{anchor:stable}]).candidate.writes,8);});

test('external inline transform is repaired and CSSOM serialization normalization does not defeat the cache',()=>{const r=compare([{anchor:stable},{anchor:stable},{anchor:stable,external:'none'},{anchor:stable}],v=>v.replaceAll(',',', '));assert.equal(r.candidate.writes,24);assert.equal(r.baseline.writes,40);});

test('identical anchor survives null, hidden, launching and bot transitions',()=>{const r=compare([{anchor:stable},{anchor:()=>null},{anchor:stable},{anchor:()=>({...stable(),vis:0})},{anchor:stable,launching:true},{anchor:stable,bots:false},{anchor:stable,bots:true}]);assert.equal(r.candidate.writes,8);assert.equal(r.baseline.writes,48);});

test('adapter is scoped and rejects missing, duplicate and already adapted anchors',()=>{assert.equal(adaptLobbySlotTransform('src/ui/hud.js',anchor),anchor);assert.throws(()=>adaptLobbySlotTransform('src/ui/menus.js',''),/exactly one/);assert.throws(()=>adaptLobbySlotTransform('src/ui/menus.js',anchor+anchor),/exactly one/);assert.throws(()=>adaptLobbySlotTransform('src/ui/menus.js',replacement),/exactly one/);});
test('fresh full composition is deterministic and re-composing output fails closed',()=>{assert.equal(adaptBuildSource('src/ui/menus.js',raw),source);assert.throws(()=>adaptBuildSource('src/ui/menus.js',source));});

test('quality adapter hook and build identity include the helper exactly once', async()=>{const adapter=fs.readFileSync(new URL('../adapter.mjs',import.meta.url),'utf8');assert.equal(adapter.split('code = adaptLobbySlotTransform(rel, code);').length,2);const identity=adapter.slice(adapter.indexOf('const IDENTITY_FILES = ['),adapter.indexOf('export function replaceOnce'));assert.equal(identity.split("'lobby-slot-transform-adapter.mjs'").length,2);assert.equal(source.split(replacement).length,2);assert.equal(source.includes(anchor),false);});
