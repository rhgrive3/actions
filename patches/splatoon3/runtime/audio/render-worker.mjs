import { WEAPON_AUDIO } from './weapon-recipes.mjs';
import { KIT_AUDIO } from './kit-recipes.mjs';
import { renderSound } from './render.mjs';
// A single DSP worker pre-renders future voices. No game state, network, or audio device access.
self.onmessage=({data})=>{
  const {id,event,variant,key,sampleRate}=data||{};
  try{const recipe=WEAPON_AUDIO[id]||KIT_AUDIO[id];if(!recipe)throw new RangeError('Unknown audio ID');
    const pcm=renderSound(recipe,event,variant,sampleRate);self.postMessage({key,pcm},[pcm.buffer]);
  }catch(error){self.postMessage({key,error:String(error?.message||error)});}
};
