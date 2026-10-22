// A declared QA comparison, never a production overlay or a rebaseline.
// Retain the raw historical build and A/A captures. The only controlled variable
// is the already-shipped Three UUID isolation, composed from verified source.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { adaptUuidRandom } from '../../patches/splatoon3/uuid-random-adapter.mjs';
import { compactModuleStrings } from './inkwave-source-compaction.mjs';

export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
export const UUID_COMPARISON = Object.freeze({
  schema: 1, kind: 'historical-three-uuid-isolation-only',
  baseline: '83f27e5d59db944458a85122a95d1154e3543393',
  esbuild: '0.28.2',
  builder: '76361c270da4afe957560f113f38e7a3f056cdb593d5842a1354eb765e150ba7',
  adapter: 'eb6916b9ebd838e12324c8bb8298b602604b2517f3d7563868943ecf3bda797c',
  core: '9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6',
  module: '9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea',
  raw: '6e3595cd58d4704e8fc823e6c9f6b85a955dd56e5448561444d04176e283cf45',
  isolated: 'fd6aba4bb49e5544f860931c8379242980552c3bc6e453a850d356bf4db99760',
  relativePath: 'vendor/three/build/three.module.js',
});
const P = UUID_COMPARISON;
const read = file => fs.readFileSync(file, 'utf8');
const once = (code, before, after, label) => {
  const at = code.indexOf(before);
  assert(at >= 0 && code.indexOf(before, at + before.length) < 0, label);
  return code.slice(0, at) + after + code.slice(at + before.length);
};
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.name !== '.rsync-tmp').flatMap(d => {
  const file = path.join(dir, d.name);
  return d.isDirectory() ? walk(file) : [file];
});

// Canonicalize the nearest existing ancestor before creating new output paths.
// Lexical containment alone can be bypassed by an ancestor symlink.
function canonicalNewPath(file) {
  let existing = path.resolve(file);
  const missing = [];
  for (;;) {
    try { fs.lstatSync(existing); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      assert.notEqual(parent, existing, 'Comparison output has no existing ancestor');
      missing.unshift(path.basename(existing)); existing = parent;
    }
  }
  return path.resolve(fs.realpathSync(existing), ...missing);
}

