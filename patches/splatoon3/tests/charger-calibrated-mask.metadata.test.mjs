import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
 return vm.runInNewContext(code,Object.create(null),{timeout:1000});
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
 const native=read('../runtime/weapons-charger-flight.mjs'),browser=read('./paint-mask-browser-fixture.mjs');
 assert.equal(native.split('const stretch=Math.max(0,job.paint.depth/radius-1)*1.6;').length-1,2,'actual immediate and delayed native stretch formulas');
 assert.equal(browser.split('const sa=Math.max(0,paint.depth/R-1)*1.6;').length-1,1,'same stretch formula in browser oracle');
 assert.equal(native.split('chargerPaintWorldRadius(job.paint.width)*job.paint.terminalRate,true').length-1,1,'native terminal stamp scale');
 assert.equal(native.split('chargerPaintWorldRadius(paint.width)').length-1,1,'native travel stamp scale');
});
