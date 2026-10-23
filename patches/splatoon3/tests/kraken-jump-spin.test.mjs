import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {transform}=require(process.env.ESBUILD_MODULE || 'esbuild');
const {adaptBuildSource}=await import('../../../scripts/inkwave-source-composition.mjs');
const {compactModuleStrings}=await import('../../../scripts/lib/inkwave-source-compaction.mjs');
const base=process.env.KRAKEN_VFX_BASELINE;
const candidate=new URL('../runtime/special-vfx.mjs',import.meta.url);
async function load(file, emitted){
 let source=fs.readFileSync(file || candidate,'utf8');
 if(!file){const start=source.indexOf('      // Retail jump-spin strands:');const end=source.indexOf("      if (t.phase === 'charge')",start);assert.ok(start>0&&end>start);source=source.slice(0,start)+source.slice(end);const cleanup=' endFilaments(this, t.d.jumpRibs); t.d.jumpRibs = null;';assert.ok(source.includes(cleanup));source=source.replace(cleanup,'');}
 source+='\nexport {Director as TestDirector, DIRECTORS as TestDirectors};';
 if(emitted) source=compactModuleStrings((await transform(adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs',source),{format:'esm',minify:true,charset:'utf8',legalComments:'inline'})).code).code;
 const context=vm.createContext({console});
 const imports=new Map();
 for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) imports.set(match[2],match[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]));
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>new vm.SyntheticModule(imports.get(spec),function(){for(const name of imports.get(spec))this.setExport(name,name==='vfxRandom'?()=>.95:name==='RIBBON'?{INK:1,GLOW:2}:()=>{});},{context}));
 await module.evaluate();return module.namespace;
}
const kit= new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/special-vfx-kit.mjs',import.meta.url),'utf8')+'\nexport {RibbonPool};');await kit.link(()=>{throw Error('unexpected import')});await kit.evaluate();
const Pool=kit.namespace.RibbonPool;
const results=[];
for(const [label,file] of [['baseline',base],['candidate',candidate]])for(const emitted of [false,true]){
 const {TestDirector:Director,TestDirectors:directors}=await load(file,emitted);const spec=directors.krakenRoyale;
 let passed=0,failed=0;const run=(name,fn)=>{try{fn();passed++;results.push({label,emitted,name,pass:true});}catch(e){failed++;results.push({label,emitted,name,pass:false,error:e.message});}};
 function fixture(){const ink=Object.assign(Object.create(Pool.prototype),{list:[],T:64,M:64}),glow=Object.assign(Object.create(Pool.prototype),{list:[],T:64,M:64});const d=Object.assign(Object.create(Director.prototype),{kit:{ribbons:ink,glowRibbons:glow,time:1},tracks:new Map(),errors:0,time:1,v:Array.from({length:8},()=>({x:0,y:0,z:1,set(x,y,z){Object.assign(this,{x,y,z});return this;}})),forward(){return {x:0,z:1}},ribbon(add,o){return (add?glow:ink).start(o)}});
 const a={alive:true,remote:false,pos:{x:0,y:2,z:0},grounded:false,climbing:false,specialActive:{id:'krakenRoyale'},_s3AllSpecialState:{id:'krakenRoyale',jumpAttack:true,phase:'active'}},t={id:'krakenRoyale',phase:'active',color:[1,0,0],d:{}};d.tracks.set(a,t);return {d,a,t,ink,glow};}
 const step=(f,dt=1/60)=>{spec.frame.call(f.d,f.a,f.t,dt);f.d.kit.time+=dt;};
 run('admitted airborne attack creates eight bounded strands',()=>{const f=fixture();const actor=JSON.stringify(f.a);step(f);assert.equal(f.t.d.jumpRibs?.length,8);for(let i=0;i<120;i++)step(f);assert.equal(f.ink.list.length+f.glow.list.length,8);assert.ok([...f.ink.list,...f.glow.list].every(r=>r.pts.length<=64));assert.equal(JSON.stringify(f.a),actor);});
 run('zero dt cannot create or advance spin',()=>{const f=fixture();step(f,0);assert.equal(f.t.d.jumpRibs,undefined);step(f);assert.ok(f.t.d.jumpRibs);const before=JSON.stringify(f.t.d.jumpRibs);step(f,0);assert.equal(JSON.stringify(f.t.d.jumpRibs),before);});
 run('retire on contact climbing cancellation finish and charge/dash',()=>{for(const cause of ['ground','climb','cancel','finish','charge','dash']){const f=fixture();step(f);const ribs=f.t.d.jumpRibs;assert.ok(ribs);if(cause==='ground')f.a.grounded=true;else if(cause==='climb')f.a.climbing=true;else if(cause==='cancel')f.a._s3AllSpecialState.jumpAttack=false;else f.a._s3AllSpecialState.phase=cause;step(f);assert.equal(f.t.d.jumpRibs,null);assert.ok(ribs.every(q=>q.r.ended));}});
 run('death recall expiry and actor retirement end all spin records',()=>{for(const cause of ['death','recall','expiry','remove']){const f=fixture();step(f);const ribs=f.t.d.jumpRibs;assert.ok(ribs);if(cause==='remove')f.d.endTrack(f.a,f.t);else{if(cause==='death')f.a.alive=false;if(cause==='recall')f.a.superJumpState={};if(cause==='expiry')f.a.specialActive=null;f.d.track(f.a);}assert.ok(ribs.every(q=>q.r.ended));assert.equal(f.t.d.jumpRibs,null);assert.equal(f.d.errors,0);}});
 run('nonattack normal jump remote wrong special startup grounded negatives',()=>{for(const cause of ['nonattack','remote','wrong','startup','ground']){const f=fixture();if(cause==='nonattack')f.a._s3AllSpecialState.jumpAttack=false;if(cause==='remote')f.a.remote=true;if(cause==='wrong')f.a._s3AllSpecialState.id='inkjet';if(cause==='startup')f.a._s3AllSpecialState.phase='startup';if(cause==='ground')f.a.grounded=true;step(f);assert.equal(f.t.d.jumpRibs,undefined);assert.equal(f.ink.list.length+f.glow.list.length,0);}});
 run('repeated jumps respect real pool capacity and prior retirement',()=>{const f=fixture();for(let j=0;j<100;j++){f.a.grounded=false;step(f);const ribs=f.t.d.jumpRibs;assert.ok(ribs);f.a.grounded=true;step(f);assert.ok(ribs.every(q=>q.r.ended));}assert.ok(f.ink.list.length<=64&&f.glow.list.length<=64);});
 run('equal elapsed rotation at 30 60 120 Hz',()=>{let reference;for(const hz of [30,60,120]){const f=fixture();for(let i=0;i<hz;i++)step(f,1/hz);assert.ok(f.t.d.jumpRibs);const angles=f.t.d.jumpRibs.map(q=>q.ang);if(reference)angles.forEach((a,i)=>assert.ok(Math.abs(a-reference[i])<1e-10));else reference=angles;}});
 console.log(label,emitted?'production-transform':'source',passed,'pass',failed,'fail');
}
if(process.env.KRAKEN_VFX_RECEIPT) fs.writeFileSync(process.env.KRAKEN_VFX_RECEIPT,JSON.stringify(results,null,2));assert.equal(results.filter(r=>r.label==='candidate'&&!r.pass).length,0);assert.equal(results.filter(r=>r.label==='baseline'&&!r.pass).length,12);
