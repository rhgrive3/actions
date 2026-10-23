import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {transform}=require(process.env.ESBUILD_MODULE || 'esbuild');
const {adaptBuildSource}=await import('../../../scripts/inkwave-source-composition.mjs');
const {compactModuleStrings}=await import('../../../scripts/lib/inkwave-source-compaction.mjs');
const base=process.env.ZIPCASTER_VFX_BASELINE;
const candidate=new URL('../runtime/special-vfx.mjs', import.meta.url);
const hook='    end(a, t) {\n      if (t.d.trail) { this.kit.ribbons.end(t.d.trail); t.d.trail = null; }\n    },';
async function load(file, emitted){
 let source=fs.readFileSync(file || candidate,'utf8');
 if (!file) { assert.ok(source.includes(hook)); source=source.replace(hook,''); }
 source+='\nexport {Director as TestDirector};';
 if(emitted) source=compactModuleStrings((await transform(adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs',source),{format:'esm',minify:true,charset:'utf8',legalComments:'inline'})).code).code;
 const context=vm.createContext({console});
 const imports=new Map();
 for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) imports.set(match[2],match[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]));
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>new vm.SyntheticModule(imports.get(spec),function(){for(const name of imports.get(spec))this.setExport(name,()=>{});},{context}));
 await module.evaluate();return module.namespace.TestDirector;
}
const results=[];
for(const [label,file] of [['baseline',base],['candidate',candidate]])for(const emitted of [false,true]){
 const Director=await load(file,emitted); let passed=0,failed=0;
 const run=(name,fn)=>{try{fn();passed++;results.push({label,emitted,name,pass:true});}catch(e){failed++;results.push({label,emitted,name,pass:false,error:e.message});}};
 function fixture(){const d=Object.create(Director.prototype),r={ended:false},rec={dead:false},a={alive:true,specialActive:{id:'zipcaster'}};
 Object.assign(d,{tracks:new Map(),errors:0,kit:{ribbons:{end(x){if(x)x.ended=true;}},glowRibbons:{end(){}}},rgb(){return [1,0,0];},time:1});
 const t={id:'zipcaster',d:{trail:r,recs:[rec]}};d.tracks.set(a,t);return {d,r,rec,a,t};}
 for(const cause of ['expiry','death','recall'])run(cause,()=>{const {d,r,rec,a,t}=fixture();if(cause==='expiry')a.specialActive=null;if(cause==='death')a.alive=false;if(cause==='recall')a.superJumpState={};d.track(a);assert.equal(r.ended,true);assert.equal(t.d.trail,null);assert.equal(rec.dead,true);assert.equal(d.tracks.size,0);assert.equal(d.errors,0);});
 run('direct retirement and repeated teardown',()=>{const {d,r,t}=fixture();d.endTrack({},t);d.endTrack({},t);assert.equal(r.ended,true);assert.equal(d.errors,0);});
 run('live track remains untouched',()=>{const {d,r,a,t}=fixture();assert.equal(d.track(a),t);assert.equal(r.ended,false);});
 run('no trail negative control',()=>{const {d,t}=fixture();delete t.d.trail;d.endTrack({},t);assert.equal(d.errors,0);});
 run('unrelated special negative control',()=>{const {d,r,t}=fixture();t.id='not-a-special';d.endTrack({},t);assert.equal(r.ended,false);});
 console.log(label,emitted?'esbuild-emitted':'source',passed,'pass',failed,'fail');
}
if (process.env.ZIPCASTER_VFX_RECEIPT) fs.writeFileSync(process.env.ZIPCASTER_VFX_RECEIPT,JSON.stringify(results,null,2));
assert.equal(results.filter(r=>r.label==='candidate'&&!r.pass).length,0);
assert.equal(results.filter(r=>r.label==='baseline'&&!r.pass).length,8);
