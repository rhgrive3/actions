#!/usr/bin/env python3
"""Isolated DOM fixtures only. No network navigation, WebGL, or native Service Worker claim.
Requires Python Playwright + an installed Chromium. Bootstrap is replaced with a
fixture promise; profiler flag is explicit. This NEVER tests the complete game.
"""
import argparse
import asyncio
import base64
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
    root = Path(__file__).resolve().parents[1]
    runtime = (root / 'patches/loading-cache/runtime/startup.mjs').read_text()
    shell = (root / 'patches/loading-cache/shell.html').read_text()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    checks = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox'])
        try:
            for width, height in [(375, 812), (768, 1024), (1280, 800)]:
                page = await browser.new_page(viewport={'width': width, 'height': height})
                await page.set_content('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' + shell + '<div id="ui-root"></div><div id="fade" style="position:fixed;inset:0;background:black;opacity:1;z-index:50"></div>')
                box = await page.locator('#inkwave-startup-shell').bounding_box()
                assert box and box['width'] == width and box['height'] == height
                assert await page.locator('#inkwave-startup-shell h1').is_visible()
                checks.append(f'system-font shell visible and viewport-contained {width}x{height}')
                await page.screenshot(path=str(out / f'shell-{width}.png'))
                code = runtime.replace("await import('../../splatoon3/bootstrap.mjs');", 'await Promise.resolve();')
                assert code != runtime
                await page.evaluate('(source)=>import("data:text/javascript;base64,"+source)', base64.b64encode(code.encode()).decode())
                await page.evaluate('''() => { const ui=document.createElement('div');ui.className='iw-ui';document.getElementById('ui-root').append(ui); }''')
                await page.wait_for_timeout(30)
                assert await page.locator('#inkwave-startup-shell').is_visible(), 'empty menu shell is NOT meaningful UI'
                await page.evaluate("document.querySelector('.iw-ui').dataset.screen='loading'")
                await page.wait_for_timeout(40)
                assert await page.locator('#inkwave-startup-shell').is_hidden()
                assert await page.locator('#fade').evaluate('el=>getComputedStyle(el).opacity') == '0'
                assert await page.evaluate("__inkwaveStartup.report.marks['menu-interactive']===undefined")
                checks.append(f'loading DOM handover removes opaque boot fade, not called menu-ready ({width})')
                await page.evaluate('''() => {const ui=document.querySelector('.iw-ui');ui.dataset.screen='title';__inkwaveStartup.engineReady({bootMs:42,bootMarks:[['fixture',42]]});}''')
                await page.wait_for_timeout(40)
                assert await page.evaluate("Number.isFinite(__inkwaveStartup.report.marks['menu-interactive'])")
                assert await page.evaluate('''() => { let n=0;const value=__inkwaveStartup.measure('fixture',()=>++n);return value===1&&n===1&&__inkwaveStartup.report.phases.length===0; }''')
                checks.append(f'title marker separated from loading, production instrumentation bypass ({width})')
                await page.close()
            page = await browser.new_page(viewport={'width': 375, 'height': 812})
            await page.set_content(shell + '<div id="ui-root"></div>')
            code = runtime.replace("const profile = new URLSearchParams(location.search).has('startupProfile');", 'const profile = true;').replace("await import('../../splatoon3/bootstrap.mjs');", 'await Promise.resolve();')
            await page.evaluate('(s)=>import("data:text/javascript;base64,"+s)', base64.b64encode(code.encode()).decode())
            result = await page.evaluate('''async () => {
              const s=__inkwaveStartup;for(let i=0;i<600;i++)s.measure('fixture/'+i,()=>i);
              let rejected=false;try{await s.measure('rejection',()=>Promise.reject(new Error('fixture rejection')));}catch{rejected=true;}
              window.__G={mode:'menu'};s.battleReady({match:{attract:false}});const notReady=s.report.marks['first-battle-ready']===undefined;
              __G.mode='match';s.battleReady({match:{attract:true}});const attractNotReady=s.report.marks['first-battle-ready']===undefined;
              s.battleReady({match:{attract:false}});
              return {phases:s.report.phases.length,dropped:s.report.dropped,rejected,notReady,attractNotReady,ready:Number.isFinite(s.report.marks['first-battle-ready'])};
            }''')
            assert result['phases'] == 256 and result['dropped'] >= 345 and all(result[k] for k in ['rejected','notReady','attractNotReady','ready'])
            checks.append('profiler bounded at 256 phases, promise rejection preserved, attract/menu excluded from battle marker')
            await page.close()
            page = await browser.new_page(viewport={'width': 375, 'height': 812})
            await page.set_content(shell + '<div id="ui-root"></div>')
            await page.evaluate("Object.defineProperty(navigator,'onLine',{configurable:true,value:false})")
            code = runtime.replace("await import('../../splatoon3/bootstrap.mjs');", "await Promise.reject(new Error('fixture missing bootstrap'));")
            await page.evaluate('(s)=>import("data:text/javascript;base64,"+s)', base64.b64encode(code.encode()).decode())
            assert await page.locator('#inkwave-startup-retry').is_visible()
            assert '保存されていません' in await page.locator('#inkwave-startup-status').inner_text()
            assert await page.evaluate('__inkwaveStartup.report.errors.length') == 1
            await page.evaluate("Object.defineProperty(navigator,'onLine',{configurable:true,value:true});dispatchEvent(new Event('online'))")
            assert '失敗しました' in await page.locator('#inkwave-startup-status').inner_text()
            assert page.url == 'about:blank'
            checks.append('failed offline bootstrap keeps shell and manual recovery; no navigation/reload')
            await page.evaluate("Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'))")
            await page.screenshot(path=str(out / 'shell-offline-error.png'))
            await page.close()
            page=await browser.new_page()
            await page.set_content(shell+'<div id="ui-root"></div>')
            await page.evaluate("""() => {
              Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
              window.__fixture={registrations:0,handlers:{},idle:[]};
              const active={postMessage(message,ports){ports[0].postMessage({type:'INKWAVE_CACHE_STATUS',revision:'fixture',offlineReady:true});}};
              const installing={state:'installing',addEventListener(type,fn){__fixture.stateChange=fn;}};
              const registration={active,installing,waiting:null,addEventListener(type,fn){__fixture.handlers[type]=fn;}};
              __fixture.registration=registration;
              Object.defineProperty(navigator,'serviceWorker',{value:{controller:active,ready:Promise.resolve(registration),async register(url,options){__fixture.registrations++;__fixture.url=url.href;__fixture.options=options;return registration;}},configurable:true});
              window.requestIdleCallback=fn=>{__fixture.idle.push(fn);return 1;};
            }""")
            code=runtime.replace("await import('../../splatoon3/bootstrap.mjs');",'await Promise.resolve();').replace("const root = new URL('./', location.href);","const root = new URL('https://fixture.invalid/actions/');")
            await page.evaluate('(s)=>import("data:text/javascript;base64,"+s)',base64.b64encode(code.encode()).decode())
            await page.evaluate("""() => {const ui=document.createElement('div');ui.className='iw-ui';ui.dataset.screen='title';document.getElementById('ui-root').append(ui);__inkwaveStartup.engineReady({});}""")
            await page.wait_for_timeout(30)
            await page.evaluate("document.querySelector('.iw-ui').dataset.screen='setup';__fixture.idle.shift()()")
            assert await page.evaluate('__fixture.registrations')==0
            await page.evaluate("document.querySelector('.iw-ui').dataset.screen='title'")
            await page.wait_for_timeout(30)
            await page.evaluate('__fixture.idle.shift()()')
            await page.wait_for_timeout(50)
            assert await page.evaluate('__fixture.registrations')==1
            assert await page.evaluate('__fixture.url')=='https://fixture.invalid/actions/sw.js'
            assert await page.evaluate('typeof __fixture.stateChange')=='function'
            await page.evaluate("__fixture.registration.waiting=__fixture.registration.installing;__fixture.registration.installing.state='installed';__fixture.stateChange()")
            assert '更新データ' in await page.locator('#inkwave-cache-status').inner_text()
            await page.evaluate("Object.defineProperty(navigator,'onLine',{value:false,configurable:true});dispatchEvent(new Event('offline'));Object.defineProperty(navigator,'onLine',{value:true,configurable:true});dispatchEvent(new Event('online'))")
            assert '更新データ' in await page.locator('#inkwave-cache-status').inner_text()
            checks.append('FAKE registration: cancels after quick Play, one root registration, already-installing listener, waiting notice survives connectivity change')
            await page.close()
        finally:
            await browser.close()
    result = {'status': 'passed', 'fixture': 'about:blank native DOM; substituted bootstrap promise; NOT full-game/browser-network/PWA test', 'checks': checks, 'checkCount': len(checks)}
    (out / 'dom-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--out', default='reports/loading-cache/dom')
    asyncio.run(main(parser.parse_args()))
