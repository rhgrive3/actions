// Post-minification startup adapter. No upstream/gameplay source is overwritten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from './vendor/acorn.mjs';
// Generous but finite delivery budgets. Raising these limits does NOT force
// more bytes to download: the existing dependency graph and on-demand policy
// continue to choose the actual files. Worker/cache identity remains strict.
export const PRECACHE_BUDGET_BYTES = 24 * 1024 * 1024;
export const REVISION_BUDGET_BYTES = 48 * 1024 * 1024;
export const WORKER_BUDGET_BYTES = 192 * 1024;
export const INITIAL_JS_BUDGET_BYTES = 6 * 1024 * 1024;
export const RANGE_PRELOAD_BUDGET_BYTES = 384 * 1024;
export const STARTUP_ENTRY_BUDGET_BYTES = 24 * 1024;
export const CRITICAL_HTML_BUDGET_BYTES = 48 * 1024;
export const LOADING_ROOT = path.dirname(fileURLToPath(import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const filesIn = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.name !== '.rsync-tmp').flatMap(e => e.isDirectory() ? filesIn(path.join(dir,e.name)) : [path.join(dir,e.name)]).sort();
const countReplace = (source, find, replacement, label) => {
  const found = typeof find === 'string' ? source.split(find).length - 1 : [...source.matchAll(new RegExp(find.source, find.flags.includes('g') ? find.flags : find.flags+'g'))].length;
  if (found !== 1) throw new Error(`loading-cache compatibility: ${label} (${found} matches)`);
  return source.replace(find,replacement);
};
function walkNode(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (visitor(node) === false) return;
  for (const v of Object.values(node)) if (Array.isArray(v)) v.forEach(n=>walkNode(n,visitor)); else if (v && typeof v === 'object') walkNode(v,visitor);
}
const phaseNames = ['ui-modules','diorama-module','progress-mixing','game-audio-modules','props-module','progress-plaza','mural-generation','texture-library-module','procedural-textures','stage-build','progress-harbor','progress-swim','fx-hooks','screen-fx','net-session','progress-tuning','progress-warmup','shader-compile','progress-post-compile','warmup-frame-yield','progress-ready','readiness-dwell'];
function reviewedBootPhases(ast, boot, awaits, methods) {
  const declarations=[], waveCalls=[];
  walkNode(boot.value.body,node=>{
    if (['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration','ClassDeclaration'].includes(node.type)) return false;
    if(node.type==='VariableDeclarator')declarations.push(node);
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.property.name==='prewarmWaveTexture')waveCalls.push(node);
  });
  const topology=()=>{throw new Error('loading-cache compatibility: boot phase topology changed');};
  let names=phaseNames;
  if(waveCalls.length) {
    // The reviewed concurrent epoch starts both resources before texlib and joins
    // mural, then wave, before world construction. Resolve lexical bindings so
    // minifier renaming cannot relabel or silently omit either join.
    const deferredLegacy = awaits.length === phaseNames.length;
    const prefix = phaseNames.slice(0,6).filter(name=>!deferredLegacy||name!=='props-module');
    names=[...prefix,'texture-library-module','procedural-textures','mural-generation','wave-generation',...phaseNames.slice(9)];
    const binding=node=>node?.type==='Identifier'?declarations.find(d=>d.id.type==='Identifier'&&d.id.name===node.name)?.init:null;
    const at=name=>awaits[names.indexOf(name)]?.argument;
    const wave=waveCalls[0];let mural=binding(at('mural-generation'));
    const env=declarations.find(d=>d.init===awaits[3]&&d.id.type==='ArrayPattern')?.id.elements[2];
    const muralAlias=ast.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value==='./world/murals.js').flatMap(n=>n.specifiers).find(s=>s.imported?.name==='createMuralTexture')?.local.name;
    const texlib=declarations.find(d=>d.init===awaits[names.indexOf('texture-library-module')]&&d.id.type==='ObjectPattern')?.id.properties.find(p=>p.key.name==='createTextureLibrary')?.value;
    const signal=wave.arguments[0]?.properties?.[0]?.value, controller=binding(signal?.object);
    if(deferredLegacy){
      // Reviewed successor: only a URL-confirmed native autostart resolves the
      // unused mural to null. Its legacy alternate and both resource joins stay
      // bound to the original factories. Legacy props move behind the native
      // early return; an arbitrary missing boot await is never accepted.
      const imported=(file,name)=>ast.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value===file).flatMap(n=>n.specifiers).find(s=>s.imported?.name===name)?.local.name;
      const enabled=imported('../patches/native-stages/runtime/registry.mjs','nativeStageEnabled');
      const ids=imported('../patches/native-stages/runtime/registry.mjs','NATIVE_IDS');
      const nativeBuild=imported('../patches/native-stages/runtime/engine.mjs','buildNativeWorld');
      const isId=(n,name)=>!!name&&n?.type==='Identifier'&&n.name===name;
      const member=(n,name)=>n?.type==='MemberExpression'&&!n.computed&&n.property.name===name;
      const call=(n,object,name)=>n?.type==='CallExpression'&&member(n.callee,name)&&isId(n.callee.object,object);
      const and=n=>n?.type==='LogicalExpression'&&n.operator==='&&'?[...and(n.left),...and(n.right)]:[n];
      const layout=(n,name)=>n?.type==='LogicalExpression'&&n.operator==='||'&&member(n.left,'layout')&&isId(n.left.object,name)&&member(n.right,'id')&&isId(n.right.object,name);
      const condition=and(binding(mural?.test)||mural?.test), params=condition[0]?.callee?.object;
      const moduleBinding=ast.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(d=>isId(d.id,params?.name))?.init;
      const worldCall=at('stage-build'), map=worldCall?.arguments[0]?.name;
      const skip=mural?.consequent, props=skip?.arguments?.[0]?.properties;
      const truth=n=>n?.type==='Literal'&&n.value===true||n?.type==='UnaryExpression'&&n.operator==='!'&&n.argument.type==='Literal'&&n.argument.value===0;
      const world=methods.get('_buildWorld'), helper=methods.get('_prepareLegacyPropRuntime');
      const helperImports=[], bootImports=[], helperCalls=[], muralCalls=[];
      walkNode(helper?.value?.body,n=>{if(n.type==='ImportExpression')helperImports.push(n);});
      walkNode(boot.value.body,n=>{if(n.type==='ImportExpression'&&n.source.value==='./world/prop-packs.js')bootImports.push(n);});
      walkNode(world?.value?.body,n=>{if(n.type==='AwaitExpression'&&n.argument.type==='CallExpression'&&n.argument.callee.object?.type==='ThisExpression'){
        if(n.argument.callee.property?.name==='_prepareLegacyPropRuntime')helperCalls.push(n);
        if(n.argument.callee.property?.name==='_prepareLegacyMurals')muralCalls.push(n);
      }});
      const h=helperCalls[0], hm=muralCalls[0], worldLayout=h?.argument.arguments[0]?.name, current=h?.argument.arguments[1]?.name;
      const branch=world?.value?.body.body.find(n=>n.type==='IfStatement'&&and(n.test).length===2&&isId(and(n.test)[0],enabled)&&call(and(n.test)[1],ids,'includes'));
      const branchCall=branch?.consequent.body?.[0]?.expression?.argument;
      if(mural?.type!=='ConditionalExpression'||condition.length!==3||!call(condition[0],params?.name,'has')||condition[0].arguments.length!==1||condition[0].arguments[0].value!=='autostart'||
        moduleBinding?.type!=='NewExpression'||moduleBinding.callee.name!=='URLSearchParams'||moduleBinding.arguments.length!==1||!member(moduleBinding.arguments[0],'search')||!isId(moduleBinding.arguments[0].object,'location')||
        !isId(condition[1],enabled)||!call(condition[2],ids,'includes')||condition[2].arguments.length!==1||!layout(condition[2].arguments[0],map)||
        !call(skip,'Promise','resolve')||skip.arguments.length!==1||skip.arguments[0].type!=='ObjectExpression'||props?.length!==2||props[0].key.name!=='ok'||!truth(props[0].value)||props[1].key.name!=='value'||props[1].value.type!=='Literal'||props[1].value.value!==null||
        mural.alternate?.callee?.object?.arguments?.length!==1||!layout(mural.alternate.callee.object.arguments[0],map)||
        !helper?.value.async||helperImports.length!==1||helperImports[0].source.value!=='./world/prop-packs.js'||bootImports.length||helperCalls.length!==1||muralCalls.length!==1||!methods.get('_prepareLegacyMurals')?.value.async||
        !branch||branch.consequent.type!=='BlockStatement'||branch.consequent.body.length!==2||branch.consequent.body[0].expression.type!=='AwaitExpression'||branch.consequent.body[1].type!=='ReturnStatement'||branch.consequent.body[1].argument||
        !isId(branchCall?.callee,nativeBuild)||branchCall.arguments.length!==3||branchCall.arguments[0].type!=='ThisExpression'||!isId(branchCall.arguments[1],world.value.params[0]?.name)||!isId(branchCall.arguments[2],current)||
        !isId(and(branch.test)[1].arguments[0],worldLayout)||h.start<branch.end||hm.start<h.end||hm.argument.arguments.length!==2||!isId(hm.argument.arguments[0],worldLayout)||!isId(hm.argument.arguments[1],current))topology();
      mural=mural.alternate;
    }
    if(waveCalls.length!==1||awaits.length!==names.length||
      at('texture-library-module')?.type!=='ImportExpression'||at('texture-library-module').source.value!=='./world/texlib.js'||
      !texlib||at('procedural-textures')?.type!=='CallExpression'||at('procedural-textures').callee.name!==texlib.name||
      mural?.type!=='CallExpression'||mural.callee.type!=='MemberExpression'||mural.callee.property.name!=='then'||mural.arguments.length!==2||
      mural.callee.object.type!=='CallExpression'||mural.callee.object.callee.name!==muralAlias||!muralAlias||
      binding(at('wave-generation'))!==wave||wave.callee.object.name!==env?.name||!env||
      wave.arguments.length!==1||wave.arguments[0].type!=='ObjectExpression'||wave.arguments[0].properties.length!==1||wave.arguments[0].properties[0].key.name!=='signal'||
      signal?.type!=='MemberExpression'||signal.property.name!=='signal'||controller?.type!=='NewExpression'||controller.callee.name!=='AbortController'||controller.arguments.length!==0||
      at('stage-build')?.type!=='CallExpression'||at('stage-build').callee.object?.type!=='ThisExpression'||at('stage-build').callee.property?.name!=='_buildWorld')topology();
  }
  const shader=awaits[names.indexOf('shader-compile')]?.argument;
  if(awaits.length!==names.length||shader?.type!=='CallExpression'||shader.callee.type!=='MemberExpression'||shader.callee.property.name!=='compileAsync')topology();
  return names;
}
export function adaptCompiledMain(source) {
  if (source.includes('__iwStartupMeasure')) throw new Error('loading-cache adapter applied twice');
  const ast = parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const classes = ast.body.filter(n=>n.type==='ClassDeclaration' && n.body.body.some(m=>m.key?.name==='boot'));
  if (classes.length!==1) throw new Error('loading-cache compatibility: one Game class required');
  const cls=classes[0], methods=new Map(cls.body.body.filter(m=>m.type==='MethodDefinition').map(m=>[m.key.name,m]));
  const boot=methods.get('boot');
  const awaits=[];
  walkNode(boot.value.body, node=>{
    if (['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration','ClassDeclaration'].includes(node.type)) return false;
    if (node.type==='AwaitExpression') { awaits.push(node); return false; }
  });
  const phases=reviewedBootPhases(ast,boot,awaits,methods);
  const dwell=awaits.at(-1).argument;
  const callback=dwell.arguments?.[0];
  if (dwell.type!=='NewExpression'||dwell.callee.name!=='Promise'||callback?.type!=='ArrowFunctionExpression'||callback.params.length!==1||callback.body.type!=='CallExpression'||callback.body.callee.name!=='setTimeout'||callback.body.arguments.length!==2||callback.body.arguments[0].name!==callback.params[0].name||callback.body.arguments[1].value!==250) throw new Error('loading-cache compatibility: expected explicit 250ms ready dwell');
  const timer=callback.body.arguments[1];
  const edits=[];
  // The deployment already content-addresses the entire tree. A second lightmap
  // query creates a different cache key and makes the precached PNG unreachable.
  const lightmap=methods.get('_loadLightmap');
  if(!lightmap)throw new Error('loading-cache compatibility: lightmap method missing');
  const mapTemplates=[],mapCache=[];
  walkNode(lightmap.value.body,node=>{
    if(node.type==='TemplateLiteral' && node.quasis.length===3 && node.quasis[0].value.raw==='assets/lightmaps/' && node.quasis[1].value.raw==='.png?h=' && node.quasis[2].value.raw==='')mapTemplates.push(node);
    if(node.type==='Property' && (node.key.name||node.key.value)==='cache' && node.value.value==='no-cache')mapCache.push(node.value);
  });
  if(mapTemplates.length!==1 || mapCache.length!==1)throw new Error('loading-cache compatibility: lightmap cache topology changed');
  const png=mapTemplates[0];
  if(png.expressions[1]?.type!=='MemberExpression' || png.expressions[1].property.name!=='hash')throw new Error('loading-cache compatibility: expected lightmap hash');
  edits.push({start:png.start,end:png.end,text:'`assets/lightmaps/${'+source.slice(png.expressions[0].start,png.expressions[0].end)+'}.png`'});
  edits.push({start:mapCache[0].start,end:mapCache[0].end,text:'"force-cache"'});
  for (let i=0;i<awaits.length;i++) {
    const expr=awaits[i].argument;
    let text=source.slice(expr.start,expr.end);
    if(i===awaits.length-1) text=text.slice(0,timer.start-expr.start)+'0'+text.slice(timer.end-expr.start);
    edits.push({start:expr.start,end:expr.end,text:`__iwStartupMeasure(${JSON.stringify('boot/'+phases[i])},()=>(${text}))`});
  }
  const aliases = new Map();
  for(const imp of ast.body.filter(n=>n.type==='ImportDeclaration')) for(const spec of imp.specifiers) if(spec.imported)aliases.set(spec.local.name,spec.imported.name);
  walkNode(boot.value.body,node=>{
    if(['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration','ClassDeclaration'].includes(node.type))return false;
    if(node.type==='AwaitExpression')return false;
    if(node.type==='NewExpression'){
      const label=node.callee.type==='Identifier'?(aliases.get(node.callee.name)||node.callee.name):node.callee.property?.name;
      if(label && label!=='Promise') edits.push({start:node.start,end:node.end,text:`__iwStartupMeasure(${JSON.stringify('construct/'+label)},()=>(${source.slice(node.start,node.end)}))`});
      return false;
    }
  });
  edits.push({start:boot.value.body.start+1,end:boot.value.body.start+1,text:`globalThis.__inkwaveStartup?.mark?.('engine-boot-start');`});
  edits.push({start:boot.value.body.end-1,end:boot.value.body.end-1,text:`;globalThis.__inkwaveStartup?.engineReady?.(this);`});
  // The game starts boot() without awaiting it at module scope. Its own catch
  // otherwise swallows late dynamic-import failures before startup sees them.
  const bootCatches=[];
  walkNode(ast,node=>{
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression' && node.callee.property.name==='catch' &&
        node.callee.object.type==='CallExpression' && node.callee.object.callee.type==='MemberExpression' &&
        node.callee.object.callee.property.name==='boot') bootCatches.push(node.arguments[0]);
  });
  const bootCatch=bootCatches[0];
  if(bootCatches.length!==1 || bootCatch?.params?.[0]?.type!=='Identifier' || bootCatch.body.type!=='BlockStatement')
    throw new Error('loading-cache compatibility: boot failure handler missing');
  edits.push({start:bootCatch.body.end-1,end:bootCatch.body.end-1,text:`;globalThis.__inkwaveStartup?.bootFailed?.(${bootCatch.params[0].name});`});
  const start=methods.get('startMatch');
  if(!start?.value.async)throw new Error('loading-cache compatibility: async startMatch required');
  edits.push({start:start.value.body.start+1,end:start.value.body.start+1,text:`globalThis.__inkwaveStartup?.mark?.('first-battle-request');`});
  edits.push({start:start.value.body.end-1,end:start.value.body.end-1,text:`;globalThis.__inkwaveStartup?.battleReady?.(this);`});
  edits.sort((a,b)=>b.start-a.start);
  for(let i=1;i<edits.length;i++)if(edits[i].end>edits[i-1].start)throw new Error('loading-cache: overlapping syntax edits');
  let result=source;
  for(const edit of edits)result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
  result=`function __iwStartupMeasure(name,run){const measure=globalThis.__inkwaveStartup?.measure;return measure?measure(name,run):run();}\n`+result;
  parse(result,{ecmaVersion:'latest',sourceType:'module'});
  return { code:result, phases:phases.map((name,i)=>({name:'boot/'+name,source:source.slice(awaits[i].start,awaits[i].end)})), removedDwellMs:250, shaderWarmupUnchanged:true, redundantLightmapQueryRemoved:true };
}
export function loadingIdentity() {
  return Object.fromEntries(filesIn(LOADING_ROOT).filter(file=>!file.includes(`${path.sep}tests${path.sep}`)&&!file.endsWith('.md')).map(file=>[path.relative(LOADING_ROOT,file).split(path.sep).join('/'),hash(fs.readFileSync(file))]));
}
// Cold offline cache only needs stages that can actually be played offline.
// The Cargo stage has onlineOnly:true; its lightmap remains versioned and
// cache-on-request but not in the install-time 24 MiB snapshot.
export const coldOfflineLightmap = rel => rel.startsWith('assets/lightmaps/') &&
  rel !== 'assets/lightmaps/cargo.png';
