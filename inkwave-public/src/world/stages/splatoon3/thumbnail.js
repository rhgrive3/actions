import { getStageLayout, isStage25 } from './index.js';
import { layoutThumbSVG } from '../../mapThumb.js';
const cache=new Map();
export function stage25Thumbnail(id,time='day') {
  if(!isStage25(id))return null;const key=id+time;
  if(!cache.has(key))cache.set(key,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(layoutThumbSVG(getStageLayout(id),time)));
  return cache.get(key);
}
