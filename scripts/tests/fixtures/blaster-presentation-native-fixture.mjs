// Test-only source-backed fixture. Never imported by runtime/capture helpers.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
export async function loadNativeBlasterFixture(sourceRoot){
 const read=relative=>fs.readFileSync(path.join(sourceRoot,relative),'utf8');
 const {adaptBuildSource}=await import(pathToFileURL(path.join(sourceRoot,'scripts/inkwave-source-composition.mjs')));
 const {BLASTER_DIAGONAL_PROPOSAL:proposal}=await import(pathToFileURL(path.join(sourceRoot,'patches/local-quality/blaster-diagonal-proposal.mjs')));
 // Production loads native HUD styles first, then S3 UI overrides. #709 moves
 // the response from the SVG root to ONLY its non-thin native outer circle.
 const cssInputs=['inkwave-public/styles/hud.css','patches/splatoon3/ui.css'];
 const css=cssInputs.map(file=>adaptBuildSource(file.replace(/^inkwave-public\//,''),read(file))).join('\n');
 const hud=adaptBuildSource('src/ui/hud.js',read('inkwave-public/src/ui/hud.js'));
 const nativeMarkup=hud.match(/else if \(kind === 'blaster'\) \{\s*r\.innerHTML = `([^`]+)`;/)?.[1];
 assert(nativeMarkup,'Actual native Blaster HUD branch required');
 const outerRadius=Number(nativeMarkup.match(/<circle r="(\d+)" class="iw-ret__ring"/)?.[1]);
 const nativeInnerRadius=Number(nativeMarkup.match(/<circle r="(\d+)" class="iw-ret__ring thin"/)?.[1]);
 assert.equal(outerRadius,23);assert.equal(nativeInnerRadius,9);
 const installer=read('patches/local-quality/blaster-diagonal-installer-prototype.mjs');
 assert.match(installer,/outer\.style\.setProperty\('display', 'none'\)/);
 assert.match(installer,/inner\.setAttribute\('r', geometry\.innerRadius\)/);
 const candidateMarkup=nativeMarkup.replace('<circle r="23"','<circle style="display:none" r="23"')
  .replace('<circle r="9" class="iw-ret__ring thin"',`<circle r="${proposal.innerRadius}" class="iw-ret__ring thin"`)+proposal.svg;
 const coefficient=Number(proposal.response.match(/\* ([.\d]+)/)?.[1]);
 const overlayWidth=Number(proposal.svg.match(/ width="(\d+)"/)?.[1]);
 assert.equal(coefficient,.012);assert.equal(overlayWidth,80);
 return {css,cssInputs,nativeMarkup,candidateMarkup,outerRadius,nativeInnerRadius,candidateInnerRadius:Number(proposal.innerRadius),coefficient,overlayWidth,
  spec(candidate,spread){return {candidate,markup:candidate?candidateMarkup:nativeMarkup,
   animationOwner:candidate?'.iw-reticle-blaster-diagonal-proposal':'.iw-ret__svg circle.iw-ret__ring:not(.thin)',
   nativeSvg:'.iw-ret__svg',nativeOuter:'.iw-ret__svg circle.iw-ret__ring:not(.thin)',nativeInner:'.iw-ret__svg circle.iw-ret__ring.thin',
   expectedDiameter:(candidate?overlayWidth:2*outerRadius)*(1+spread*coefficient),
   expectedSvgWidth:80,expectedSvgTransform:'none',expectedInnerRadius:candidate?Number(proposal.innerRadius):nativeInnerRadius};}};
}
