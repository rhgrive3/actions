import test from 'node:test';
import assert from 'node:assert/strict';
import {validateContinuousPair,validateEncodedVideo,validateCapturePngHeader,explosherVideoDeliveryProvenance} from '../../../scripts/lib/inkwave-explosher-video-gate.mjs';
// Synthetic data here tests rejection logic only; never rendered or delivered.
import {fixture}from'./explosher-stage-fixture.mjs';
test('61-frame structural positive, explicitly not image evidence',()=>{const f=fixture(),b=fixture('after');assert.equal(validateContinuousPair(f.frames,b.frames,f.receipt,b.receipt,f.sha,f.sha).framesPerSide,61);});
for(const [name,mutate]of [
 ['wrong controlled byte',b=>b.receipt.controlledMain.transformedEmittedSha256='f'.repeat(64)],
 ['wrong frame0 binding',b=>b.receipt.preflightBindingSha256='f'.repeat(64)],
 ['wrong lane bytes',b=>b.receipt.shapeOverlay.transformedEmittedSha256=b.receipt.shapeOverlay.originalEmittedSha256],
 ['negative late resource',b=>b.frames[60].measurement.memory.textures=-1],
 ['negative late points',b=>b.frames[60].measurement.render.points=-1],
 ['wrong overlay common head',b=>b.receipt.shapeOverlay.expectedCommonSourceHead='0'.repeat(40)],
 ['false full-game claim',b=>b.receipt.shapeOverlay.fullGameTwoBuildAcceptance=true],
 ['negative late lines',b=>b.frames[60].measurement.render.lines=-1],
 ['negative late geometry',b=>b.frames[60].measurement.memory.geometries=-1],
 ['sparse frames',f=>f.frames.splice(8,1)],
 ['duplicate frame',f=>f.frames[9].tick=8],
 ['hash mismatch',f=>f.frames[4].actualFileSha256='2'.repeat(64)],
 ['wrong source',f=>f.receipt.actualSourceSha='b'.repeat(40)],
 ['flat image',f=>f.frames[6].imageStats.range=0],
 ['empty birth physics',f=>f.frames[0].measurement.physical=[]],
 ['empty aim trace',f=>f.frames[0].measurement.aimTrace=[]],
 ['missing physics',f=>delete f.frames[5].measurement.physical],
 ['FX mismatch',f=>f.frames[22].measurement.effects.pools={different:1}],
 ['RNG mismatch',f=>f.frames[8].measurement.rng.word=7],
 ['palette mismatch',f=>f.frames[9].measurement.palette.local=0],
 ['resource increase',f=>f.frames[22].measurement.render.triangles=101],
 ['nonfinite resource',f=>f.frames[12].measurement.render.triangles=NaN],
 ['wrong simulation tick',f=>f.frames[15].measurement.time+=.001],
])test('rejects '+name,()=>{const a=fixture(),b=fixture('after');mutate(b);assert.throws(()=>validateContinuousPair(a.frames,b.frames,a.receipt,b.receipt,a.sha,b.sha));});
test('encoded MP4 must contain exactly61 H264 60Hz frames',()=>{
 const probe={streams:[{codec_type:'video',codec_name:'h264',width:1600,height:450,avg_frame_rate:'60/1',nb_read_frames:'61',duration:String(61/60)}]};
 assert.doesNotThrow(()=>validateEncodedVideo(probe));
 for(const patch of [{avg_frame_rate:'30/1'},{nb_read_frames:'18'},{width:800},{codec_name:'vp9'},{duration:'2'}])assert.throws(()=>validateEncodedVideo({streams:[{...probe.streams[0],...patch}]}));
});

test('actual PNG header must be800by450, not just manifest stats',()=>{
 const h=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(h);h.writeUInt32BE(13,8);h.write('IHDR',12);h.writeUInt32BE(800,16);h.writeUInt32BE(450,20);
 assert.doesNotThrow(()=>validateCapturePngHeader(h));
 assert.throws(()=>validateCapturePngHeader(h.subarray(0,24)));
 for(const [offset,value]of [[0,0],[8,12],[12,0],[16,799],[20,449]]){const bad=Buffer.from(h);bad.writeUInt32BE(value,offset);assert.throws(()=>validateCapturePngHeader(bad));}
});

test('delivery provenance distinguishes actual lane bytes from equal common source',()=>{const a=fixture(),b=fixture('after'),lane=f=>({r:f.receipt,manifestSha256:'a'.repeat(64),sourceReceiptSha256:'b'.repeat(64)}),p=explosherVideoDeliveryProvenance(lane(a),lane(b));assert.equal(p.before.shapeSourceBlob,'83a76f51f56cffdf66bca6e16c56dd18b2c06f93');assert.equal(p.after.shapeSourceBlob,'351427cd20c9726dd21c3cbe949078cbce23c81b');assert.notEqual(p.before.consumedShapeSha256,p.after.consumedShapeSha256);assert.equal(p.before.manifestSha256,'a'.repeat(64));assert.equal(p.after.sourceReceiptSha256,'b'.repeat(64));assert.equal(p.naturalBootAccepted,false);assert.throws(()=>explosherVideoDeliveryProvenance({...lane(a),manifestSha256:null},lane(b)));});
for(const[field,mutate]of[['controlled',r=>r.controlledMain.transformedEmittedSha256='e'.repeat(64)],['UI',r=>r.captureUiGateSha256='e'.repeat(64)],['helper',r=>r.nativeResetHelperSha256='e'.repeat(64)],['protocol',r=>r.captureProtocolSha256='e'.repeat(64)],['shape',r=>{r.shapeOverlay.candidateEmittedSha256='e'.repeat(64);if(r.shapeOverlay.lane==='after')r.shapeOverlay.transformedEmittedSha256='e'.repeat(64);} ]])test('both current lanes reject changed prior '+field+' bytes',()=>{const a=fixture(),b=fixture('after');mutate(a.receipt);mutate(b.receipt);assert.throws(()=>validateContinuousPair(a.frames,b.frames,a.receipt,b.receipt,a.sha,b.sha),/provenance/);});
