import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {expectedBallpointPngs,validateBallpointEvidence,inspectBallpointPng} from '../check-inkwave-ballpoint-evidence.mjs';
function fixture(){const sha='a'.repeat(40),artifacts={'registry.mjs':'b'.repeat(64)},revision='c'.repeat(64);const rows=[];for(const tier of ['game','far'])for(const background of ['#101321','#eef3f8'])for(const inkColor of ['#ff8825','#484ce8'])rows.push({tier,background,inkColor,glassVisible:true,rangeRestored:true,drawCalls:12,withoutGlassDrawCalls:10,glNonzeroDrawCalls:11,glZeroCountCalls:1,withoutGlassGlDraws:{nonzero:10,zero:0}});
 return {sourceSha:sha,expectedSourceSha:sha,artifactSourceSha:sha,build:{build:{revision},artifacts,contentHash:crypto.createHash('sha256').update(JSON.stringify(artifacts)).digest('hex')},pngNames:expectedBallpointPngs(),gallery:{revision,errors:[],compareClearcoat:false,rows:[{id:'s3-spinner-downpour',weaponModel:'s3-spinner-downpour',weaponKind:'splatling',own:true,nonFinite:false,maxGrip:.001,firingFrames:80,glass:{triangles:256,transparent:true,depthWrite:false,depthTest:true,castShadow:false,side:0,transmission:0,opacity:.22,gtao:{sharedGeometry:true,rangeRestored:true,safeChangedPixels:{Normal:0,Depth:0,AO:0,beauty:20},unguardedChangedPixels:{Normal:30,Depth:30}}},productionPipeline:{quality:'high',ao:true,bloom:true,failures:[],rows}}]}};
}
test('existing exact32 images and8 post-stack conditions bind to one checkout and build',()=>{assert.equal(validateBallpointEvidence(fixture()).status,'passed');assert.equal(new Set(expectedBallpointPngs()).size,32);});
for(const [name,change]of Object.entries({oldCheckout:d=>d.sourceSha='d'.repeat(40),oldArtifact:d=>d.artifactSourceSha='d'.repeat(40),oldGallery:d=>d.gallery.revision='d'.repeat(64),tamperedIdentity:d=>d.build.artifacts.extra='e',missingImage:d=>d.pngNames.pop(),duplicateImage:d=>d.pngNames[0]=d.pngNames[1],wrongModel:d=>d.gallery.rows[0].weaponModel='splatling',missingGlass:d=>delete d.gallery.rows[0].glass,unsafeAO:d=>d.gallery.rows[0].glass.gtao.safeChangedPixels.AO=1,missingNegative:d=>delete d.gallery.rows[0].glass.gtao.unguardedChangedPixels.Depth,weakNegative:d=>d.gallery.rows[0].glass.gtao.unguardedChangedPixels.Depth=0,duplicateCondition:d=>d.gallery.rows[0].productionPipeline.rows[0]=structuredClone(d.gallery.rows[0].productionPipeline.rows[1]),missingBoolean:d=>delete d.gallery.rows[0].productionPipeline.rows[0].glassVisible,truthyBoolean:d=>d.gallery.rows[0].productionPipeline.rows[0].rangeRestored='true',wrongDrawBudget:d=>d.gallery.rows[0].productionPipeline.rows[0].drawCalls=13,nonFiniteCount:d=>d.gallery.rows[0].productionPipeline.rows[0].glNonzeroDrawCalls=NaN,missingPost:d=>d.gallery.rows[0].productionPipeline.rows.pop()}))test(`reject ${name}`,()=>{const d=fixture();change(d);assert.throws(()=>validateBallpointEvidence(d));});
test('original PNG dimensions and bytes are pinned, malformed or resized headers fail',()=>{const b=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(500,16);b.writeUInt32BE(500,20);assert.equal(inspectBallpointPng(b,'test.png').width,500);const resized=Buffer.from(b);resized.writeUInt32BE(499,16);assert.throws(()=>inspectBallpointPng(resized,'test.png'));assert.throws(()=>inspectBallpointPng(Buffer.alloc(33),'bad.png'));});

