import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {hash} from './glb.mjs';
import {compactModuleStrings} from '../../scripts/lib/inkwave-source-compaction.mjs';
export function threeImports(source, namespace=true) {
  const names=new Set();
  for(const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]three['"]/g))for(const n of m[1].split(',')){const name=n.trim().split(/\s+as\s+/)[0];if(name)names.add(name);}
  if(namespace)for(const m of source.matchAll(/THREE\.([A-Za-z_$][\w$]*)/g))names.add(m[1]);
  return [...names].sort();
}
export function addonGraph(root, entry) {
  const files=new Set(),names=new Set();
  function visit(file){const real=fs.realpathSync(file);assert(real.startsWith(root+path.sep),'addon stays within official package');if(files.has(real))return;files.add(real);const src=fs.readFileSync(real,'utf8');assert(!/import\s*\*\s*as\s+\w+\s+from\s*['"]three['"]/.test(src),'namespace addon import needs explicit planner support');for(const n of threeImports(src,false))names.add(n);for(const m of src.matchAll(/(?:^|\n)\s*import\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g)){if(m[1]==='three')continue;assert(m[1].startsWith('.'),'unexpected addon dependency '+m[1]);visit(path.resolve(path.dirname(real),m[1]));}}
  visit(path.join(root,entry));return {files:[...files].map(f=>path.relative(root,f)).sort(),names:[...names].sort()};
}
// Production writes compactEsm(esbuild output), not the raw esbuild bundle.
// Exact SHA parity requires replaying its final audited string-compaction pass.
export function productionCoreBytes(esbuildOutput) {
  return Buffer.from(compactModuleStrings(Buffer.from(esbuildOutput).toString('utf8')).code,'utf8');
}
export async function expandedCore({builtFile,sourceRoot,addonRoot,browserSource,esbuild}) {
  const actual=fs.readFileSync(builtFile),runtime=await import(pathToFileURL(builtFile).href),full=await import(pathToFileURL(path.join(sourceRoot,'three.module.js')).href);
  assert.equal(full.REVISION,'186','vendored source revision');
  const baseNames=Object.keys(runtime).sort(),graph=addonGraph(addonRoot,'loaders/GLTFLoader.js'),fixtureNames=threeImports(browserSource);
  const required=[...new Set([...baseNames,...graph.names,...fixtureNames])].sort();for(const name of required)assert(name in full,'required r186 export '+name);
  async function bundle(names){return productionCoreBytes((await esbuild.build({stdin:{contents:`export { ${names.join(', ')} } from './three.module.js';`,resolveDir:sourceRoot,sourcefile:'three-slim.js'},bundle:true,format:'esm',minify:true,charset:'utf8',legalComments:'inline',write:false,logLevel:'warning'})).outputFiles[0].contents);}
  const reconstructed=await bundle(baseNames);assert.equal(hash(reconstructed),hash(actual),'reconstructed production core must match existing bytes');
  const candidate=await bundle(required),minimalLoader=await bundle([...new Set([...baseNames,...graph.names])].sort());
  const size=b=>({rawBytes:b.byteLength,gzipBytes:gzipSync(b).byteLength,sha256:hash(b)}),base=size(actual),expanded=size(candidate),loaderOnly=size(minimalLoader);
  return {bytes:candidate,report:{mode:'QA-only single expanded core; production core remains unchanged',revision:full.REVISION,baseExportCount:baseNames.length,sourceExportCount:Object.keys(full).length,requiredExportCount:required.length,loaderRequiredNames:graph.names,loaderMissingNames:graph.names.filter(n=>!baseNames.includes(n)),fixtureOnlyMissingNames:fixtureNames.filter(n=>!baseNames.includes(n)&&!graph.names.includes(n)),addonFiles:graph.files,base,loaderOnly,expanded,loaderOnlyDelta:{rawBytes:loaderOnly.rawBytes-base.rawBytes,gzipBytes:loaderOnly.gzipBytes-base.gzipBytes},fixtureDelta:{rawBytes:expanded.rawBytes-base.rawBytes,gzipBytes:expanded.gzipBytes-base.gzipBytes},productionCoreReconstructionMatched:true,threeModuleCopiesInstantiated:1}};
}
