import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {minimapHarness} from './fixtures/added-minimap-harness.mjs';
import {installRankedUi} from '../runtime/ranked/ui.mjs';
import {captureFinishMapSnapshot} from '../runtime/turf-finish.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/ranked-added-before-8de71b09.json',import.meta.url)));
const url=new URL('../runtime/ranked/ui.mjs',import.meta.url);
const oldSource=frozen.files['patches/splatoon3/runtime/ranked/ui.mjs'].replace(/from (['"])(\.[^'"]+)\1/g,(_,q,p)=>`from ${q}${new URL(p,url).href}${q}`);
// Keep the sealed Drive fixture intact. Normalize only its known incorrect
// checkpoint formula; all route cache, cadence and Canvas commands stay old.
function referenceCheckpoint(stage,team,progress) {
 if((team!==0&&team!==1)||!Number.isFinite(progress))return null;
 let points=(Array.isArray(stage?.tower?.path)?stage.tower.path:[]).filter(p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite));
 if(points.length<2)points=[[-1,0,0],[0,0,0],[1,0,0]];
 const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(...[0,1,2].map(a=>points[i][a]-points[i-1][a])));
 const total=distances.at(-1)||1, index=Number.isFinite(stage?.tower?.centerIndex)?Math.trunc(stage.tower.centerIndex):Math.floor(points.length/2);
 const center=distances[Math.max(0,Math.min(points.length-1,index))],p=Math.max(0,Math.min(1,progress));
 const target=team===0?center+p*(total-center):center-p*center;
 for(let i=1;i<points.length;i++)if(target<=distances[i]+1e-9){const span=distances[i]-distances[i-1],t=span>1e-9?Math.max(0,Math.min(1,(target-distances[i-1])/span)):0;return [0,1,2].map(a=>points[i-1][a]+(points[i][a]-points[i-1][a])*t);}
 return points.at(-1).slice(0,3);
}
const oldCheckpoint='const p = path[Math.round(clamp01(cp.progress) * Math.max(0, path.length - 1))];';
assert.equal(oldSource.split(oldCheckpoint).length,2,'normalize exactly one old checkpoint expression');
const normalizedSource=referenceCheckpoint.toString()+'\n'+oldSource.replace(oldCheckpoint,'const p = referenceCheckpoint(stage,t,cp?.progress);');
const {installRankedUi:oldInstall}=await import('data:text/javascript;base64,'+Buffer.from(normalizedSource).toString('base64'));
const {installRankedUi:unfixedInstall}=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
test('negative control: sealed old vertex-index checkpoint projection differs from corrected physical route',()=>{
 const a=minimapHarness(unfixedInstall),b=minimapHarness(oldInstall);
 for(const h of [a,b]){h.G.match.ranked=engine('tower');h.m.update(0,true);}
 assert.notDeepEqual(a.snapshot().output,b.snapshot().output);
});
const stage=()=>({zones:[{center:[1,0,1],size:[2,3]}],tower:{path:[[0,0,0],[1,0,1],[2,0,2]],centerIndex:1,checkpoints:[[{progress:.5}],[{progress:.75}]]},rainmaker:{center:[1,0,1],checkpoints:[[[0,0,1],[1,0,0]],[[3,0,3]]],goals:[[1,0,3],[3,0,1]]},clams:{goals:[[1,0,3],[3,0,1]]}});
const engine=mode=>({mode,stage:stage(),rule:{state:{zones:[{team:-1}],position:[1,0,1],controllingTeam:-1,pos:[1,0,1],carrier:null,checkpoint:{passed:[false,false],choice:[null,null],goalOpen:[false,false]},clams:[{kind:'small',pos:[1,0,1]}],inventories:{'a':{power:true}}}}});
const mutations={zones:[e=>e.rule.state.zones[0].team=0,e=>e.stage.zones[0].center[0]++,e=>e.stage.zones[0].size[0]++],tower:[e=>e.rule.state.position[0]++,e=>e.rule.state.controllingTeam=1,e=>e.stage.tower.path[1][2]++,e=>e.stage.tower.checkpoints[0][0].progress=.9],rainmaker:[e=>e.rule.state.pos[0]++,e=>{e.rule.state.carrier='a';e.rule.state.carrierTeam=1;},e=>{e.rule.state.checkpoint.passed[0]=true;e.rule.state.checkpoint.choice[0]=1;e.rule.state.checkpoint.goalOpen[0]=true;}],clams:[e=>e.rule.state.clams[0].pos[0]++,e=>e.rule.state.clams[0].kind='power',e=>e.rule.state.clams.pop(),e=>e.rule.state.inventories.a.power=false]};
for(const mode of Object.keys(mutations))test(`composed ${mode} overlay refreshes without paint at native cadence, including hidden/reopen and removal`,()=>{
 const old=minimapHarness(oldInstall),current=minimapHarness(installRankedUi);
 for(const h of [old,current]){h.G.match.ranked=engine(mode);h.G.match.actors=[{nid:'a',team:0,pos:{x:1,y:0,z:2}}];h.m.update(0,true);}
 for(const mutate of [(_e,h)=>h.G.match.actors[0].pos.x++,...mutations[mode],(_e,h)=>h.G.match.actors[0].pos.x++,(_e,h)=>h.m.flip=!h.m.flip]){
  for(const h of [old,current]){for(let i=0;i<15;i++)h.m.update(1/60);h.m._composeAcc=0;mutate(h.G.match.ranked,h);}
  const before=current.counts();for(let i=0;i<3;i++){old.m.update(1/120);current.m.update(1/120);}assert.equal(current.counts().composes,before.composes,'budget has not elapsed');
  old.m.update(1/120);current.m.update(1/120);
  // The actor-only movement is visible only in Clams while the inventory holds power.
  old.m.update(0,true);assert.deepEqual(current.snapshot().output,old.snapshot().output,'same final Canvas commands '+mode);
  assert.equal(current.counts().rasters,before.rasters,'objective work never draws ink');
 }
 const count=current.counts();for(let i=0;i<120;i++)current.m.update(1/60);assert.deepEqual(current.counts(),count,'stationary overlay sleeps');
 for(const h of [old,current]){h.G.match.ranked.rule.state.pos=[2,0,3];h.G.match.ranked.rule.state.position=[3,0,2];h.G.match.ranked.rule.state.zones[0].team=1;h.G.match.ranked.rule.state.clams.push({kind:'power',pos:[3,0,2]});for(let i=0;i<10;i++)h.m.tickHidden(1/60);h.m.update(1/30);}
 old.m.update(0,true);assert.deepEqual(current.snapshot().output,old.snapshot().output,'hidden/reopen');
 const before=current.counts();for(const h of [old,current]){delete h.G.match.ranked;h.m.update(1/30);}old.m.update(0,true);assert.deepEqual(current.snapshot().output,old.snapshot().output,'old overlay erased');assert.equal(current.counts().rasters,before.rasters);assert.equal(current.counts().composes,before.composes+1);
});
test('Tower projection cache preserves exact current path and invalidates stage, route, resize, flip and bounds',()=>{
 function harness(install){let projected=0;const commands=[];const ctx=new Proxy({}, {get:(o,k)=>o[k]||((...args)=>commands.push([k,...args])),set:(o,k,v)=>{o[k]=v;commands.push(['set',k,v]);return true;}});
  class Minimap{constructor(){this.ctx=ctx;this.s=2;this.w=this.h=40;this.flip=false;this.level={bounds:{maxX:10,maxZ:10,minX:-10,minZ:-10}};}toCanvas(x,z,out){projected++;out.x=(this.level.bounds.maxX-x)*this.s;out.y=(this.level.bounds.maxZ-z)*this.s;if(this.flip){out.x=this.w-out.x;out.y=this.h-out.y;}return out;}_compose(){commands.length=0;}}
  const G={match:{ranked:engine('tower')},teamHex:['#abc','#def']};install({G,Minimap});return{G,m:new Minimap(),commands,projections:()=>projected};}
 const a=harness(oldInstall),b=harness(installRankedUi);
 const changes=[()=>{},()=>{},h=>h.m.flip=true,h=>h.m.s=3,h=>h.m.w=50,h=>h.m.h=60,h=>{const project=h.m.toCanvas;h.m.toCanvas=function(...args){return project.apply(this,args);};},h=>h.m.level={bounds:{...h.m.level.bounds}},h=>h.m.level.bounds.maxX++,h=>h.G.match.ranked.stage.tower.path[1][0]++,h=>h.G.match.ranked.stage.tower.path=h.G.match.ranked.stage.tower.path.map(p=>[...p]),h=>h.G.match.ranked.stage=structuredClone(h.G.match.ranked.stage),h=>h.G.match.ranked.stage.tower.path=[null,[1,0,1],[2,0,2]]];
 for(const change of changes){for(const h of[a,b]){change(h);h.m._compose(1/30);}assert.deepEqual(b.commands,a.commands);}
 assert.ok(b.projections()<a.projections(),'stationary route skips projection and per-node output object');
});
test('actual composed finish preserves one-pass idle and bounded pending-band fallback counts',()=>{
 for(const band of [0,1,2]){const h=minimapHarness();h.m.canvas.toDataURL=()=> 'data:image/png;base64,'+'A'.repeat(100);h.m._band=band;
 const before=h.counts();assert.ok(captureFinishMapSnapshot({},h.m));assert.equal(h.counts().composes-before.composes,band===0?1:4-band);assert.equal(h.counts().rasters-before.rasters,band===0?1:4-band);assert.equal(h.m._band,0);}
 const h=minimapHarness();h.paint.grid.fill(1);h.paint.version++;h.paint.inkDirty.full=false;h.paint._inkMark(h.face,1,1);h.m.update(.2);assert.equal(h.m._band,1,'composed large dirty rectangle still starts a real band refresh');
});
test('legacy pending-band finalization cannot drop intermediate ownership writes losslessly',()=>{
 const a=minimapHarness(),b=minimapHarness();for(const h of[a,b]){h.paint.grid.fill(1);h.paint.version++;h.m._band=1;h.m._composeAcc=.1;h.events['bomb:explode']({pos:{x:1,z:1},team:0,radius:2});}
 while(a.m._band>0)a.m.update(0,true);a.m.update(0,true);
 // Negative control of the proposed one-full-draw path; keep production legacy fallback.
 b.m._band=0;b.m.update(0,true);
 assert.deepEqual(Array.from(b.m.owner),Array.from(a.m.owner));assert.deepEqual(Array.from(b.m.inkImg.data),Array.from(a.m.inkImg.data));
 assert.notDeepEqual(Array.from(b.m.flashImg.data),Array.from(a.m.flashImg.data),'final flash RGBA changes although ownership/ink agree');
 assert.notDeepEqual(b.snapshot().output,a.snapshot().output,'final Canvas composite reads the changed flash pixels');
});

const objectiveCollection=(e,mode)=>mode==='zones'?e.stage.zones:mode==='tower'?e.stage.tower.checkpoints[0]:e.rule.state.clams;
for(const mode of ['zones','tower','clams'])test(`composed ${mode} sparse objective snapshots retain forEach presence, indices and inherited entries`,()=>{
 const pair=[minimapHarness(oldInstall),minimapHarness(installRankedUi)];
 for(const h of pair){h.G.match.ranked=engine(mode);const e=h.G.match.ranked,a=objectiveCollection(e,mode);a[1]=structuredClone(a[0]);a[2]=structuredClone(a[0]);e.rule.state.zones=[{team:0},{team:0},{team:0}];h.m.update(0,true);}
 const steps=[
  a=>{delete a[0];},
  a=>{a[0]=a[1];delete a[1];}, // Same values/count, different visible numbering.
  a=>{const inherited=structuredClone(a[0]);delete a[0];const proto=Object.create(Array.prototype);Object.defineProperty(proto,'0',{value:inherited,writable:true,configurable:true});Object.setPrototypeOf(a,proto);},
  a=>{if(mode==='tower')a[0].progress=.99;else (mode==='zones'?a[0].center:a[0].pos)[0]+=1;},
  a=>{a.length=1;},
 ];
 for(const change of steps){const before=pair[1].counts();for(const h of pair){change(objectiveCollection(h.G.match.ranked,mode));h.m.update(1/30,h===pair[0]);}assert.deepEqual(pair[1].snapshot().output,pair[0].snapshot().output);assert.equal(pair[1].counts().rasters,before.rasters,'objective-only mutation does not rasterize ink');}
 // Explicit malformed values retain the production snapshot TypeError contract.
 // The normalized old renderer has no snapshot cache; its checkpoint formula skips invalid progress.
 for(const value of [null,undefined])for(const install of [oldInstall,installRankedUi]){const h=minimapHarness(install);h.G.match.ranked=engine(mode);objectiveCollection(h.G.match.ranked,mode)[0]=value;if(mode==='tower'&&install===oldInstall)assert.doesNotThrow(()=>h.m.update(0,true));else assert.throws(()=>h.m.update(0,true),error=>error.name==='TypeError');}
});
test('composed Tower sparse checkpoint teams retain team-index colours and inherited teams',()=>{
 const pair=[minimapHarness(oldInstall),minimapHarness(installRankedUi)];
 for(const h of pair){h.G.match.ranked=engine('tower');const teams=h.G.match.ranked.stage.tower.checkpoints;teams[1]=structuredClone(teams[0]);h.m.update(0,true);}
 const steps=[teams=>{delete teams[0];},teams=>{teams[0]=teams[1];delete teams[1];},teams=>{const inherited=teams[0];delete teams[0];const proto=Object.create(Array.prototype);Object.defineProperty(proto,'0',{value:inherited,configurable:true});Object.setPrototypeOf(teams,proto);},teams=>{teams[0][0].progress=.1;}];
 for(const change of steps){for(const h of pair){change(h.G.match.ranked.stage.tower.checkpoints);h.m.update(1/30,h===pair[0]);}assert.deepEqual(pair[1].snapshot().output,pair[0].snapshot().output);}
});
