import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {BUILD_ONLY_PATCH_MODULES} from './lib/inkwave-build-only-modules.mjs';

// Reviewed source-relative imports already use the published src/patches layout.
// These immutable source/target pins do not authorize arbitrary missing imports.
export const SOURCE_SITE_REFERENCES = Object.freeze([
  {
    "source": "inkwave-public/src/game/nav.js",
    "ref": "../../patches/native-stages/runtime/engine.mjs",
    "target": "patches/native-stages/runtime/engine.mjs",
    "inputKey": "native-stages/runtime/engine.mjs",
    "sourceInputKey": "upstream/src/game/nav.js",
    "sourceSha256": "419738ae4f8e23096b0ead55c9d353dc1e36867965d4515170dbe6046be3db4a",
    "targetSha256": "d47f7f9baf3e6598c9d53ecd503d1c0c3c341e3b04b900d7029bb628e83cc353"
  },
  {
    "source": "inkwave-public/src/world/maps.js",
    "ref": "../../patches/practice-range/stage/layout.mjs",
    "target": "patches/practice-range/stage/layout.mjs",
    "inputKey": "practice-range/stage/layout.mjs",
    "sourceInputKey": "upstream/src/world/maps.js",
    "sourceSha256": "cbe20f7a354d2860429d12701af7730f96377589e0d9dbef9dda7c60b1e196f4",
    "targetSha256": "8903cb70167972cac2388dbb5f92f7b70ed2abb032a6971df8b7c84c84014acb"
  },
  {
    "source": "inkwave-public/src/world/maps.js",
    "ref": "../../patches/native-stages/runtime/registry.mjs",
    "target": "patches/native-stages/runtime/registry.mjs",
    "inputKey": "native-stages/runtime/registry.mjs",
    "sourceInputKey": "upstream/src/world/maps.js",
    "sourceSha256": "cbe20f7a354d2860429d12701af7730f96377589e0d9dbef9dda7c60b1e196f4",
    "targetSha256": "bec89cade19764800de9bf5abd781c488c3e204e42f9033f58515646b051039b"
  },
  {
    "source": "inkwave-public/src/world/maps.js",
    "ref": "../../patches/splatoon3/stage/scorch-layout.mjs",
    "target": "patches/splatoon3/stage/scorch-layout.mjs",
    "inputKey": "patch/stage/scorch-layout.mjs",
    "sourceInputKey": "upstream/src/world/maps.js",
    "sourceSha256": "cbe20f7a354d2860429d12701af7730f96377589e0d9dbef9dda7c60b1e196f4",
    "targetSha256": "898f0f021e4c2c38dd060598f1d27f3cafc45430788b6f0db560d6f502a1d9c0"
  },
  {
    "source": "inkwave-public/src/world/stages/surfaces.js",
    "ref": "../../../patches/practice-range/stage/surfaces.mjs",
    "target": "patches/practice-range/stage/surfaces.mjs",
    "inputKey": "practice-range/stage/surfaces.mjs",
    "sourceInputKey": "upstream/src/world/stages/surfaces.js",
    "sourceSha256": "e62996527e177450d2060ff00518ee602b7006d918bc68485f7679b4cb2f38fd",
    "targetSha256": "4754a45da6fe0cfe8eaeb3c3f1c9b7df848e2e1a89dea89e9f09ac2e12a557a5"
  },
  {
    "source": "inkwave-public/src/world/stages/index.js",
    "ref": "../../../patches/practice-range/stage/props.mjs",
    "target": "patches/practice-range/stage/props.mjs",
    "inputKey": "practice-range/stage/props.mjs",
    "sourceInputKey": "upstream/src/world/stages/index.js",
    "sourceSha256": "5f6d1fcd0d6b2ffd0a7027e27d75f7188b91c426999ad37674e3e2669ccacd28",
    "targetSha256": "ba662b0c794d94b03c07fbbdcfaf4c0fcb5bc178624a8c1064f6e1c1877071e4"
  },
  {
    "source": "inkwave-public/src/world/stages/index.js",
    "ref": "../../../patches/practice-range/stage/surfaces.mjs",
    "target": "patches/practice-range/stage/surfaces.mjs",
    "inputKey": "practice-range/stage/surfaces.mjs",
    "sourceInputKey": "upstream/src/world/stages/index.js",
    "sourceSha256": "5f6d1fcd0d6b2ffd0a7027e27d75f7188b91c426999ad37674e3e2669ccacd28",
    "targetSha256": "4754a45da6fe0cfe8eaeb3c3f1c9b7df848e2e1a89dea89e9f09ac2e12a557a5"
  },
  {
    "source": "inkwave-public/src/world/stages/index.js",
    "ref": "../../../patches/practice-range/stage/layout.mjs",
    "target": "patches/practice-range/stage/layout.mjs",
    "inputKey": "practice-range/stage/layout.mjs",
    "sourceInputKey": "upstream/src/world/stages/index.js",
    "sourceSha256": "5f6d1fcd0d6b2ffd0a7027e27d75f7188b91c426999ad37674e3e2669ccacd28",
    "targetSha256": "8903cb70167972cac2388dbb5f92f7b70ed2abb032a6971df8b7c84c84014acb"
  },
  {
    "source": "inkwave-public/src/world/stages/index.js",
    "ref": "../../../patches/practice-range/stage/murals.mjs",
    "target": "patches/practice-range/stage/murals.mjs",
    "inputKey": "practice-range/stage/murals.mjs",
    "sourceInputKey": "upstream/src/world/stages/index.js",
    "sourceSha256": "5f6d1fcd0d6b2ffd0a7027e27d75f7188b91c426999ad37674e3e2669ccacd28",
    "targetSha256": "5541174932dcdc23b272f1afac24b3e761f67ee4c73113415bfa65d079bd38b2"
  }
]);
const digest = b => createHash('sha256').update(b).digest('hex');
function contained(root, candidate) {
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(candidate));
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw Error('Reference escapes repository: ' + candidate);
  return candidate;
}
export function verifyMappedReference(repo, source, ref, site = null) {
  const row = SOURCE_SITE_REFERENCES.find(r => r.source === source && r.ref === ref);
  if (!row) throw Error('Unknown source/site reference: ' + source + ' -> ' + ref);
  const virtual = path.posix.normalize(path.posix.join(path.posix.dirname(source.slice('inkwave-public/'.length)), ref));
  if (virtual !== row.target || !virtual.startsWith('patches/') || BUILD_ONLY_PATCH_MODULES.has(virtual)) throw Error('Invalid runtime mapping: ' + virtual);
  for (const [p, sha] of [[source,row.sourceSha256],[virtual,row.targetSha256]]) {
    const file=contained(repo,path.join(repo,p));
    const realRel=path.relative(fs.realpathSync(repo),fs.realpathSync(file)).split(path.sep).join('/');
    if (BUILD_ONLY_PATCH_MODULES.has(realRel)) throw Error('Runtime imports build-only source transformer: '+realRel);
    if (!fs.statSync(file).isFile() || digest(fs.readFileSync(file)) !== sha) throw Error('Pinned reference source mismatch: ' + p);
  }
  if (site) {
    const m=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
    const revision=m.build?.revision;
    if (!/^[a-f0-9]{64}$/.test(revision||'')) throw Error('Invalid emitted revision');
    if (m.files?.[row.sourceInputKey] !== row.sourceSha256 || m.files?.[row.inputKey] !== row.targetSha256) throw Error('Reference input manifest mismatch: ' + virtual);
    for (const rel of [virtual,'_versions/'+revision+'/'+virtual]) {
      const file=contained(site,path.join(site,rel));
      if (!/^[a-f0-9]{64}$/.test(m.artifacts?.[rel]||'') || digest(fs.readFileSync(file)) !== m.artifacts[rel]) throw Error('Reference emitted artifact mismatch: ' + rel);
    }
  }
  return {...row, emittedVerified:Boolean(site)};
}
export function checkLocalReferences(repo, {site=null}={}) {
  const root=path.join(repo,'inkwave-public'), missing=[], mapped=[];let inspected=0;
  function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
  for (const p of walk(root)) {
    const ext=path.extname(p);if (!['.js','.mjs','.html','.css'].includes(ext)||!fs.statSync(p).isFile()) continue;
    const s=fs.readFileSync(p,'utf8'),refs=new Set();inspected++;
    if (['.js','.mjs'].includes(ext)) {
      for (const match of s.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) refs.add(match[1]);
      for (const match of s.matchAll(/import\s*["']([^"']+)["']/g)) refs.add(match[1]);
    } else {
      for(const match of s.matchAll(/(?:src|href)=["']([^"']+)["']/g))refs.add(match[1]);
      for(const match of s.matchAll(/@import\s+(?:url\()?["']?([^"'\)\s]+)/g))refs.add(match[1]);
    }
    for (const ref of refs) {
      if (/^(?:https?:|data:|blob:|#)/.test(ref)||ref==='three'||ref.startsWith('three/addons/'))continue;
      if (!/^(?:\.\.?\/|\/)/.test(ref)&&['.js','.mjs'].includes(ext))continue;
      const q=(ref.startsWith('/')?path.join(root,ref.slice(1)):path.resolve(path.dirname(p),ref)).split(/[?#]/)[0];
      try {
        const source=path.relative(repo,p).split(path.sep).join('/');
        if(SOURCE_SITE_REFERENCES.some(row=>row.source===source&&row.ref===ref)) {
          const receipt=verifyMappedReference(repo,source,ref,site);
          if(fs.existsSync(q))throw Error('Unexpected source/site shadow: '+q);
          mapped.push(receipt);
        } else if (fs.existsSync(q)) {
          contained(repo,q);
          if(!fs.statSync(q).isFile())throw Error('Reference is not a file: '+q);
          const rel=path.relative(fs.realpathSync(repo),fs.realpathSync(q)).split(path.sep).join('/');
          if(BUILD_ONLY_PATCH_MODULES.has(rel))throw Error('Runtime imports build-only source transformer: '+rel);
        } else mapped.push(verifyMappedReference(repo,path.relative(repo,p).split(path.sep).join('/'),ref,site));
      } catch(e) {missing.push({source:path.relative(repo,p),ref,error:e.message});}
    }
  }
  if(missing.length)throw Error(missing.map(r=>'MISSING '+r.source+' '+r.ref+' '+r.error).join('\n'));
  return {status:'passed',inspected,mapped,emittedVerified:Boolean(site)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const repo=path.resolve(process.argv[2]||'.');const i=process.argv.indexOf('--site');
  console.log(JSON.stringify(checkLocalReferences(repo,{site:i<0?null:path.resolve(process.argv[i+1])}),null,2));
}
