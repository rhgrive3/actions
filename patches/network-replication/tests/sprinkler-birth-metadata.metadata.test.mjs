import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Pure metadata boundary only: no native runtime, HP, network or rendering.
test('sprinkler birth identity does not grant kit paint authority',()=>{
 const source=fs.readFileSync(new URL('../kit-paint-admission.mjs',import.meta.url),'utf8');
 const pick=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 const code=[pick('export const KIT_BIRTH_TAG','export const BUBBLER_PAINT_TAG'),pick('const safe =','const clock ='),pick('function identify(e)','function paintMeta'),pick('export function kitBombBirthMetadata','export function recordCatalogueSubBirth')].join('\n').replaceAll('export ','');
 const context=vm.createContext({});
 const api=vm.runInContext(code+`;({birth:kitBombBirthMetadata,record:recordKitBombBirth,isKit})`,context,{timeout:100});
 const nm={cfg:{id:'match'}},actor={nid:1,netLife:2,remote:false,weapon:{sub:'sprinkler'}};
 const bomb=id=>({owner:actor,s3Resolved:{spec:{id}}});
 assert.deepEqual(Array.from(api.birth(nm,bomb('sprinkler'))),['inkwave-kit-birth-v1','match',2]);
 assert.equal(api.isKit('sprinkler'),false,'painting admission remains restricted');
 const b=bomb('sprinkler'),e=Array(16).fill(null);e[13]=api.birth(nm,b);e[14]=9;e[15]=1;
 api.record(nm,b,e);assert.equal(b.s3PaintBirth,undefined,'no paint capability on sprinkler');
 actor.weapon.sub='bomb';assert.equal(api.birth(nm,bomb('sprinkler')),null);
 actor.weapon.sub='sprinkler';actor.remote=true;assert.equal(api.birth(nm,bomb('sprinkler')),null);actor.remote=false;
 actor.nid=-1;assert.equal(api.birth(nm,bomb('sprinkler')),null);actor.nid=1;
 assert.equal(api.birth(nm,bomb('autobomb')),null);
 for(const id of ['suction','curling']){const legacy=bomb(id);assert.deepEqual(Array.from(api.birth(nm,legacy)),['inkwave-kit-birth-v1','match',2]);api.record(nm,legacy,e);assert.deepEqual(Array.from(legacy.s3PaintBirth),['inkwave-kit-core-v1','match',1,2,1]);}
});