// Loading-screen backdrop: precached so a first offline launch still shows the arena art.
export const LOADING_ART_PRECACHE = 'patches/local-quality/assets/loading/arena.webp';
// These public synchronous entry points remain usable in an installed offline
// session even though production startup no longer imports their facades.
export const PROP_COMPATIBILITY_PRECACHE = Object.freeze(['src/world/props.js', 'src/world/stages/index.js']);
export function prepareLoading(build, preloads, options = {}) {
  // Compose main's startup-runtime minifier with the PR's explicit diagnostic
  // limits. Preserve the old third-argument callback for existing callers.
  const compactRuntime = typeof options === 'function' ? options : options.compactRuntime ?? (source => source);
  if (typeof compactRuntime !== 'function') throw new TypeError('loading-cache: invalid startup runtime compactor');
  const diagnosticUnminified = typeof options === 'function' ? false : !!options.diagnosticUnminified;
  // Production and diagnostic builds have independent, explicitly bounded sizes.
  // Diagnostic builds have no minifier/tree shaking and therefore get more room.
  const budget = diagnosticUnminified
    ? { mode: 'diagnostic-unminified', precache: 32 * 1024 * 1024, revision: 64 * 1024 * 1024, worker: 256 * 1024 }
    : { mode: 'production', precache: PRECACHE_BUDGET_BYTES, revision: REVISION_BUDGET_BYTES, worker: WORKER_BUDGET_BYTES };
  let html=fs.readFileSync(path.join(build,'index.html'),'utf8');
  if(/<base\s/i.test(html)||html.includes('inkwave-startup-shell'))throw new Error('loading-cache requires one unversioned staging tree');
  if(preloads.length!==new Set(preloads).size)throw new Error('loading-cache: duplicate preload inputs');
  // Preserve the baseline preload graph. Native preload A/B timing remains unverified; do not remove hints speculatively.
  html=countReplace(html,'<script type="module" src="./patches/splatoon3/bootstrap.mjs"></script>','<script type="module" src="./patches/loading-cache/runtime/startup.mjs"></script>','module entry');
  html=countReplace(html,/<script>if \("serviceWorker" in navigator && location\.protocol === "https:"\)[\s\S]*?<\/script>/,'','old PWA registration');
  const shell=countReplace(fs.readFileSync(path.join(LOADING_ROOT,'shell.html'),'utf8'),
    '/*__INKWAVE_STARTUP_RECOVERY__*/',fs.readFileSync(path.join(LOADING_ROOT,'recovery.js'),'utf8'),'inline recovery');
  html=countReplace(html,'<body>','<body>\n'+shell,'shell insertion');
  fs.writeFileSync(path.join(build,'index.html'),html);
  for(const file of filesIn(path.join(LOADING_ROOT,'runtime'))) {
    const rel=path.relative(LOADING_ROOT,file),dst=path.join(build,'patches/loading-cache',rel);
    fs.mkdirSync(path.dirname(dst),{recursive:true});
    if (rel === 'runtime/startup.mjs') {
      const original = fs.readFileSync(file, 'utf8'), compact = compactRuntime(original);
      if (typeof compact !== 'string' || !compact.length)
        throw new Error('loading-cache: invalid startup runtime transform');
      fs.writeFileSync(dst, compact);
      console.log('startup runtime: ' + Buffer.byteLength(original) + ' -> ' + Buffer.byteLength(compact) + ' bytes');
    } else fs.copyFileSync(file,dst);
  }
  const main=path.join(build,'src/main.js');
  const adapted=adaptCompiledMain(fs.readFileSync(main,'utf8'));fs.writeFileSync(main,adapted.code);
  // Template enters the deterministic revision input; only the root worker is stamped after versioning.
  fs.copyFileSync(path.join(LOADING_ROOT,'sw.js'),path.join(build,'sw.js'));
  const assets={};
  for(const file of filesIn(build)) {
    const rel=path.relative(build,file).split(path.sep).join('/');
    if(['index.html','sw.js','.nojekyll','inkwave-build.json'].includes(rel)||rel.startsWith('_versions/')||rel.includes('/dev/')||rel.endsWith('/sw.js'))continue;
    if(!/\.(?:m?js|css|json|png|jpg|jpeg|webp|svg|woff2|webmanifest|glb|gltf|ogg|mp3|wav)$/.test(rel))continue;
    // Audio MP3s are streamed on demand, not counted in the cold PWA revision budget.
    if(/^patches\/splatoon3\/runtime\/audio\/s3-real\/[A-Za-z0-9_.+()\-]+\.mp3$/.test(rel))continue;
    const bytes=fs.readFileSync(file);assets[rel]=[bytes.length,hash(bytes)];
  }
  const css=Object.keys(assets).filter(rel=>rel.endsWith('.css')); // Includes @import HUD CSS and non-./ HTML hrefs.
  // Cargo is an online-only/no-bots/no-boss stage (src/config.js). Its PNG
  // lightmap is integrity-checked and cached on first online use, not copied
  // into the 24 MiB cold-offline snapshot where that stage cannot be played.
  // All three playable offline stage lightmaps remain in the install snapshot.
  // PWA icons are fetched by the browser at install/display time, not game startup.
  // Keep all three versioned icon files in BUILD.assets for integrity-checked
  // cache-on-request; precache the manifest and actual gameplay dependencies.
  // Title-only Titan One remains hash-declared and cache-on-demand; all critical
  // game scripts, HUD fonts, current stage and Range lightmaps stay offline-ready.
  const core=new Set([...preloads,...css,...PROP_COMPATIBILITY_PRECACHE,'patches/loading-cache/runtime/startup.mjs','patches/splatoon3/profile.json',LOADING_ART_PRECACHE,...Object.keys(assets).filter(rel=>(rel.startsWith('assets/fonts/') && rel !== 'assets/fonts/TitanOne-latin.woff2')||coldOfflineLightmap(rel)||rel==='assets/stages/manifest.json'||rel==='patches/splatoon3/pwa/manifest.webmanifest'||/^patches\/local-quality\/ink-volume\/assets\/(roller|shooter)\/manifest\.json$/.test(rel))]);
  for(const rel of core)if(!assets[rel])throw new Error(`loading-cache: missing precache dependency ${rel}`);
  const precache=[...core].sort();
  const precacheBytes=precache.reduce((sum,rel)=>sum+assets[rel][0],0);
  const assetBytes=Object.values(assets).reduce((sum,a)=>sum+a[0],0);
  if(precacheBytes>budget.precache||assetBytes+512*1024>budget.revision)throw new Error(`loading-cache: ${budget.mode} payload budget exceeded (precache ${precacheBytes}/${budget.precache}, declared ${assetBytes+512*1024}/${budget.revision} bytes)`);
  return {assets,precache,assetBytes,precacheBytes,phases:adapted.phases,budget};
}
export function finalizeLoadingWorker(build, revision, plan, compactTemplate = source => source) {
  if(!/^[a-f0-9]{64}$/.test(revision))throw new Error('loading-cache: invalid revision');
  const index=fs.readFileSync(path.join(build,'index.html'));
  const positions=new Map(Object.keys(plan.assets).map((rel,i)=>[rel,i]));
  const precache=plan.budget?.mode==='production'?plan.precache.map(rel=>{
    if(!positions.has(rel))throw new Error('loading-cache: missing precache dependency '+rel);
    return positions.get(rel);
  }):plan.precache;
  const config={schema:1,revision,index:{bytes:index.length,sha256:hash(index)},declaredBytes:plan.assetBytes+index.length,precache,assets:plan.assets};
  let template=fs.readFileSync(path.join(LOADING_ROOT,'sw.js'),'utf8');
  if(plan.budget?.mode === 'diagnostic-unminified')
    template=countReplace(template,'const MAX_REVISION_BYTES = 48 * 1024 * 1024;',
      `const MAX_REVISION_BYTES = ${plan.budget.revision}; // explicit unminified diagnostic budget`,
      'diagnostic revision budget');
  // Compact executable whitespace before inserting JSON so its literal remains
  // directly auditable by the existing manifest/dependency gate.
  const marker='__INKWAVE_CACHE_CONFIG_VALUE__';
  const compact=compactTemplate(countReplace(template,'/*__INKWAVE_CACHE_BUILD__*/ null',marker,'worker template marker'));
  const worker=countReplace(compact,marker,JSON.stringify(config),'worker stamp');
  if(Buffer.byteLength(worker)>(plan.budget?.worker ?? WORKER_BUDGET_BYTES))throw new Error(`loading-cache: worker exceeds ${(plan.budget?.worker ?? WORKER_BUDGET_BYTES) / 1024} KiB declared budget (${Buffer.byteLength(worker)} bytes)`);
  fs.writeFileSync(path.join(build,'sw.js'),worker);
  return {revision,precacheCount:plan.precache.length,precacheBytes:plan.precacheBytes,declaredBytes:config.declaredBytes,maxRevisions:2,workerBytes:Buffer.byteLength(worker),budget:plan.budget};
}
