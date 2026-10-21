import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceKrakenArms} from '../runtime/special-presentation.mjs';
test('Kraken arms keep a bounded coherent stroke rather than alternating vertical kicks',()=>{
 for(const phase of ['active','charge','dash'])for(const speed of [0,5.5,11.52,18,100]){
  const s={};let lo=Infinity,hi=-Infinity;
  for(let i=0;i<240;i++){assert.equal(advanceKrakenArms(s,speed,phase,1/60),s);lo=Math.min(lo,s.krakenArmZ);hi=Math.max(hi,s.krakenArmZ);assert.ok(Math.abs(s.krakenArmX)<.14);assert.ok(Math.abs(s.krakenArmZ)<.09);}
  assert.ok(hi-lo>.01,'arms remain animated, including idle and dash');
  const before=JSON.stringify(s);advanceKrakenArms(s,speed,phase,0);assert.equal(JSON.stringify(s),before,'paused render does not advance arms');
 }
});
test('Kraken stroke clock is continuous when speed changes and independent of render rate',()=>{
 const end=[];for(const hz of [30,60,120]){const s={};for(let i=0;i<hz*2;i++)advanceKrakenArms(s,11.52,'active',1/hz);end.push(s);}
 assert.ok(Math.max(...end.map(s=>s.krakenArmClock))-Math.min(...end.map(s=>s.krakenArmClock))<1e-10);
 assert.ok(Math.max(...end.map(s=>s.krakenArmX))-Math.min(...end.map(s=>s.krakenArmX))<.001);
 const s=end[1],old=s.krakenArmX;advanceKrakenArms(s,18,'dash',1/120);assert.ok(Math.abs(s.krakenArmX-old)<.02,'no clock-times-speed phase pop');
});
