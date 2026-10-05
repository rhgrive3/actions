import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
import {fixture} from './weapon-edgecases-fixture.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`),fp=(a,f)=>a.s3.flow.score/f.profile.flow.threshold*100;
async function cpuPaint(){const root=new URL('../../../',import.meta.url).pathname,base=process.env.INKWAVE_EDGECASE_SITE?path.resolve(process.env.INKWAVE_EDGECASE_SITE):path.join(root,'inkwave-public'),mods=new Map(),context=vm.createContext({console,performance});function load(file){if(mods.has(file))return mods.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});mods.set(file,m);return m;}const m=load(path.join(base,'src/world/paint.js'));await m.link((s,p)=>load(s==='three'?path.join(base,'vendor/three/build/three.module.js'):path.resolve(path.dirname(p.identifier),s)));await m.evaluate();const paint=Object.create(m.namespace.PaintSystem.prototype);Object.assign(paint,{grid:new Uint8Array(100),dead:new Uint8Array(100),counts:[0,0],version:0});const face={nu:10,nv:10,cu:1,cv:1,grid:0,turf:true};return {paint,splat:team=>paint._cpuSplat(face,5,5,100,team,.5,0,0,0,0)};}
test('#520 native Actor turf events award 0.8fp per10 displayed turf units without changing stats or special',async()=>{
 const f=await fixture();for(const points of [10,100,.5]){const a=f.make('shooter');a.addTurf(points);near(fp(a,f),points*.08);near(a.stats.turf,points);near(a.special,points);assert.equal(a.s3.flow.active,false);}
});
test('#520 actual CPU ownership repaint returns zero and cannot award Flow or special twice',async()=>{
 const f=await fixture(),a=f.make('shooter'),cpu=await cpuPaint();const first=cpu.splat(0);assert.equal(first,100);a.addTurf(first);near(fp(a,f),8);const repeat=cpu.splat(0);assert.equal(repeat,0);a.addTurf(repeat);near(fp(a,f),8);near(a.special,100);near(a.stats.turf,100);assert.deepEqual(cpu.paint.counts,[100,0]);
});
test('#520 turf alone can cross the activation threshold but waits for a splat',async()=>{
 const f=await fixture(),a=f.make('shooter'),e=f.make('shooter');e.team=1;a.addTurf(1300);near(fp(a,f),104);assert.equal(a.s3.flow.active,false);f.emit('splatted',{victim:e,attacker:a,cause:'shooter'});assert.equal(a.s3.flow.active,true);
});
test('#500 accepted enemy damage alone grants no Flow and does not reset idle decay time',async()=>{
 const f=await fixture(),a=f.make('shooter'),e=f.make('shooter');e.team=1;e.invuln=0;a.s3.flow.score=.6;a.s3.flow.idleTime=4.8;for(const amount of [1,10,25]){e.damage(amount,a,'shooter');near(a.s3.flow.score,.6);near(a.s3.flow.idleTime,4.8);}near(e.hp,64);assert.equal(a.s3.flow.active,false);
});
test('#500 damage assist credit survives, even though immediate damage awards are disabled',async()=>{
 const f=await fixture(),a=f.make('shooter'),killer=f.make('shooter'),e=f.make('shooter');e.team=1;e.invuln=0;e.damage(20,a,'shooter');near(fp(a,f),0);e.damage(100,killer,'shooter');near(a.s3.flow.score,f.profile.flow.weights.assist);assert.equal(a.s3.flow.active,false);assert.ok(killer.s3.flow.score>0||killer.s3.flow.active);
});
test('#500 active Flow ignores damage while retaining the existing assist extension',async()=>{
 const f=await fixture(),a=f.make('shooter'),killer=f.make('shooter'),e=f.make('shooter');e.team=1;e.invuln=0;Object.assign(a.s3.flow,{active:true,remaining:10,score:0});e.damage(10,a,'shooter');near(a.s3.flow.remaining,10);e.damage(100,killer,'shooter');near(a.s3.flow.remaining,Math.min(f.profile.flow.maxDuration,10+f.profile.flow.extension));
});
