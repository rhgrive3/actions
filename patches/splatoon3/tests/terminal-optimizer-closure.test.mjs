import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {qualityIdentity} from '../../local-quality/adapter.mjs';
import {reliabilityIdentity} from '../../reliability/adapter.mjs';
import {BUILD_ONLY_PATCH_MODULES} from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import {adaptDriveCoreQueue} from '../../local-quality/drive-core-queue-adapter.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const entry='scripts/inkwave-source-composition.mjs';
const specs=['patches/local-quality/drive-core-queue-adapter.mjs','patches/splatoon3/weapon-queue-20261024-adapter.mjs','patches/local-quality/drive-visual-audio-adapter.mjs','patches/local-quality/queue-world-20261024-adapter.mjs'];
function closure(reader=read){const visited=new Map();function visit(p){assert(!p.startsWith('../'));if(visited.has(p))return;const s=reader(p);visited.set(p,s);for(const n of parse(s,{ecmaVersion:'latest',sourceType:'module'}).body){const spec=n.source?.value;if(spec?.startsWith('.'))visit(path.posix.normalize(path.posix.join(path.posix.dirname(p),spec)));}}visit(entry);return visited;}
function registered(){const ids=new Map();for(const [prefix,f]of[['patches/local-quality/',qualityIdentity],['patches/reliability/',reliabilityIdentity]])for(const [p,h]of Object.entries(f()))ids.set(prefix+p,h);return ids;}
function verify(ids,reader=read){const c=closure(reader);for(const [p,s]of c)if(p.startsWith('patches/local-quality/')||p.startsWith('patches/reliability/')){assert(ids.has(p),'untracked '+p);assert.equal(ids.get(p),hash(s),'stale '+p);}return c;}
test('real terminal composer closure and two explicit identity namespaces are complete without asset walks',()=>{const c=verify(registered());assert(c.size>300);for(const p of specs){assert(c.has(p));assert(BUILD_ONLY_PATCH_MODULES.has(p));}for(const p of ['inkwave-public/src/core/buildSlices.js','inkwave-public/src/game/nav.js','inkwave-public/src/world/props-core.js'])assert(read(p).length>0);});
test('missing each terminal explicit registration and stale bytes are rejected',()=>{for(const p of specs.filter(p=>p.includes('/local-quality/'))){const ids=registered();ids.delete(p);assert.throws(()=>verify(ids),/untracked/);}const ids=registered();assert.throws(()=>verify(ids,p=>read(p)+(p===specs[0]?'\n// stale':'')),/stale/);});
test('unregistered transitive terminal dependency is rejected',()=>{const ids=registered();const p=specs[0],extra='patches/local-quality/terminal-negative-unregistered.mjs',s=read(p)+"\nimport './terminal-negative-unregistered.mjs';\n";ids.set(p,hash(s));assert.throws(()=>verify(ids,q=>q===p?s:q===extra?'export const negative=1;':read(q)),/untracked/);});
test('stopped character, geometry, hair and motion targets are untouched by scoped core adapter',()=>{for(const p of ['character.js','character-geo.js','motion/hair-targets.js','motion/source-controller.js','motion/locomotion-profile.js'])assert.equal(adaptDriveCoreQueue('src/game/'+p,'sentinel'),'sentinel');assert.throws(()=>adaptDriveCoreQueue('src/net/netmatch.js',''),/composition conflict/);});
