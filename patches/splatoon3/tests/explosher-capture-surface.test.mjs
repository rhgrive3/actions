import test from 'node:test';import assert from 'node:assert/strict';
import {explosherSurfaceReady} from '../../../scripts/lib/inkwave-explosher-capture-surface.mjs';
const ready={nativeCanvas:true,uniqueGameCanvas:true,rendererOwner:true,canvasVisible:true,width:800,height:450,menuCurrent:null,menuScreen:null,menuStarting:false,wipeRunning:false,wipeRunClass:false,leavingScreens:0,labFrozen:false};
test('native unique visible renderer with completed ordinary UI is admitted',()=>assert.equal(explosherSurfaceReady(ready),true));
test('unfinished wipe/menu and stale leaving screen all reject',()=>{for(const [k,v]of Object.entries({menuCurrent:'mode',menuScreen:'mode',menuStarting:true,wipeRunning:true,wipeRunClass:true,leavingScreens:1,labFrozen:true}))assert.equal(explosherSurfaceReady({...ready,[k]:v}),false,k);});
test('wrong canvas owner, duplicate id, hidden or empty surface rejects',()=>{for(const [k,v]of Object.entries({nativeCanvas:false,uniqueGameCanvas:false,rendererOwner:false,canvasVisible:false,width:0,height:NaN}))assert.equal(explosherSurfaceReady({...ready,[k]:v}),false,k);});
test('every admission field is required',()=>{for(const k of Object.keys(ready)){const s={...ready};delete s[k];assert.equal(explosherSurfaceReady(s),false,k);}assert.equal(explosherSurfaceReady(null),false);});
