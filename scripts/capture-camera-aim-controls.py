#!/usr/bin/env python3
"""Capture the REAL hosted build, not a replacement game.
Requires Python Playwright and a browser with WebGL. Logs an explicit failure
when navigation, rendering or gameplay boot is unavailable. Synthetic desktop
input is not evidence of real Switch/controller behavior or hardware latency.
"""
import argparse,json,pathlib,sys,time
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('url');p.add_argument('output');p.add_argument('--browser',default='/usr/bin/chromium');p.add_argument('--headed',action='store_true');args=p.parse_args()
out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
report={'url':args.url,'nativeGameFootage':False,'cadence':'synthetic engine steps, not physical display refresh','status':'not-run','runs':[],'errors':[]}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=args.browser,headless=not args.headed,timeout=15000)
  for width,height in [(1280,720),(1024,768),(1680,720),(720,1280)]:
   for hz in [30,60,120]:
    # A fresh context per cadence avoids walking farther down the range merely
    # because the previous cadence already ran. No original-game footage implied.
    context=browser.new_context(viewport={'width':width,'height':height})
    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.add_init_script("let seed=123456;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);")
    page.goto(args.url+('&' if '?' in args.url else '?')+'range&skipTitle',wait_until='domcontentloaded',timeout=30000)
    page.wait_for_function("window.__G?.match?.state==='playing' && !!window.__G.match.range",timeout=90000)
    page.evaluate("() => {__inkwave.debug.freeze();__inkwave.debug.freezeBots();__inkwave.s3Clock?.reset();}")
    samples=page.evaluate('''hz=>{
      const g=__inkwave,G=__G,a=G.match.controller.a;const samples=[];
      g.input.keys.clear();g.input.mouse.left=false;g.input.lastDevice='kbm';
      G.rig.yaw=0;G.rig.pitch=-.1;G.rig.follow(a,true);G.rig.update(1/60);
      for(let i=0;i<hz*3;i++){
        g.input.keys.add('KeyW');g.input.mouse.left=i>=hz;g.input.mouse.dx+=50/hz;
        g._frame(1/hz);
        samples.push({frame:i,time:i/hz,position:a.pos.toArray(),camera:G.camera.position.toArray(),
          fov:G.camera.fov,aim:a.aimPoint.toArray(),yaw:G.rig.yaw,pitch:G.rig.pitch});
      }
      g.input.keys.clear();g.input.mouse.left=false;return samples;
    }''',hz)
    label=f'{width}x{height}-{hz}hz';page.screenshot(path=str(out/(label+'.png')))
    (out/(label+'.json')).write_text(json.dumps(samples,indent=2));report['runs'].append({'label':label,'samples':len(samples),'errors':list(errors)})
    context.close()
  browser.close();report['status']='pass' if all(not r['errors'] for r in report['runs']) else 'errors'
except Exception as error:
 report['status']='blocked';report['errors'].append(str(error))
finally:(out/'capture-status.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2));sys.exit(0 if report['status']=='pass' else 1)
