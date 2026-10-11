"""Real Chromium/WebGL audit of the emitted game. No alternate gameplay renderer.
This environment blocks document URL navigation, so local HTML is loaded through set_content
with a local CORS-only asset server. Storage is an in-memory browser fixture. The emitted INKWAVE
meshes, source modules, renderer, actors, paint and physics are used directly.
Requires Playwright, Chromium, and an X display for this system's Vulkan/SwiftShader build.
"""
import asyncio,json,time,re,os,sys,shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '/mnt/data/inkwave-stage-site')
OUT=Path(os.environ.get('STAGE25_AUDIT_OUT','reports/stage25/browser'));OUT.mkdir(parents=True,exist_ok=True)
ASSET_ORIGIN=os.environ.get('STAGE25_ASSET_ORIGIN','http://localhost:8766').rstrip('/')
CHROMIUM=os.environ.get('STAGE25_CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser')
IDS=['scorch','eeltail','hagglefish','undertow','mincemeat','hammerhead','museum','mahi','inkblot','sturgeon','mako','wahoo','brinewater','flounder','umami','manta','barnacle','humpback','crableg','shipshape','robo','bluefin','marlin','lemuria','urchin']
if os.environ.get('STAGE25_IDS'): IDS=os.environ['STAGE25_IDS'].split(',')
async def main():
 report={'auditRevision':4,'fixture':'bot attack inputs disabled for isolated traversal; real game simulation ticks via shipped fixed-clock driver, one visual update after batch; no render-cadence/FPS claim; local asset server; set_content document; in-memory storage; SwiftShader; not a mobile performance claim','stages':[],'logs':[]}
 def save(): (OUT/'browser-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=CHROMIUM,headless=True,args=['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':1000,'height':680},device_scale_factor=1)
  page.on('pageerror',lambda e:report['logs'].append({'type':'pageerror','text':str(e)}))
  page.on('console',lambda m:report['logs'].append({'type':m.type,'text':m.text}) if m.type=='error' else None)
  await page.evaluate('''()=>{const x=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>x.get(k)??null,setItem:(k,v)=>x.set(k,String(v)),removeItem:k=>x.delete(k)}});Object.defineProperty(window,'sessionStorage',{value:window.localStorage});localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',music:0,volume:0,minimap:false,gyro:false,matchLength:180}));}''')
  html=ROOT.joinpath('index.html').read_text().replace('<base href="./',f'<base href="{ASSET_ORIGIN}/')
  t=time.perf_counter();await page.set_content(html,wait_until='domcontentloaded',timeout=30000)
  try:
   await page.wait_for_function('window.__inkwave?.debug && window.__G?.game',timeout=180000,polling=1000)
  except Exception as e:
   report['bootError']=str(e);report['body']=await page.locator('body').inner_text();save();await page.screenshot(path=str(OUT/'boot-error.png'));raise
  report['bootSeconds']=time.perf_counter()-t;report['baseURI']=await page.evaluate('document.baseURI');print('BOOT',report['bootSeconds'],flush=True)
  await page.evaluate('''()=>{__inkwave.debug.freeze();__G.renderer.debug.checkShaderErrors=true;__inkwave.input.requestLock=()=>{}; const gl=__G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'); window.__stageGpu={renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE)};}''')
  report['buildRevision']=report['baseURI'].split('_versions/')[-1].strip('/');report['gpu']=await page.evaluate('__stageGpu')
  for id in IDS:
   try:
    row=await page.evaluate('''async id=>{
      const game=__inkwave,G=__G,t=performance.now();await game.startMatch({mapId:id,stageRule:'turf'});
      game.debug.freeze();game.match.setState('playing');game.match.paused=false;game.rig.follow(game.match.local,true);
      game.showcase.hide();game.menus?.show(null);game._skipRender=true;
      const {runSimulation}=await import(new URL('patches/splatoon3/runtime/clock.mjs',document.baseURI));
      const tick=()=>{runSimulation(game,1/60);game.rig.update(1/60);};
      for(const a of G.actors)if(a.bot){const update=a.bot.update;a.bot.update=function(dt){const result=update.call(this,dt);a.intent.fire=a.intent.sub=a.intent.special=false;return result;};}
      const player=game.match.local,spawnStarted=!!player.s3?.squidSpawn;
      game.rig.yaw=G.level.layout.spawnYaw[player.team];game.rig.pitch=-.65;game.input.keys.clear();
      tick();game.input.mouse.left=true;tick();game.input.mouse.left=false;
      for(let i=0;i<90;i++)tick();
      const landed=!player.s3?.squidSpawn&&player.alive;
      const before=player.pos.clone(),botsBefore=G.actors.filter(a=>a!==player).map(a=>a.pos.clone());
      game.input.keys.add('KeyW');for(let i=0;i<60;i++)tick();game.input.keys.delete('KeyW');
      const distance=before.distanceTo(player.pos),moveIntent=player.intent.move.length();
      for(let i=0;i<90&&!player.grounded;i++)tick();
      const jumpGrounded=player.grounded;game.input.keys.add('Space');game.input.pressed.add('Space');let jumpStart=player.pos.y,maxY=jumpStart;
      for(let i=0;i<30;i++){tick();maxY=Math.max(maxY,player.pos.y);}game.input.keys.delete('Space');
      for(let i=0;i<45;i++)tick();
      const jumpHeight=maxY-jumpStart;
      const liveActors=G.actors.filter(a=>a.alive).length;
      const botDistances=G.actors.filter(a=>a!==player).map((a,i)=>botsBefore[i].distanceTo(a.pos));
      game._frame(1/60);game._skipRender=false;
      const physics=G.physics,level=G.level,paint=G.paint,THREE=await import(new URL('vendor/three/build/three.module.js',document.baseURI));
      let paintResult=null;
      for(const f of level.faces){if(!f.paintable||f.n.y<.9||f.exposedArea<8)continue;
        const u=f.su*.5,v=f.sv*.5;if(!level.faceContainsUV(f,u,v))continue;
        const hitPoint=f.origin.clone().addScaledVector(f.u,u).addScaledVector(f.v,v),p=hitPoint.clone().addScaledVector(f.n,.12);
        if(level.pointInside(p,0,f.block))continue;
        const h=physics.raycast(p,f.n.clone().negate(),.3);if(!h.hit||h.face!==f.id)continue;
        paint.splat(p,1,0,{instant:true,seed:.271,kind:'shot'});paint.flush(0);
        const cpu=paint.sampleWorld(f.id,hitPoint),pixel=new Uint8Array(4),a=f.atlas;
        const x=Math.floor(a.x+a.pad+u*a.ppm),y=Math.floor(a.y+a.pad+v*a.ppm);
        G.renderer.readRenderTargetPixels(paint.rt,x,y,1,1,pixel);
        paintResult={face:f.id,cpu,pixel:[...pixel],gpuHasInk:pixel[3]>0};break;
      }
      // Actual game's scene and materials, with a reproducible overview camera for evidence.
      const b=level.bounds,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ),camera=G.camera;
      camera.position.set(span*.62,span*.87,-span*.74);camera.lookAt(0,1,0);camera.updateMatrixWorld();
      game.showcase.hide();game.menus?.show(null);game.hud?.setVisible(false);
      G.renderer.setRenderTarget(null);G.renderer.render(G.scene,camera);
      const calls=G.renderer.info.render.calls,triangles=G.renderer.info.render.triangles;
      const a=performance.now();for(let i=0;i<3;i++)G.renderer.render(G.scene,camera);const renderSubmissionMs=(performance.now()-a)/3;const finishStart=performance.now();G.renderer.getContext().finish();const gpuDrainMs=performance.now()-finishStart;
      game.minimap.ensure();
      return {id,loaded:level.layout.stageId===id,actors:G.actors.length,liveActors,playerDistance:distance,moveIntent,spawnStarted,landed,jumpGrounded,jumpHeight,botDistances,playerAlive:player.alive,finiteActors:G.actors.every(a=>a.pos.toArray().every(Number.isFinite)),paint:paintResult,rule:level.layout.layoutRule,hash:level.layout.compatibilityHash,kinematicGroups:G.stage25.controllers.size,stageElapsed:G.stage25.elapsed,calls,triangles,renderSubmissionMs,gpuDrainMs,geometryCount:G.renderer.info.memory.geometries,textureCount:G.renderer.info.memory.textures,minimap:{width:game.minimap.w,height:game.minimap.h,built:game.minimap._built},loadAndTestMs:performance.now()-t};
    }''',id)
    row['pass']=row['loaded'] and row['finiteActors'] and row['landed'] and row['playerDistance']>1 and row['moveIntent']>.9 and row['jumpGrounded'] and row['jumpHeight']>.25 and bool(row['paint']) and row['paint']['cpu']==1 and row['paint']['gpuHasInk']
    await page.screenshot(path=str(OUT/(id+'-overview.png')))
    report['stages'].append(row);save();print(id,json.dumps(row,ensure_ascii=False),flush=True)
   except Exception as e:
    report['stages'].append({'id':id,'pass':False,'error':str(e)});save();print('ERROR',id,str(e),flush=True)
  report['totals']={'stages':len(report['stages']),'passed':sum(bool(s.get('pass')) for s in report['stages']),'pageErrors':sum(x['type']=='pageerror' for x in report['logs'])};save();print('DONE',report['totals'],flush=True);await browser.close()
asyncio.run(main())
