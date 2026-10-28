import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { WORLD_UNITS_PER_SOURCE_UNIT } from '../runtime/source-distance.mjs';
import { fixture } from './source-fixture.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function exportedFunction(source,name){
 const hits=[...source.matchAll(new RegExp('^export function '+name+'\\([^]*?^\\}','gm'))];
 assert.equal(hits.length,1,'exact actual function '+name);return hits[0][0].replace('export ','');
}
function actualRuntime(){
 const source=read('../runtime/weapons-charger-flight.mjs'),weapons=read('../runtime/weapons.mjs');
 const constants=['CHARGER_PAINT_WORLD_WIDTH_SCALE','CHARGER_FIRST_LEGAL_CHARGE'].map(name=>{
 const hits=[...source.matchAll(new RegExp('^export const '+name+' = [^;]+;','gm'))];assert.equal(hits.length,1);return hits[0][0].replace('export ','');});
 const code=[...constants,exportedFunction(weapons,'isChargerFullCharge'),...['chargerPaintWorldRadius','chargerPartialCharge','chargerPaintParameters'].map(n=>exportedFunction(source,n)),
 '({chargerPaintWorldRadius,chargerPaintParameters})'].join('\n');
 return vm.runInNewContext(code,{WORLD_UNITS_PER_SOURCE_UNIT},{timeout:1000});
}
const buildCases=vm.runInNewContext(exportedFunction(read('./paint-mask-browser-fixture.mjs'),'calibratedChargerMaskCases')+'\ncalibratedChargerMaskCases',Object.create(null),{timeout:1000});
const raw=JSON.parse(read('../profile.json')).weaponsFidelityCompletion.weapons.charger;
function validate(rows){
 assert.equal(rows.length,240);
 const expected=[[8/60,.78,4,1.17,2.1333333333333333],[.25,.885,3.0508474576271185,1.3275,1.500564971751412],[.5,1.11,1.621621621621622,1.665,.547747747747748],[.75,1.335,.6741573033707866,2.0025,0],[1,1.56,0,2.34,0]];
 for(const [charge,R,sa,terminalR,terminalSa] of expected)for(const terminal of [false,true]){
 const group=rows.filter(x=>x.charge===charge&&x.terminal===terminal);assert.equal(group.length,24);
 for(const row of group){assert.ok(Math.abs(row.R-(terminal?terminalR:R))<1e-12);assert.ok(Math.abs(row.sa-(terminal?terminalSa:sa))<1e-10);assert.equal(row.calibrated,true);}
 }
}
test('browser calibrated cases use actual native Charger radius and stretch across all charges',()=>{const rt=actualRuntime();validate(buildCases(raw,rt.chargerPaintParameters,rt.chargerPaintWorldRadius));});
test('old five-times-reduced width and unstretched counterfactuals fail calibration acceptance',()=>{const rt=actualRuntime();assert.throws(()=>validate(buildCases(raw,rt.chargerPaintParameters,x=>x*.2)));const rows=buildCases(raw,rt.chargerPaintParameters,rt.chargerPaintWorldRadius);rows.forEach(x=>x.sa=0);assert.throws(()=>validate(rows));});
test('mask stretch and terminal scaling stay bound to both native travel emission paths',()=>{
 const native=read('../runtime/weapons-charger-flight.mjs'),drop=read('../runtime/charger-paint-drop.mjs'),browser=read('./paint-mask-browser-fixture.mjs');
 assert.equal(native.split('const stretch=Math.max(0,job.paint.depth/radius-1)*1.6;').length-1,1,'actual immediate native stretch formula');
 assert.equal(drop.split('drop.stretchAmt=Math.max(0,depth/radius-1)*1.6;').length-1,1,'actual shared delayed native stretch formula');
 assert.match(native,/queueChargerPaintDrop\(system,\{from,hit,radius,depth:job\.paint\.depth,direction:job\.dir,/,'native delayed lease carries the same radius, depth and direction');
 assert.equal(browser.split('const sa=Math.max(0,paint.depth/R-1)*1.6;').length-1,1,'same stretch formula in browser oracle');
 assert.equal(native.split('chargerPaintWorldRadius(job.paint.width)*job.paint.terminalRate,true').length-1,1,'native terminal stamp scale');
 assert.equal(native.split('chargerPaintWorldRadius(paint.width)').length-1,1,'native travel stamp scale');
});

test('actual native immediate and delayed Charger landings retain calibrated travel and terminal masks',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),{G,THREE}=f;
 const level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
   single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
 G.level=level;G.physics=new f.Physics(level);G.actors=[];
 const painted=[],actor=f.make('charger'),ps=G.projectiles;
 G.paint={sample:()=>1,splat(point,radius,_team,options){painted.push({point:point.clone(),radius,stretch:options.stretchAmt,owner:options.claimOwner});return 1;}};
 const rt=actualRuntime(),oracle=buildCases(raw,rt.chargerPaintParameters,rt.chargerPaintWorldRadius);
 const run=(charge,height)=>{
   ps.clear();painted.length=0;actor.pos.set(0,height,0);actor.character.root.position.copy(actor.pos);
   actor.aimDir.set(0,0,1);actor.aimPoint.set(0,height+1.05,40);
   ps.fireCharger(actor,actor.weapon,charge);painted.length=0; // feet mark has its own radius contract
   for(let i=0;i<10;i++)ps.update(1/60);
   if(height){assert.ok(ps.chargerDrops.length>0,'real native flight queues delayed leases');assert.equal(painted.length,0,'elevated paint waits for landing');}
   for(let i=0;i<180;i++)ps.update(1/60);
   assert.equal(ps.chargerDrops.length,0,'landed leases retire');
   assert.ok(painted.length>=2,'actual native travel and terminal masks were emitted');
   return painted.map(p=>({...p}));
 };
 for(const charge of [8/60,.25,.5,.75,1]){
   const immediate=run(charge,0),delayed=run(charge,18);
   const travel=oracle.find(r=>r.charge===charge&&!r.terminal),terminal=oracle.find(r=>r.charge===charge&&r.terminal);
   assert.equal(delayed.length,immediate.length,'falling lease preserves native mask count');
   for(const records of [immediate,delayed]){
     assert.ok(records.some(p=>Math.abs(p.radius-terminal.R)<1e-10),'terminal scale remains present');
     assert.ok(records.some(p=>Math.abs(p.radius-travel.R)<1e-10),'travel scale remains present');
     for(const p of records){
       const expected=Math.abs(p.radius-terminal.R)<1e-10?terminal:travel;
       assert.ok(Math.abs(p.radius-expected.R)<1e-10);assert.ok(Math.abs(p.stretch-expected.sa)<1e-10,'actual mask stretch matches calibration');
       assert.equal(p.owner,actor);assert.ok(Math.abs(p.point.y-.015)<1e-9,'real receiving floor owns the mask');
     }
   }
 }
 ps.clear();
});