test('current workflow uses one build and active exact-head evidence, retaining send acceptance checks', async () => {
 const fs=await import('node:fs');
 const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 const emitted=workflow.match(/      - name: Verify existing Ballpoint glass[^]*?(?=      - name:)/)?.[0];
 const native=workflow.match(/      - name: Verify existing Ballpoint gallery[^]*?(?=      - name:)/)?.[0];
 assert.ok(emitted);assert.ok(native);assert.match(emitted,/INKWAVE_BUILT_SITE: \$\{\{ github.workspace \}\}\/_site/);
 assert.match(emitted,/--test-name-pattern='Ballpoint' patches\/splatoon3\/tests\/weapon-shared-rendering.test.mjs/);
 assert.match(native,/if: matrix.suite == 'active'/);assert.doesNotMatch(emitted+native,/head_ref|checkout|build-inkwave|baseline|compare-clearcoat|--crowd/);
 assert.match(native,/test ! -e "\$out"/);assert.match(native,/--site \.built-site\/_site --out "\$out" --ids s3-spinner-downpour --size 500/);
 assert.match(native,/check-inkwave-ballpoint-evidence.mjs --site \.built-site\/_site --out "\$out" --source-sha "\$SOURCE_SHA"/);
 assert.match(workflow,/'active':\[[^\n]*'ballpoint\/ballpoint-result.json'/);
 assert.ok(workflow.includes("assert reports['ballpoint/ballpoint-result.json']['sourceSha']==os.environ['SOURCE_SHA']"));
 assert.match(workflow,/patches\/network-replication\/tests\/outbound-prefix.test.mjs/);assert.match(workflow,/patches\/splatoon3\/tests\/ranked-send-acceptance.test.mjs/);
 assert.match(workflow,/node --test[^\n]*scripts\/tests\/inkwave-ballpoint-evidence.test.mjs/);
});

test('CLI writes a source-bound receipt and image byte hashes, then rejects a different artifact owner', async () => {
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {execFileSync,spawnSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-ballpoint-contract-'));
 try {
  execFileSync('git',['init','--quiet',root]);
  execFileSync('git',['-C',root,'-c','user.name=QA fixture','-c','user.email=qa@example.invalid','commit','--allow-empty','--quiet','-m','Synthetic receipt contract']);
  const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const d=fixture();d.sourceSha=d.expectedSourceSha=d.artifactSourceSha=sha;
  const site=path.join(root,'.built-site','_site'),out=path.join(root,'evidence');fs.mkdirSync(site,{recursive:true});fs.mkdirSync(out);
  fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(d.build));
  fs.writeFileSync(path.join(root,'.built-site','_site-source-sha.txt'),sha+'\n');fs.writeFileSync(path.join(out,'gallery.json'),JSON.stringify(d.gallery));
  // Header-only synthetic files exercise the CLI's bounded hash/header contract, not native rendering or PNG decoding.
  const bytes=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(500,16);bytes.writeUInt32BE(500,20);
  for(const name of d.pngNames)fs.writeFileSync(path.join(out,name),bytes);
  const script=fileURLToPath(new URL('../check-inkwave-ballpoint-evidence.mjs',import.meta.url));
  const run=()=>spawnSync(process.execPath,[script,'--site',site,'--out',out,'--source-sha',sha],{cwd:root,encoding:'utf8'});
  const good=run();assert.equal(good.status,0,good.stderr);const receipt=JSON.parse(fs.readFileSync(path.join(out,'ballpoint-result.json')));
  assert.equal(receipt.sourceSha,sha);assert.equal(receipt.images.length,32);assert.ok(receipt.images.every(image=>image.bytes===33&&image.sha256===crypto.createHash('sha256').update(bytes).digest('hex')));
  fs.writeFileSync(path.join(root,'.built-site','_site-source-sha.txt'),'d'.repeat(40));
  const bad=run();assert.notEqual(bad.status,0);assert.match(bad.stderr,/built artifact head/);
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
