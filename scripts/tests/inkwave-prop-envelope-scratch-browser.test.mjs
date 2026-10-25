import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));

test('old and scratch prop envelopes retain actual Chromium instance pixels and draw counts',
  {skip:!process.env.INKWAVE_CHROMIUM_PATH},async t=>{
    const {chromium}=await import(process.env.INKWAVE_PLAYWRIGHT_MODULE||'playwright');
    const server=http.createServer(async(req,res)=>{
      try{
        const url=new URL(req.url,'http://localhost');
        res.setHeader('content-type','text/javascript');
        if(url.pathname==='/'){
          res.setHeader('content-type','text/html');
          res.end('<script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js","three/addons/":"/inkwave-public/vendor/three/jsm/"}}</script>');return;
        }
        const pathname=decodeURIComponent(url.pathname).replace(/^\/inkwave-public\/patches\//,'/patches/');
        const file=path.resolve(root,'.'+pathname);
        if(!file.startsWith(root))throw Error('outside root');
        res.end(await fs.readFile(file));
      }catch{res.statusCode=404;res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const browser=await chromium.launch({executablePath:process.env.INKWAVE_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    t.after(()=>browser.close());
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port);
    const receipt=await page.evaluate(async()=>{
      const THREE=await import('three');
      const {PropKit}=await import('/inkwave-public/src/world/props.js');
      const {setPropInstanceEnvelope:before}=await import('/patches/local-quality/tests/fixtures/prop-envelope-before-scratch.js.txt');
      const {setPropInstanceEnvelope:after}=await import('/inkwave-public/src/world/render-bounds.js');
      const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(128,96);
      const target=new THREE.WebGLRenderTarget(128,96);renderer.setRenderTarget(target);
      const camera=new THREE.PerspectiveCamera(65,128/96,.1,1000);
      const owner=new THREE.Scene(),kit=new PropKit(owner),scenes=[new THREE.Scene(),new THREE.Scene()];
      for(const scene of scenes)scene.add(new THREE.HemisphereLight(0xffffff,0x778899,2));
      for(const [type,opts] of [['acunit',{}],['acunit',{variant:1}],['vent',{variant:1}],['banner',{}],['bunting',{}],['speaker',{}],['buoy',{}]])
        kit.add(type,{pos:[3,2,-5],rotY:.7,scale:1.3,...opts});
      kit.build();
      const clones=[[],[]];
      for(const mesh of kit._inst)for(let side=0;side<2;side++){
        const copy=mesh.clone();copy.frustumCulled=false;copy.boundingSphere=null;
        (side===0?before:after)(copy);scenes[side].add(copy);clones[side].push(copy);
      }
      const pixels=[new Uint8Array(128*96*4),new Uint8Array(128*96*4)],frames=[];
      for(const time of [0,.2,1,10]){
        kit.update(1/60,time);
        for(let side=0;side<2;side++)for(let i=0;i<kit._inst.length;i++){
          clones[side][i].instanceMatrix.array.set(kit._inst[i].instanceMatrix.array);clones[side][i].instanceMatrix.needsUpdate=true;
          if(kit._inst[i].instanceColor){clones[side][i].instanceColor.array.set(kit._inst[i].instanceColor.array);clones[side][i].instanceColor.needsUpdate=true;}
        }
        for(let view=0;view<10;view++){
          const a=view*Math.PI/4;camera.position.set(3+Math.cos(a)*12,6,-5+Math.sin(a)*12);camera.lookAt(view<8?3:50,2,-5);
          const draws=[];
          for(let side=0;side<2;side++){
            renderer.render(scenes[side],camera);draws.push({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
            renderer.readRenderTargetPixels(target,0,0,128,96,pixels[side]);
          }
          let differences=0;for(let i=0;i<pixels[0].length;i++)if(pixels[0][i]!==pixels[1][i])differences++;
          frames.push({time,view,differences,draws});
        }
      }
      const receipt={browser:navigator.userAgent,meshes:kit._inst.map(m=>m.name),frames};
      kit.dispose();renderer.dispose();target.dispose();return receipt;
    });
    assert.ok(receipt.meshes.length>=5);assert.equal(receipt.frames.length,40);
    assert.ok(receipt.frames.some(f=>f.draws[0].triangles>0),'compare visible rendered geometry');
    const maxCalls=Math.max(...receipt.frames.map(f=>f.draws[0].calls));
    assert.ok(receipt.frames.some(f=>f.draws[0].calls<maxCalls),'compare frustum-culled views');
    for(const frame of receipt.frames){assert.equal(frame.differences,0,JSON.stringify(frame));assert.deepEqual(frame.draws[1],frame.draws[0]);}
    t.diagnostic(JSON.stringify(receipt));
  });
