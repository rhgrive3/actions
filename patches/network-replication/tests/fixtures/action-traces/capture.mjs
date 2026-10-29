// Explicit offline fixture generator; tests never regenerate their expectation.
import {writeFileSync} from 'node:fs';
import {collectCurling,collectBlaster,collectWave,collectRoller} from './collect.mjs';
const scenarios={
 curlingShort:()=>collectCurling({holdFrames:6}),curlingLong:()=>collectCurling({holdFrames:30}),
 curlingContactBlast:()=>collectCurling({holdFrames:30,victimAt:[0,0,8.6]}),
 curlingMiss:()=>collectCurling({holdFrames:30,victimAt:[20,0,8.6]}),
 curlingLow:()=>collectCurling({holdFrames:60,initialInk:64.51,probeAt:420}),
 curlingHigh:()=>collectCurling({holdFrames:60,initialInk:65.49,probeAt:420}),
 blasterDirect:()=>collectBlaster(),blasterMultiSplash:()=>collectBlaster({targetX:2,extraTarget:true}),
 blasterMiss:()=>collectBlaster({targetX:12}),
 wave:()=>collectWave(),waveNoGauge:()=>collectWave({fullSpecial:false}),
 roller:()=>collectRoller(),rollerMiss:()=>collectRoller({targetX:10}),
};
const traces={};for(const [name,run]of Object.entries(scenarios))traces[name]=await run();
if(!process.argv[2])throw Error('provide destination path');
writeFileSync(process.argv[2],JSON.stringify({base:'035233299348e5c3527f6106b98e721ed2dfd011',dt:1/60,random:.5,
 note:'Native source Actor, Runner, Projectiles and NetMatch on a real floor; constrained locomotion/rendering and deterministic paint sink, not hardware or retail evidence.',traces},null,2)+'\n');
