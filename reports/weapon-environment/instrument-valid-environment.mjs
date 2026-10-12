import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const [,,source,out]=process.argv;let text=fs.readFileSync(source,'utf8');
const sha=crypto.createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');assert.equal(sha,'ebecfa78172f47b6aead1ded88ac50232f894198','pinned18 gallery');
const once=(a,b)=>{assert.equal(text.split(a).length,2,a.slice(0,70));text=text.replace(a,b);};
once("const size = Number(arg('--size', 400)), crowd = process.argv.includes('--crowd');", "const size = Number(arg('--size', 600)), crowd = false; // image/contract diagnosis only, no crowd timing");
once('const px = new Uint8Array(32 * 16 * 4); for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) { const v = y < 9 ? 235 : 130; px.set([v, v, Math.min(255, v + 12), 255], (y * 32 + x) * 4); }',
'const px = new Uint8Array(1024 * 512 * 4); for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) { const v = y / 512 < 9 / 16 ? 235 : 130; px.set([v, v, Math.min(255, v + 12), 255], (y * 1024 + x) * 4); }');
once('const sky = new THREE.DataTexture(px, 32, 16);','const sky = new THREE.DataTexture(px, 1024, 512);');
const start=text.indexOf('      // Fixed-pose render submission including'),end=text.indexOf('      if(crowd){',start);assert(start>0&&end>start);
text=text.slice(0,start)+"      // No short gl.finish timing: this run produces visual and channel evidence only.\n"+text.slice(end);
once("        const gameRenderer=new Renderer(container,{quality:'high',shadows:true,bloom:true});",`        const gameRenderer=new Renderer(container,{quality:'high',shadows:true,bloom:true});
        // Build native PMREM inside the very GL context that samples it. Never
        // reuse studio render-target textures across WebGL contexts.
        const { Environment } = await import(prefix+'src/world/environment.js');
        const savedEnvironment=scene.environment,savedIntensity=scene.environmentIntensity,savedGEnv=G.env,savedGRenderer=G.renderer;
        const savedLights=scene.children.filter(o=>o.isLight);for(const light of savedLights)scene.remove(light);
        const nativeScene=new THREE.Scene();
        G.renderer=gameRenderer.renderer;
        const nativeEnvironment=new Environment(gameRenderer.renderer,nativeScene,{theme:'day'});
        scene.environment=nativeEnvironment.envMap;scene.environmentIntensity=nativeScene.environmentIntensity;
        scene.add(nativeEnvironment.sun,nativeEnvironment.hemi);G.env=nativeEnvironment;
        gameRenderer.renderer.toneMapping=THREE.NeutralToneMapping;gameRenderer.renderer.toneMappingExposure=.94;
        if(scene.environment!==nativeEnvironment.envMap||scene.environment.image.width<256||scene.environment.image.height<256)throw Error('Invalid native same-context environment');
        res.environmentFixture={studio:{equirect:[1024,512],pmremCubeSize:256,ownContext:true},production:{theme:'day',pmremImage:[scene.environment.image.width,scene.environment.image.height],ownContext:true,intensity:scene.environmentIntensity,toneMapping:gameRenderer.renderer.toneMapping,exposure:gameRenderer.renderer.toneMappingExposure},scope:'isolated real Actor, native Environment lights/reflections/grade and high post stack; no arena geometry or gameplay FPS claim'};`);
once("        draws.restore();gameRenderer._disposeComposer();gameRenderer.renderer.dispose();container.remove();",`        draws.restore();scene.remove(nativeEnvironment.sun,nativeEnvironment.hemi);scene.add(...savedLights);
        scene.environment=savedEnvironment;scene.environmentIntensity=savedIntensity;G.env=savedGEnv;G.renderer=savedGRenderer;
        nativeEnvironment.dispose();gameRenderer._disposeComposer();gameRenderer.renderer.dispose();container.remove();`);
fs.writeFileSync(out,text);console.log(JSON.stringify({source,out,originalGitSHA:sha,outputSHA256:crypto.createHash('sha256').update(text).digest('hex'),scope:'valid same-context environment visual evidence only'}));
