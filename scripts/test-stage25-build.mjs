import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {parse} from '../patches/loading-cache/vendor/acorn.mjs';
const root=path.resolve(process.argv[2]||'/mnt/data/inkwave-stage-site');
const identity=JSON.parse(fs.readFileSync(path.join(root,'inkwave-build.json'))),worker=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const ast=parse(worker,{ecmaVersion:'latest',sourceType:'script'}),binding=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='BUILD');
const config=JSON.parse(worker.slice(binding.init.start,binding.init.end)),checks=[];
function check(name,fn){try{fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}}
check('worker literal and immutable build identity agree',()=>assert.equal(config.revision,identity.build.revision));
check('all 25 modules are shipped and integrity-listed',()=>{const ids=['scorch','eeltail','hagglefish','undertow','mincemeat','hammerhead','museum','mahi','inkblot','sturgeon','mako','wahoo','brinewater','flounder','umami','manta','barnacle','humpback','crableg','shipshape','robo','bluefin','marlin','lemuria','urchin'];for(const id of ids){const p=`src/world/stages/splatoon3/${id}.js`,bytes=fs.readFileSync(path.join(root,p));assert.ok(config.assets[p]);assert.equal(config.assets[p][1],crypto.createHash('sha256').update(bytes).digest('hex'));assert.ok(config.precache.includes(p));}});
check('explicit diagnostic worker budget 128 KiB',()=>assert.ok(Buffer.byteLength(worker)<=128*1024));
const precacheBytes=config.precache.reduce((n,p)=>n+config.assets[p][0],0);
check('explicit diagnostic cold-cache budget 12 MiB',()=>assert.ok(precacheBytes<=12*1024*1024));
check('build-only stage adapter is not shipped as game runtime',()=>assert.ok(!config.assets['scripts/lib/inkwave-stage25-adapter.mjs']));
check('original input locked files remain byte-identical',()=>{const lock=JSON.parse(fs.readFileSync('patches/splatoon3/upstream-lock.json'));const table=lock.files||lock;for(const [p,v] of Object.entries(table)){if(typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v))continue;const file=path.join('inkwave-public',p);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),v,p);}});
const result={mode:identity.build.optimization,buildRevision:identity.build.revision,workerBytes:Buffer.byteLength(worker),precacheBytes,checks,passed:checks.filter(c=>c.pass).length,total:checks.length,productionGate:'Not certified: minified build not run. Production tests must not be applied as a passing claim to this diagnostic build.'};
fs.mkdirSync('reports/stage25',{recursive:true});fs.writeFileSync('reports/stage25/build-checks.json',JSON.stringify(result,null,2)+'\n');console.log(result);process.exitCode=result.passed===result.total?0:1;
