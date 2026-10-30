import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spinnerAudioIds,spinnerClipKey,spinnerClipFull,spinnerUsesPremix} from '../runtime/audio/spinner-charge-clips.mjs';
test('all six Spinner types have a charge soundtrack',()=>{
 assert.equal(spinnerAudioIds.size,6);
 for(const id of spinnerAudioIds){assert.ok(spinnerClipKey(id));assert.ok(spinnerClipFull(id)>0);}
 assert.equal(spinnerUsesPremix('s3-spinner-hypershort'),true);
 assert.equal(spinnerUsesPremix('s3-spinner-downpour'),false);
});
test('four deployed Spinner sound clips are valid bounded MP3 files',()=>{
 for(const id of ['mini','heavy','examiner','rise']){
  const buf=fs.readFileSync(new URL('../runtime/audio/spinner-charge-clips/'+id+'.mp3',import.meta.url));
  assert.ok(buf.length>10000&&buf.length<262144,id);
  assert.equal(buf.toString('latin1',0,3),'ID3',id);
 }
});