export async function prepareUuidComparison({ sourceRoot, siteRoot, outDir }) {
  const source = fs.realpathSync(path.resolve(sourceRoot)), site = fs.realpathSync(path.resolve(siteRoot));
  assert(!fs.existsSync(path.resolve(outDir)), 'Comparison output must be new; never rewrite a receipt');
  const output = canonicalNewPath(outDir);
  assert(!fs.existsSync(output), 'Comparison output must be new; never rewrite a receipt');
  assert(output !== source && !output.startsWith(source + path.sep) && output !== site && !output.startsWith(site + path.sep), 'Comparison output must not modify historical source or site');
  const builder = read(path.join(source, 'scripts/build-inkwave.mjs'));
  assert.equal(hashBytes(builder), P.builder, 'Historical builder is not the independently pinned83 source');
  const manifestBytes = fs.readFileSync(path.join(site, 'inkwave-build.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.contentHash, hashBytes(JSON.stringify(manifest.artifacts)));
  assert.equal(manifest.inputHash, hashBytes(JSON.stringify(manifest.files)));
  assert.equal(manifest.build.script, P.builder);
  assert.equal(manifest.build.esbuild, P.esbuild);
  const rawBytes = fs.readFileSync(path.join(site, P.relativePath));
  assert.equal(hashBytes(rawBytes), P.raw, 'Raw historical emitted Three bytes changed');
  assert.equal(manifest.artifacts[P.relativePath], P.raw);
  const paths = [P.relativePath, `_versions/${manifest.build.revision}/${P.relativePath}`];
  for (const rel of paths) {
    assert.equal(manifest.artifacts[rel], P.raw);
    assert.equal(hashBytes(fs.readFileSync(path.join(site, rel))), P.raw);
  }
  const SRC = path.join(source, 'inkwave-public');
  const inputs = {};
  for (const [name, expected] of [['three.core.js', P.core], ['three.module.js', P.module]]) {
    const rel = 'vendor/three/build/' + name, code = read(path.join(SRC, rel));
    assert.equal(hashBytes(code), expected, 'Historical source bytes changed: ' + rel);
    assert.equal(manifest.files['upstream/' + rel], expected);
    // Reject a broad composer change: the whole transformation must equal the
    // existing UUID-only adapter, not any other Three/renderer adjustment.
    assert.equal(adaptBuildSource(rel, code), adaptUuidRandom(rel, code, once), 'Only the reviewed UUID source adapter may change Three');
    inputs[rel] = expected;
  }
  const adapterBytes = fs.readFileSync(fileURLToPath(new URL('../../patches/splatoon3/uuid-random-adapter.mjs', import.meta.url)));
  assert.equal(hashBytes(adapterBytes), P.adapter, 'UUID adapter needs renewed independent review');
  const esbuild = await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild');
  assert.equal(esbuild.version, P.esbuild);
  // Execute the actual byte-verified historical stage. Do not duplicate its
  // export discovery, compiler settings or source transform implementation.
  const start = builder.indexOf('const THREE_DIR = '), end = builder.indexOf('\n}\n', start) + 3;
  assert(start > 0 && end > start);
  const stage = builder.slice(start, end), loads = [];
  async function compile(isolated) {
    const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), 'roller-three-compare-'));
    try {
      fs.mkdirSync(path.join(BUILD, 'vendor/three/build'), { recursive: true });
      for (const name of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(SRC, 'vendor/three/build', name), path.join(BUILD, 'vendor/three/build', name));
      const compiler = { async build(options) {
        assert.equal(options.plugins, undefined, 'Historical stage must not contain hidden transforms');
        return esbuild.build({ ...options, plugins: [{ name: 'verified-historical-three-composition', setup(build) {
          build.onLoad({ filter: /\.m?js$/ }, args => {
            const rel = path.relative(SRC, args.path).split(path.sep).join('/');
            assert(Object.hasOwn(inputs, rel), 'Unexpected Three dependency: ' + rel);
            const input = read(args.path);
            assert.equal(hashBytes(input), inputs[rel]);
            const contents = isolated ? adaptBuildSource(rel, input) : input;
            if (isolated) loads.push({ path: rel, inputSha256: hashBytes(input), outputSha256: hashBytes(contents) });
            return { loader: 'js', contents };
          });
        } }] });
      } };
      const params = { fs, path, SRC, BUILD, unminified: false, esbuild: compiler, walk,
        PATCH_ROOT: path.join(source, 'patches/splatoon3'), QUALITY_ROOT: path.join(source, 'patches/local-quality'),
        RELIABILITY_ROOT: path.join(source, 'patches/reliability'), NETWORK_ROOT: path.join(source, 'patches/network-replication'),
        RANGE_ROOT: path.join(source, 'patches/practice-range'), NATIVE_ROOT: path.join(source, 'patches/native-stages'),
        compactEsm: code => compactModuleStrings(code).code, kb: String, gz: () => 0,
        console: { log() {} }, process: { env: {} },
      };
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      await new AsyncFunction(...Object.keys(params), stage)(...Object.values(params));
      return fs.readFileSync(path.join(BUILD, P.relativePath));
    } finally { fs.rmSync(BUILD, { recursive: true, force: true }); }
  }
  const repeatedRaw = await compile(false);
  assert.deepEqual(repeatedRaw, rawBytes, 'Real historical compile must reproduce the raw emitted bytes exactly');
  const isolated = await compile(true);
  assert.deepEqual(loads.map(load => load.path).sort(), Object.keys(inputs).sort(), 'Only the two independently verified Three source modules may load');
  assert.equal(hashBytes(isolated), P.isolated, 'Controlled compiled bytes differ from independently verified UUID-isolated output');
  assert.equal(hashBytes(fs.readFileSync(path.join(site, 'inkwave-build.json'))), hashBytes(manifestBytes));
  for (const rel of paths) assert.equal(hashBytes(fs.readFileSync(path.join(site, rel))), P.raw);
  const declaration = { ...P, sourceBuild: manifest.contentHash, sourceManifestSha256: hashBytes(manifestBytes),
    historicalStageSha256: hashBytes(stage), paths, loads: loads.sort((a, b) => a.path.localeCompare(b.path)),
    note: 'Controlled QA comparison only. Historical source, build, manifest and raw A/A evidence remain unmodified. No gameplay, paint, model, pose or RNG gate is waived.' };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'three.module.js'), isolated);
  fs.writeFileSync(path.join(output, 'declaration.json'), JSON.stringify(declaration, null, 2) + '\n');
  return declaration;
}

