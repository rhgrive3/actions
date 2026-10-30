// QA reference only. No production composer or clock adapter is executed here.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
export const MINIMAP_CLOCK_REFERENCE_SHA256='cc25a186e860e059aaeb0752682d28e8b21186b51a48491a38cbe729732935c0';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readMinimapClockFixture(packed){
 if(hash(packed)!==MINIMAP_CLOCK_REFERENCE_SHA256)throw Error('Minimap clock reference fixture seal mismatch');
 const spec=JSON.parse(gunzipSync(packed));
 if(spec.schema!==1||spec.changes.length!==2||Object.keys(spec.sources).join(',')!=='baseline,candidate')throw Error('Minimap clock reference schema mismatch');
 return spec;
}
const fixture=readMinimapClockFixture(fs.readFileSync(new URL('../fixtures/minimap-transient-clock-20261029.json.gz',import.meta.url)));
const once=(source,before,after)=>{const at=source.indexOf(before);if(at<0||source.indexOf(before,at+before.length)!==-1)throw Error('Minimap clock reference requires one complete hunk');return source.slice(0,at)+after+source.slice(at+before.length);};
export function projectMinimapUpdateClock(source,owner){
 const expected=fixture.sources[owner];if(!expected||hash(source)!==expected.legacySha256||source!==expected.legacy)throw Error('Minimap clock legacy full-source admission mismatch');
 let current=source;for(const change of fixture.changes)current=once(current,change.before,change.after);
 if(hash(current)!==expected.currentSha256)throw Error('Minimap clock current full-source admission mismatch');
 if(restoreMinimapCompositeClock(current,owner)!==source)throw Error('Minimap clock inverse mismatch');
 return current;
}
export function restoreMinimapCompositeClock(source,owner){
 const expected=fixture.sources[owner];if(!expected||hash(source)!==expected.currentSha256)throw Error('Minimap clock current full-source admission mismatch');
 let legacy=source;for(const change of [...fixture.changes].reverse())legacy=once(legacy,change.after,change.before);
 if(hash(legacy)!==expected.legacySha256||legacy!==expected.legacy)throw Error('Minimap clock inverse legacy admission mismatch');
 return legacy;
}
// Historical builds without this producer keep their original clock. Current
// builds must bind the complete reviewed producer to their actual input manifest.
export function admitMinimapClockEpoch(sourceHashes,manifest){
 const producer=fixture.producer,declared=manifest.files?.[producer.manifestKey];
 if(declared===undefined){if(sourceHashes[producer.path]!==undefined)throw Error('Minimap clock producer absent from build manifest');return'legacy-composite-credit';}
 if(declared!==producer.sha256||sourceHashes[producer.path]!==producer.sha256)throw Error('Minimap clock producer input mismatch');
 return fixture.epoch;
}
export function minimapClockReferenceFixture(){return structuredClone(fixture);}
export function minimapClockReferenceBinding(){return{epoch:fixture.epoch,fixtureSha256:MINIMAP_CLOCK_REFERENCE_SHA256,producer:{...fixture.producer},sources:Object.fromEntries(Object.entries(fixture.sources).map(([owner,s])=>[owner,{legacySha256:s.legacySha256,currentSha256:s.currentSha256}]))};}
