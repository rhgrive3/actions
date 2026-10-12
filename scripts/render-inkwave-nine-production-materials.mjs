#!/usr/bin/env node
// Diagnostic-only harness. The app build and the two source galleries remain immutable.
// All original camera, geometry, native material, Actor and lifecycle code is reused.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const source=path.resolve(arg('--source','.')), site=path.resolve(arg('--site','_site')), out=path.resolve(arg('--out','.material-evidence'));
const generateOnly=process.argv.includes('--generate-only');
fs.mkdirSync(out,{recursive:true});
const exactHead='7630c58a3a8dedf4e3bf79c48c2dd7583b457db2';
const specifications=[
  {family:'six',file:'render-inkwave-circled-weapon-gallery.mjs',sha256:'e47ba663d946efdf14f987a3799ef950a240a2d1ccf354cdee18a8ce578c57ea',ids:'s3-saber-normal,s3-saber-lite,s3-saber-heavy,s3-stringer-normal,s3-stringer-short,s3-stringer-explosion'},
  {family:'brella',file:'render-inkwave-brella-gallery.mjs',sha256:'f43d81e33f5dddee6b267f117da304014c62660dacaffae0bb8214b2f2c63bab',ids:'s3-shelter-normal,s3-shelter-wide,s3-shelter-focus'},
];
const modes=['studio32','studio1024','productionDay-orange','productionDay-purple'];
const replaceOnce=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Expected one exact source match: '+a.slice(0,90));return s.replace(a,b);};
const illumination=String.raw`
    const scene = new THREE.Scene();
    let lighting;
    if (mode.startsWith('productionDay')) {
      // Real production Environment generates the day IBL, sun and hemisphere.
      // Neutral/exposure1 match src/core/renderer.js. The compositor, world,
      // screen effects and shadow receivers are intentionally not simulated.
      renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;
      const {Environment}=await import(prefix+'src/world/environment.js');
      const environmentScene=new THREE.Scene(),environment=new Environment(renderer,environmentScene,{theme:'day'});
      if(environment.theme!=='day'||!environment.envMap)throw Error('Production day environment did not initialize');
      scene.add(environment.sun,environment.hemi);scene.environment=environment.envMap;
      scene.environmentIntensity=environmentScene.environmentIntensity;
      lighting={mode,theme:environment.theme,source:'native Environment constructor',pmremWidth:environment.envMap.image.width,pmremHeight:environment.envMap.image.height,environmentIntensity:scene.environmentIntensity,sun:{intensity:environment.sun.intensity,color:environment.sun.color.toArray(),position:environment.sun.position.toArray()},hemisphere:{intensity:environment.hemi.intensity,sky:environment.hemi.color.toArray(),ground:environment.hemi.groundColor.toArray()},toneMapping:'NeutralToneMapping',exposure:renderer.toneMappingExposure,postprocessing:false,shadows:false};
      window.__nativeEnvironment=environment;G.env=environment;
    } else {
      const width=mode==='studio32'?32:1024,height=width/2,px=new Uint8Array(width*height*4);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=y/height<9/16?235:130;px.set([v,v,Math.min(255,v+12),255],(y*width+x)*4);}
      const sky=new THREE.DataTexture(px,width,height);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;
      const pmrem=new THREE.PMREMGenerator(renderer),rt=pmrem.fromEquirectangular(sky);scene.environment=rt.texture;
      scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,2.1));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,2);scene.add(key);
      lighting={mode,inputWidth:width,inputHeight:height,cubeSize:width/4,maxMip:Math.log2(width/4),pmremWidth:rt.width,pmremHeight:rt.height,environmentIntensity:scene.environmentIntensity,toneMapping:'ACESFilmicToneMapping',exposure:renderer.toneMappingExposure,postprocessing:false,shadows:false};
    }
    lighting.validCubeUV=lighting.pmremHeight>=64;
    if(mode!=='studio32'&&!lighting.validCubeUV)throw Error('Invalid production/control PMREM dimensions');
    lighting.teamColor=mode.endsWith('purple')?'#484ce8':'#ff8825';
    lighting.renderer={outputColorSpace:renderer.outputColorSpace,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,width:renderer.domElement.width,height:renderer.domElement.height};
    lighting.cameras=[];
    const nativeRender=renderer.render.bind(renderer),cameraKeys=new Set();
    renderer.render=(renderScene,camera)=>{const c={type:camera.type,position:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),projection:camera.projectionMatrix.toArray()};const k=JSON.stringify(c);if(!cameraKeys.has(k)){cameraKeys.add(k);lighting.cameras.push(c);}return nativeRender(renderScene,camera);};
    window.__lighting=lighting;
    // Environment scenery consumes RNG; restore the same Actor seed in every mode.
    seed=0x51a7c0de;
`;
const inventory=[];
for(const spec of specifications){
  const original=fs.readFileSync(path.join(source,'scripts',spec.file),'utf8');
  if(crypto.createHash('sha256').update(original).digest('hex')!==spec.sha256)throw Error('Gallery SHA mismatch: '+spec.file);
  let derived=replaceOnce(original,"const size = Number(arg('--size', 400))", "const mode=arg('--environment','productionDay-orange');\nconst size = Number(arg('--size', 400))");
  derived=replaceOnce(derived,'await page.evaluate(async ({ prefix, size }) => {','await page.evaluate(async ({ prefix, size, mode }) => {\n    let seed=0x51a7c0de;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};');
  const start=derived.indexOf('    const scene = new THREE.Scene();'), end=derived.indexOf('    G.scene = scene;',start);
  if(start<0||end<start)throw Error('Lighting block not found');
  derived=derived.slice(0,start)+illumination+derived.slice(end);
  derived=replaceOnce(derived,"new THREE.Color('#ff8825'), new THREE.Color('#484ce8')","new THREE.Color(lighting.teamColor), new THREE.Color(lighting.teamColor==='#ff8825'?'#484ce8':'#ff8825')");
  derived=replaceOnce(derived,'}, { prefix, size });','}, { prefix, size, mode });');
  // Assert the real source-motion loader instead of silently accepting a fallback.
  derived=replaceOnce(derived,'if (ch.sourceMotion?.ready) await ch.sourceMotion.ready;','if (ch.sourceMotion?.ready) await ch.sourceMotion.ready;\n      if(ch.sourceMotion?.status!==\'ready\')throw Error(\'Actual Actor source motion unavailable: \'+id);');
  derived=replaceOnce(derived,'JSON.stringify({ revision: identity.build.revision, rows, errors }, null, 2)',"JSON.stringify({ revision: identity.build.revision, build:identity.build, exactHead:'"+exactHead+"', sourceGallerySha256:'"+spec.sha256+"', lighting:await page.evaluate(()=>window.__lighting), rows, errors }, null, 2)");
  const filename=path.join(out,spec.family+'-gallery.mjs');fs.writeFileSync(filename,derived);
  const syntax=spawnSync(process.execPath,['--check',filename],{stdio:'inherit'});if(syntax.status!==0)throw Error('Derived gallery syntax');
  if(generateOnly)continue;
  for(const mode of modes){
    const dest=path.join(out,mode,spec.family);
    const run=spawnSync(process.execPath,[filename,'--site',site,'--out',dest,'--ids',spec.ids,'--size','440','--environment',mode],{stdio:'inherit'});
    if(run.status!==0)throw Error('Material diagnostic failed: '+mode+'/'+spec.family);
    const result=JSON.parse(fs.readFileSync(path.join(dest,'gallery.json')));
    if(result.errors.length||result.rows.length!==spec.ids.split(',').length)throw Error('Incomplete diagnostic coverage');
    for(const row of result.rows){if(row.nonFinite||row.maxGrip>(spec.family==='brella'?.008:.005))throw Error('Actor contract '+row.id);}
    inventory.push({mode,family:spec.family,revision:result.revision,lighting:result.lighting,ids:result.rows.map(r=>r.id)});
  }
}
if(!generateOnly){
  const expected=specifications.flatMap(x=>x.ids.split(',')).sort();
  for(const mode of modes){const actual=inventory.filter(x=>x.mode===mode).flatMap(x=>x.ids).sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Missing all-nine coverage '+mode);}
  if(new Set(inventory.map(x=>x.revision)).size!==1)throw Error('Mixed built revisions');
  fs.writeFileSync(path.join(out,'diagnostic-manifest.json'),JSON.stringify({exactHead,specifications,modes,inventory,scope:'Native materials, immutable weapon geometry and actual Actor sequence. studio32 invalid-CubeUV negative control; studio1024 valid resolution-only control; productionDay native Environment day IBL and sun/hemi with production Neutral tone mapping, pre-compositor, without world shadows. Timings from this diagnostic are not performance evidence.'},null,2));
}
