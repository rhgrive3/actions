import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePresentedFrame,seekReferenceFrame} from './recover-public-blast-browser-reference.mjs';
const frame=()=>({mediaTime:15.95,paused:true,seeking:false,readyState:2,currentTime:15.95,width:1920,height:1080,metadataWidth:1920,metadataHeight:1080,presentedFrames:1});
test('actual presented frame metadata is required at the fixed time',()=>{assert.equal(validatePresentedFrame(frame()),true);assert.throws(()=>validatePresentedFrame(frame(),16));});
test('wrong frame, unready, playback, scaled metadata, excessive dimensions rejected',()=>{
 for(const patch of [{mediaTime:0},{mediaTime:NaN},{mediaTime:16.1},{currentTime:15.8},{paused:false},{seeking:true},{readyState:1},{readyState:undefined},{readyState:NaN},{readyState:'bad'},{readyState:5},{metadataWidth:960},{width:8192,metadataWidth:8192},{presentedFrames:0}])assert.throws(()=>validatePresentedFrame({...frame(),...patch}));
});
test('seek waits for real callback metadata and seeked, never returns requested time as evidence',async()=>{
 const listeners=new Map();let cb,source='';
 const video={duration:30,videoWidth:1920,videoHeight:1080,style:{},paused:true,seeking:false,readyState:2,pause(){this.paused=true;},addEventListener(name,f){listeners.set(name,f);},requestVideoFrameCallback(f){cb=f;return 1;},cancelVideoFrameCallback(){},set src(v){source=v;Promise.resolve().then(()=>listeners.get('loadedmetadata')());},set currentTime(v){this._time=v;Promise.resolve().then(()=>{cb(50,{mediaTime:15.933333,presentationTime:50,expectedDisplayTime:55,presentedFrames:2,width:1920,height:1080});listeners.get('seeked')();});},get currentTime(){return this._time;}};
 const fn=new Function('document','return ('+seekReferenceFrame.toString()+');')({querySelector:()=>video});
 const r=await fn({url:'http://127.0.0.1:1/reference.mp4',target:15.95});
 assert.equal(source,'http://127.0.0.1:1/reference.mp4');assert.equal(r.mediaTime,15.933333);assert.equal(r.currentTime,15.95);assert.equal(video.style.width,'1920px');assert.equal(validatePresentedFrame(r),true);
});
test('missing video-frame callback API fails rather than substituting a guessed image',async()=>{
 const fn=new Function('document','return ('+seekReferenceFrame.toString()+');')({querySelector:()=>({})});await assert.rejects(fn({url:'unused'}),/callbacks unavailable/);
});
