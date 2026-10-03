#!/usr/bin/env node
// Deterministic inventory + exact syntax import graph. No browser timings are inferred here.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { parse } from '../patches/loading-cache/vendor/acorn.mjs';
const root = path.resolve(process.argv[2] || '_site');
const out = path.resolve(process.argv[3] || 'reports/loading-cache/inventory');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('index.html');
const revision = html.match(/<base href="\.\/_versions\/([a-f0-9]{64})\/">/)?.[1] || null;
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] || '{"imports":{}}').imports;
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (!prefix && ['_versions','inkwave-build.json','.nojekyll'].includes(e.name)) return [];
    const rel = prefix + e.name;
    return e.isDirectory() ? walk(path.join(dir, e.name), rel + '/') : [rel];
  }).sort();
}
const files = walk(root);
const preloads = [...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map(m => m[1]);
const entry = html.match(/<script type="module" src="\.\/([^"]+)"/)?.[1];
const graph = {}, missing = [], unresolved = [];
const resolve = (from, spec) => {
  for (const [k,v] of Object.entries(map).sort((a,b) => b[0].length-a[0].length)) {
    if (k.endsWith('/') ? spec.startsWith(k) : spec === k) return path.posix.normalize(v.replace(/^\.\//,'') + (k.endsWith('/') ? spec.slice(k.length) : ''));
  }
  if (!spec.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
};
const literal = n => n?.type === 'Literal' && typeof n.value === 'string' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null;
function nodes(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const v of Object.values(node)) if (Array.isArray(v)) v.forEach(x=>nodes(x,visit)); else if (v && typeof v === 'object') nodes(v,visit);
}
for (const rel of files.filter(f=>/\.(m?js)$/.test(f))) {
  const source = read(rel), links = [];
  const add = (spec, kind) => {
    const target = resolve(rel,spec);
    if (!target) return;
    if (!links.some(l=>l.to===target && l.kind===kind)) links.push({to:target,kind});
    if (!fs.existsSync(path.join(root,target))) missing.push({from:rel,to:target,kind});
  };
  const ast = parse(source,{ecmaVersion:'latest',sourceType:'module'});
  nodes(ast,node=>{
    if (['ImportDeclaration','ExportAllDeclaration','ExportNamedDeclaration'].includes(node.type) && node.source) add(node.source.value,'static');
    if (node.type==='ImportExpression') {
      const spec=literal(node.source);
      if(spec) add(spec,'dynamic-literal'); else unresolved.push({from:rel,kind:'dynamic-expression',expression:source.slice(node.start,node.end).slice(0,150)});
    }
    if(node.type==='CallExpression' && node.callee.type==='Identifier') {
      const spec=literal(node.arguments[0]);
      if (spec?.startsWith('.') && /\.m?js$/.test(spec)) add(spec,'loader-call-candidate');
    }
  });
  graph[rel]=links;
}
function closure(start, kinds = new Set(['static'])) {
  const set=new Set();const visit=f=>{if(set.has(f)||!graph[f])return;set.add(f);for(const e of graph[f])if(kinds.has(e.kind))visit(e.to);};
  start.forEach(visit);return [...set].sort();
}
const menuOnly=closure(['src/ui/menus.js']);
const eager=new Set([...preloads,entry].filter(Boolean));
const types={'.js':'JS','.mjs':'JS','.css':'CSS','.json':'JSON','.woff2':'font','.webmanifest':'PWA manifest','.png':'image','.jpg':'image','.jpeg':'image','.svg':'image','.webp':'image','.glb':'model','.gltf':'model','.mp3':'audio','.ogg':'audio','.wav':'audio','.html':'HTML'};
function classify(rel) {
  if(rel==='index.html'||rel==='patches/loading-cache/runtime/startup.mjs'||rel.startsWith('styles/'))return {tier:0,firstUse:'shell / UI stylesheet (CSS remains render-blocking)'};
  if(menuOnly.includes(rel))return {tier:1,firstUse:'menu module graph; currently also coupled to full engine boot'};
  if(rel.startsWith('assets/fonts/'))return {tier:1,firstUse:'UI / mural canvas font; not required for system-font shell'};
  if(eager.has(rel)||rel==='patches/splatoon3/profile.json')return {tier:2,firstUse:'engine boot; before actual title in baseline'};
  if(rel.startsWith('assets/lightmaps/'))return {tier:3,firstUse:'selected stage construction'};
  if(rel.startsWith('assets/stages/'))return {tier:3,firstUse:'stage-selection/menu card images'};
  if(rel.includes('/news'))return {tier:4,firstUse:'news panel'};
  if(rel.includes('/pwa/'))return {tier:4,firstUse:'PWA installation / launcher'};
  if(rel.includes('/dev/'))return {tier:4,firstUse:'developer-only, not a startup requirement'};
  return {tier:3,firstUse:'conditional module/asset; runtime first-use requires browser trace'};
}
const assets=files.map(rel=>{
 const buf=fs.readFileSync(path.join(root,rel));
 return {path:rel,type:types[path.extname(rel)]||'other',bytes:buf.length,gzipBytes:zlib.gzipSync(buf,{level:9}).length,brotliBytes:zlib.brotliCompressSync(buf,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:6}}).length,sha256:crypto.createHash('sha256').update(buf).digest('hex'),...classify(rel),preloaded:eager.has(rel),currentLoadPhase:eager.has(rel)?'eager preload / entry':'conditional or static dependency',versioning:rel==='index.html'||rel==='sw.js'?'mutable root':`_versions/${revision || '<hash>'}/`,cachePolicy:rel==='index.html'?'network-first coherent offline fallback':rel==='sw.js'?'browser SW update check':`baseline: SW stale-while-revalidate (script/style/font/image only); patch: bounded revision cache-first allowlist`,cachePolicyObserved:null,timingStatus:'not captured: native browser navigation blocked',storageSourceExpected:rel==='index.html'?'network / coherent Cache Storage fallback':rel==='sw.js'?'browser SW update loader':'HTTP cache before control; revision Cache Storage after completed installation',necessaryForFirstMenuNow:eager.has(rel)||rel==='index.html'||rel.endsWith('.css')||rel.startsWith('assets/fonts/'),necessaryForFirstBattle:eager.has(rel)?'boot dependency':'selected asset / conditional; see firstUse',lazyCandidate:!menuOnly.includes(rel)&&!['index.html','sw.js'].includes(rel)};
});
const sum=(a,k)=>a.reduce((n,x)=>n+x[k],0);
const critical=assets.filter(a=>eager.has(a.path));
const summary={schema:1,revision,entry,modulePreloadCount:preloads.length,duplicatePreloads:preloads.length-new Set(preloads).size,initialJSRequests:critical.filter(a=>a.type==='JS').length,initialJSBytes:sum(critical.filter(a=>a.type==='JS'),'bytes'),initialJSGzipBytes:sum(critical.filter(a=>a.type==='JS'),'gzipBytes'),logicalAssetCount:assets.length,logicalBytes:sum(assets,'bytes'),logicalGzipBytes:sum(assets,'gzipBytes'),menuStaticClosure:menuOnly,menuStaticBytes:sum(assets.filter(a=>menuOnly.includes(a.path)),'bytes'),missing,unresolvedDynamic:unresolved,measurementKind:'static byte count / syntax analysis; NOT transferred bytes or browser performance'};
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'asset-inventory.json'),JSON.stringify({summary,assets},null,2)+'\n');
fs.writeFileSync(path.join(out,'dependency-graph.json'),JSON.stringify({entry,preloads,graph,staticEntryClosure:closure([entry]),unresolved},null,2)+'\n');
const md=['# Asset inventory','',`Revision: \`${revision}\``, '', 'Sizes are UTF-8/file bytes and locally compressed sizes, not observed network transfers.','', '| Asset | Type | Bytes | gzip | Desired tier | Current preload | First use |','|---|---|---:|---:|---:|---|---|',...assets.map(a=>`| \`${a.path}\` | ${a.type} | ${a.bytes} | ${a.gzipBytes} | ${a.tier} | ${a.preloaded?'yes':'no'} | ${a.firstUse} |`)];
fs.writeFileSync(path.join(out,'asset-inventory.md'),md.join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
if(missing.some(e=>e.kind==='static')||summary.duplicatePreloads)process.exitCode=1;
