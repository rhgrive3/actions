import {createHash} from 'node:crypto';
import {validateAuthorizedManifest} from '../../patches/splatoon3/runtime/audio/authorized-samples.mjs';

const CLIP_FIELDS=['id','event','variant','file','gain','sha256','loopStart','loopEnd','seamlessLoop'];
export function compactInstalledAudioManifest(source) {
  const original=JSON.parse(source);
  const before=validateAuthorizedManifest(original);
  const compact={schema:original.schema,source:original.source,targetVersion:original.targetVersion,usageRights:original.usageRights,
    provenance:{sourceManifestSha256:createHash('sha256').update(source).digest('hex')},
    clips:original.clips.map(clip=>Object.fromEntries(CLIP_FIELDS.filter(key=>Object.hasOwn(clip,key)).map(key=>[key,clip[key]])))};
  const after=validateAuthorizedManifest(compact);
  const signature=clips=>JSON.stringify(clips.map(clip=>CLIP_FIELDS.map(key=>clip[key])));
  if(signature(before)!==signature(after))throw Error('Runtime audio declarations changed');
  return JSON.stringify(compact);
}