export function loadUuidComparison(directory, siteRoot) {
  const declaration = JSON.parse(read(path.join(directory, 'declaration.json')));
  for (const [key, value] of Object.entries(P)) assert.deepEqual(declaration[key], value, 'Unreviewed comparison declaration: ' + key);
  const manifestBytes = fs.readFileSync(path.join(siteRoot, 'inkwave-build.json')), manifest = JSON.parse(manifestBytes);
  assert.equal(declaration.sourceManifestSha256, hashBytes(manifestBytes));
  assert.equal(declaration.sourceBuild, manifest.contentHash);
  assert.deepEqual(declaration.paths, [P.relativePath, `_versions/${manifest.build.revision}/${P.relativePath}`]);
  for (const rel of declaration.paths) {
    assert.equal(manifest.artifacts[rel], P.raw);
    assert.equal(hashBytes(fs.readFileSync(path.join(siteRoot, rel))), P.raw);
  }
  const bytes = fs.readFileSync(path.join(directory, 'three.module.js'));
  assert.equal(hashBytes(bytes), P.isolated);
  return { declaration, bytes };
}


export const NATIVE_MUSIC_TIMER_SOURCE = 'let id=0;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';
const GENERATED_TIMER_KEY = '@generated/native-music-timer-worker';
const TIMER_KIND = 'native-music-timer-worker-v1';
const timerBytes = Buffer.from(NATIVE_MUSIC_TIMER_SOURCE);
function balancedEnd(code,start,open,close) {
  let depth=0,quote=null;
  for(let i=start;i<code.length;i++){
    const c=code[i];
    if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='/'&&code[i+1]==='/'){i=code.indexOf('\n',i+2);if(i<0)return -1;continue;}
    if(c==='/'&&code[i+1]==='*'){i=code.indexOf('*/',i+2);if(i<0)return -1;i++;continue;}
    if(c===open)depth++;else if(c===close&&!--depth)return i+1;
  }
  return -1;
}
function sourcePosition(code,at) {
  const prefix=code.slice(0,at),last=prefix.lastIndexOf('\n');
  return {line:prefix.split('\n').length,column:at-last};
}
function describeTimerCreator(code) {
  const methods=[...code.matchAll(/_startTimer\(\)\s*\{/g)];if(methods.length!==1)return null;
  const start=methods[0].index,brace=code.indexOf('{',start),end=balancedEnd(code,brace,'{','}');if(end<0)return null;
  const body=code.slice(brace+1,end-1);
  const literal=body.indexOf(NATIVE_MUSIC_TIMER_SOURCE);
  if(literal<0||body.indexOf(NATIVE_MUSIC_TIMER_SOURCE,literal+1)>=0)return null;
  // Identify the exact literal binding, its Blob argument and the URL passed
  // to Worker. Esbuild may merge declarations or retain an error-cleanup alias.
  const literalStart=literal-1,quote=body[literalStart];if(!['"',"'"].includes(quote)||body[literal+NATIVE_MUSIC_TIMER_SOURCE.length]!==quote)return null;
  const prefix=body.slice(0,literalStart),assignment=/([A-Za-z_$][\w$]*)\s*=\s*$/.exec(prefix);if(!assignment)return null;
  const src=assignment[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const createPattern=new RegExp('URL\\.createObjectURL\\s*\\(\\s*new\\s+Blob\\s*\\(\\s*\\[\\s*'+src+'\\s*\\]\\s*,\\s*\\{\\s*type\\s*:\\s*[\\\"\\\']text/javascript[\\\"\\\']\\s*\\}\\s*\\)\\s*\\)','g');
  const creates=[...body.matchAll(createPattern)];if(creates.length!==1||creates[0].index<=literal)return null;
  const workers=[...body.matchAll(/new\s+Worker\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)];if(workers.length!==1||workers[0].index<=creates[0].index)return null;
  const id=workers[0][1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!new RegExp('(?:const\\s+|let\\s+|var\\s+|,)'+id+'\\s*=\\s*(?:[A-Za-z_$][\\w$]*\\s*=\\s*)*$').test(body.slice(0,creates[0].index).replace(/\s+/g,' ')))return null;
  const span=match=>{const at=brace+1+match.index;return {start:sourcePosition(code,at),end:sourcePosition(code,at+match[0].length)};};
  return {kind:TIMER_KIND,sha256:hashBytes(timerBytes),bytes:timerBytes.length,calls:{create:span(creates[0]),worker:span(workers[0])}};
}
function assertCallsite(frame,range) {
  const valid=p=>Number.isInteger(p?.line)&&p.line>0&&Number.isInteger(p.column)&&p.column>0;
  assert(valid(range?.start)&&valid(range?.end),'Missing native worker source callsite span');
  const compare=(a,b)=>a.line-b.line||a.column-b.column;
  assert(compare(range.start,range.end)<0,'Invalid native worker source callsite span');
  assert(compare(frame,range.start)>=0&&compare(frame,range.end)<0,'Worker creation stack is outside the pinned native callsite');
}

export function createBlobWorkerEvidence() {
  return { schema:1, creations:Object.create(null), responses:Object.create(null), workers:Object.create(null) };
}
function creatorFrame(stack, origin) {
  assert.equal(typeof stack,'string','Missing generated worker creation stack');
  const frames=stack.split('\n').filter(line=>/https?:\/\//.test(line));
  assert(frames.length,'Missing generated worker creator frame');
  const match=/\bat\s+[^\s(]*\.?_startTimer\s*\((https?:\/\/[^\s)]+):(\d+):(\d+)\)\s*$/.exec(frames[0]);
  assert(match,'Generated worker creator is not native _startTimer');
  const url=new URL(match[1]);assert.equal(url.origin,origin,'Unexpected worker creator origin');
  assert.equal(url.search,'','Unexpected worker creator query');assert.equal(url.hash,'','Unexpected worker creator fragment');
  return {path:decodeURIComponent(url.pathname).replace(/^\//,''),line:Number(match[2]),column:Number(match[3]),method:'_startTimer'};
}
export function recordBlobWorkerCreation(evidence, payload, origin, {mainFrame,frameUrl}) {
  assert.equal(evidence?.schema,1,'Missing blob worker evidence');
  assert.equal(mainFrame,true,'Generated worker must be created in the captured main frame');
  assert.equal(new URL(frameUrl).origin,origin,'Generated worker frame is foreign');
  assert(!payload?.error,'Generated worker capture failed: '+payload?.error);
  const url=new URL(payload.url);assert.equal(url.protocol,'blob:','Unexpected generated worker protocol');
  assert.equal(url.origin,origin,'Unexpected generated worker origin');
  assert.equal(payload.mime,'text/javascript','Unexpected generated worker MIME');
  assert.equal(payload.workerOptions,'default','Native timer Worker options changed');
  assert(Array.isArray(payload.bytes)&&payload.bytes.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Missing exact generated worker bytes');
  const bytes=Buffer.from(payload.bytes);assert.deepEqual(bytes,timerBytes,'Unrecognized generated worker bytes');
  assert.equal(payload.size,bytes.length,'Generated worker size changed');
  const creator=creatorFrame(payload.creationStack,origin),worker=creatorFrame(payload.workerStack,origin);
  assert.equal(worker.path,creator.path,'Worker constructor and Blob creator differ');
  const row={url:url.href,mime:payload.mime,size:bytes.length,sha256:hashBytes(bytes),creator,worker,mainFrame:true};
  assert(!evidence.creations[url.href],'Generated worker URL constructed more than once');
  evidence.creations[url.href]=row;return row;
}
export function observeGeneratedWorker(evidence, url, origin) {
  const parsed=new URL(url);
  assert.notEqual(parsed.protocol,'data:','Unbound data Worker');
  if(parsed.protocol!=='blob:')return;
  assert.equal(parsed.origin,origin,'Foreign Blob Worker');evidence.workers[parsed.href]=true;
}
function verifyTimerModule(actual, loaded, manifest) {
  assert.equal(actual.kind,TIMER_KIND,'Unrecognized generated executable');
  assert.equal(actual.sha256,hashBytes(timerBytes),'Generated worker source changed');assert.equal(actual.bytes,timerBytes.length);
  const p=actual.provenance;assert.equal(p?.schema,1);assert.equal(p.mainFrame,true);assert.equal(p.mime,'text/javascript');
  assert.equal(p.operation,'URL.createObjectURL+Worker');assert.equal(p.workerOptions,'default');
  for(const frame of [p.creator,p.worker]){
    assert.equal(frame.method,'_startTimer');assert(Number.isInteger(frame.line)&&frame.line>0);assert(Number.isInteger(frame.column)&&frame.column>0);
    const version=manifest.build?.revision;
    assert(frame.path==='src/audio/music.js'||typeof version==='string'&&frame.path===`_versions/${version}/src/audio/music.js`,'Unrecognized generated worker creator path');
  }
  assert.equal(p.creator.path,p.worker.path);
  const creator=loaded[p.creator.path];assert(creator,'Generated worker creator was not actually loaded');
  assert(Object.hasOwn(manifest.artifacts,p.creator.path),'Generated worker creator is not pinned');
  assert.equal(creator.sha256,manifest.artifacts[p.creator.path],'Generated worker creator bytes differ');
  assert.equal(p.creatorSha256,creator.sha256,'Generated worker provenance is not bound to loaded creator');
  const source=creator.generatedTimerSource;
  assert.equal(source?.kind,TIMER_KIND,'Loaded creator does not contain the native timer literal/method');
  assert.equal(typeof source.creatorSourceUtf8,'string','Exact loaded creator bytes missing from generated worker receipt');
  assert.equal(hashBytes(Buffer.from(source.creatorSourceUtf8)),creator.sha256,'Recorded creator source is not the actually loaded/pinned module');
  const {creatorSourceUtf8,...description}=source;
  assert.deepEqual(description,describeTimerCreator(creatorSourceUtf8),'Generated worker source callsites are not derived from pinned creator bytes');
  assert.equal(source.sha256,actual.sha256);assert.equal(source.bytes,actual.bytes);
  assertCallsite(p.creator,source.calls?.create);assertCallsite(p.worker,source.calls?.worker);
}
export function bindBlobWorkerEvidence(evidence, loaded, manifest) {
  assert.equal(evidence?.schema,1,'Missing blob worker evidence');
  const urls=new Set([...Object.keys(evidence.creations),...Object.keys(evidence.responses),...Object.keys(evidence.workers)]);
  for(const url of urls){
    const creation=evidence.creations[url],response=evidence.responses[url];
    assert(creation,'Unobserved Blob worker creation: '+url);assert(response,'Blob worker executable response missing: '+url);
    assert(evidence.workers[url],'Blob URL was not observed as a Worker: '+url);
    assert.deepEqual(response,{sha256:creation.sha256,bytes:creation.size},'Blob worker response differs from immutable creation bytes');
    const actual={kind:TIMER_KIND,sha256:response.sha256,bytes:response.bytes,provenance:{schema:1,
      operation:'URL.createObjectURL+Worker',mime:creation.mime,workerOptions:'default',mainFrame:true,
      creator:creation.creator,worker:creation.worker,creatorSha256:loaded[creation.creator.path]?.sha256}};
    verifyTimerModule(actual,loaded,manifest);
    if(loaded[GENERATED_TIMER_KEY])assert.deepEqual(loaded[GENERATED_TIMER_KEY],actual,'Native timer creator changed within capture');
    loaded[GENERATED_TIMER_KEY]=actual;
  }
  return urls.size;
}

// Init-script observer only: production bytes and Worker execution are never
// replaced. Raw creation URL/stacks are kept outside canonical module identity.
export function installBlobWorkerObserver({bindingName}) {
  const NativeWorker=globalThis.Worker,NativeBlob=globalThis.Blob,NativeURL=globalThis.URL,NativeError=globalThis.Error;
  const create=NativeURL.createObjectURL,bytesOf=NativeBlob.prototype.arrayBuffer,report=globalThis[bindingName];
  const blobs=new Map(),pending=[];
  const createDescriptor=Object.getOwnPropertyDescriptor(NativeURL,'createObjectURL');
  Object.defineProperty(NativeURL,'createObjectURL',{...createDescriptor,value:function(blob){
    const url=Reflect.apply(create,this,arguments);
    if(blob instanceof NativeBlob&&blob.size<=4096&&blob.type==='text/javascript')
      blobs.set(url,{blob,creationStack:String(new NativeError().stack||'')});return url;
  }});
  function ObservedWorker(url,options){
    if(!new.target)return Reflect.apply(NativeWorker,this,arguments);
    const resolved=new NativeURL(String(url),location.href);
    if(resolved.protocol==='blob:'||resolved.protocol==='data:'){
      const entry=blobs.get(resolved.href),workerStack=String(new NativeError().stack||'');
      const task=(async()=>{
        if(!entry||!(entry.blob instanceof NativeBlob)||entry.blob.size>4096)throw new NativeError('Unknown/oversized generated worker Blob');
        return {url:resolved.href,mime:entry.blob.type,size:entry.blob.size,
          bytes:Array.from(new Uint8Array(await Reflect.apply(bytesOf,entry.blob,[]))),
          creationStack:entry.creationStack,workerStack,workerOptions:arguments.length===1?'default':'explicit'};
      })().then(payload=>report(payload)).catch(error=>report({error:String(error?.message||error)}));
      pending.push(task);
    }
    return Reflect.construct(NativeWorker,Array.from(arguments),new.target===ObservedWorker?NativeWorker:new.target);
  }
  Object.setPrototypeOf(ObservedWorker,NativeWorker);ObservedWorker.prototype=NativeWorker.prototype;
  globalThis.Worker=ObservedWorker;
  Object.defineProperty(globalThis,'__inkwaveBlobWorkerAudit',{configurable:false,writable:false,value:Object.freeze({
    async flush(){let count;do{count=pending.length;await Promise.all(pending.slice());}while(count!==pending.length);},
  })});
}

// Observe executable responses, not only same-origin filenames. Any script
// outside the pinned site must fail instead of disappearing from its receipt.
export async function recordLoadedModuleResponse(response, origin, loadedModules, blobEvidence = null) {
  const url = new URL(response.url());
  const type = response.request().resourceType();
  const mime = (response.headers()['content-type'] || '').split(';')[0].trim();
  const script = type === 'script' || url.protocol === 'blob:' && (type === 'other' || type === 'worker') || /\.m?js$/.test(url.pathname) || /^(?:text|application)\/(?:javascript|ecmascript|x-javascript)$/i.test(mime);
  if (!script) return false;
  assert.equal(url.origin, origin, 'Unexpected script origin: ' + url.origin);
  assert(response.ok(), 'Failed loaded module: ' + url.pathname);
  const bytes = await response.body();
  const actual = { sha256: hashBytes(bytes), bytes: bytes.length };
  if(url.protocol==='blob:'){
    assert.equal(blobEvidence?.schema,1,'Blob executable lacks creation provenance');
    if(blobEvidence.responses[url.href])assert.deepEqual(blobEvidence.responses[url.href],actual,'Blob response changed within capture');
    blobEvidence.responses[url.href]=actual;return true;
  }
  assert(['http:','https:'].includes(url.protocol),'Unexpected executable protocol');
  const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
  if(rel==='src/audio/music.js'||/^_versions\/[^/]+\/src\/audio\/music\.js$/.test(rel)){
    const creator=describeTimerCreator(bytes.toString('utf8'));
    if(creator){const creatorSourceUtf8=bytes.toString('utf8');assert.deepEqual(Buffer.from(creatorSourceUtf8),bytes,'Generated worker creator must be exact UTF-8');actual.generatedTimerSource={...creator,creatorSourceUtf8};}
  }
  if (loadedModules[rel]) assert.deepEqual(loadedModules[rel], actual, 'Loaded module changed within capture: ' + rel);
  loadedModules[rel] = actual;
  return true;
}

export function verifyLoadedModules(loaded, manifest, isolation = null) {
  const entries = Object.entries(loaded).sort(([a], [b]) => a.localeCompare(b));
  assert(entries.length > 100, 'Complete loaded runtime module evidence is required');
  let isolatedLoads = 0;
  for (const [rel, actual] of entries) {
    if(rel===GENERATED_TIMER_KEY){verifyTimerModule(actual,loaded,manifest);continue;}
    assert(Object.hasOwn(manifest.artifacts, rel), 'Unbound loaded module: ' + rel);
    const controlled = isolation?.paths.includes(rel);
    if (controlled) {
      assert.equal(manifest.artifacts[rel], P.raw);
      isolatedLoads++;
    }
    assert.equal(actual.sha256, controlled ? P.isolated : manifest.artifacts[rel], 'Loaded bytes differ: ' + rel);
    assert(Number.isInteger(actual.bytes) && actual.bytes > 0);
  }
  if (isolation) assert(isolatedLoads > 0, 'The declared controlled module was not loaded');
  return { schema: 1, mode: isolation ? P.kind : 'unmodified-production', moduleCount: entries.length,
    isolatedLoads, sha256: hashBytes(JSON.stringify(entries)), modules: Object.fromEntries(entries) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [sourceRoot, siteRoot, outDir] = process.argv.slice(2);
  assert(sourceRoot && siteRoot && outDir, 'Usage: node inkwave-roller-uuid-comparison.mjs SOURCE SITE NEW_OUTPUT');
  console.log(JSON.stringify(await prepareUuidComparison({ sourceRoot, siteRoot, outDir }), null, 2));
}
