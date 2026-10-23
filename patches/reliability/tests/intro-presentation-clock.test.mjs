import test from 'node:test';import assert from 'node:assert/strict';
import {beginIntroPresentation,advanceIntroPresentation}from '../../splatoon3/runtime/intro-presentation.mjs';
function setup(){const calls=[],match={state:'intro',stateT:0,paused:false},game={match,_matchFlow:{},hud:{banner:x=>calls.push(x),setVisible:x=>calls.push(x)}};return{game,match,calls};}
for(const hz of [30,60,120])test(`intro READY/HUD follows Match time and freezes through offline pause at ${hz}Hz`,()=>{
 const h=setup();beginIntroPresentation(h.game,h.match,[[1.7,'ready'],[3,'show']]);
 for(let i=0;i<hz;i++){h.match.stateT+=1/hz;advanceIntroPresentation(h.game);}h.match.paused=true;
 for(let i=0;i<hz*10;i++)advanceIntroPresentation(h.game);assert.deepEqual(h.calls,[]);
 h.match.paused=false;for(let i=0;i<hz*2;i++){h.match.stateT+=1/hz;advanceIntroPresentation(h.game);}
 assert.deepEqual(h.calls,['ready',true]);assert.equal(h.game._introPresentation,null);
});
test('abandoned match/flow and repeated same-match intro cannot deliver an old presentation step',()=>{
 for(const change of ['match','flow','state']){const h=setup();beginIntroPresentation(h.game,h.match,[[1.7,'ready']]);h.match.stateT=2;if(change==='match')h.game.match={...h.match};else if(change==='flow')h.game._matchFlow={};else h.match.state='playing';advanceIntroPresentation(h.game);assert.deepEqual(h.calls,[]);assert.equal(h.game._introPresentation,null);}
 const h=setup();beginIntroPresentation(h.game,h.match,[[1.7,'ready']]);h.match.stateT=1;beginIntroPresentation(h.game,h.match,[[1.7,'ready']]);h.match.stateT=2;advanceIntroPresentation(h.game);assert.deepEqual(h.calls,[]);h.match.stateT=2.7;advanceIntroPresentation(h.game);assert.deepEqual(h.calls,['ready']);
});
test('reentrant READY callback cannot reveal the HUD of a replacement match',()=>{
 const h=setup();beginIntroPresentation(h.game,h.match,[[1.7,'ready'],[3,'show']]);h.game.hud.banner=x=>{h.calls.push(x);h.game.match={state:'intro',stateT:0};};h.match.stateT=4;advanceIntroPresentation(h.game);assert.deepEqual(h.calls,['ready']);
});
