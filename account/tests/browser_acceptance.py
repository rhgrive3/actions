"""Native Chromium acceptance against the real account Worker and SQLite.

Run from the repository root: python3 account/tests/browser_acceptance.py
Requires Python Playwright plus Chromium (CHROMIUM_PATH, or its normal install).
No public server, production database, game assets or physical devices are used.
Server startup and Service Worker waits have deadlines. Source modules are NOT
represented as a Vite build. A browser-policy denial fails preflight; it is never
converted to a passing skip or retried through an alternate host.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import shutil
import select
import subprocess
import time
import unittest
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('INKWAVE_ACCEPTANCE_OUTPUT', ROOT / 'reports' / 'remaining-quality-20261026' / 'browser'))
OUT.mkdir(parents=True, exist_ok=True)
USER = {'loginId': 'BrowserTester', 'displayName': 'テスト', 'password': 'safe-surfing-42!', 'remember': True}
NEXT_PASSWORD = 'changed-surfing-73!'

class Acceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.measurements = {'physicalDevices': False, 'productionBuild': False,
                            'externalFonts': 'offline fallback', 'preflightPassed': False,
                            'testType': 'source-modules + real Worker + SQLite + native browser APIs'}
        cls.addClassCleanup(lambda: (OUT / 'measurements.json').write_text(
            json.dumps(cls.measurements, ensure_ascii=False, indent=2) + '\n'))
        cls.stderr = (OUT / 'local-server.log').open('w')
        cls.addClassCleanup(cls.stderr.close)
        cls.server = subprocess.Popen(['node', str(ROOT / 'account/tests/local-browser-server.mjs')], cwd=ROOT,
                                      stdout=subprocess.PIPE, stderr=cls.stderr, text=True, env=os.environ.copy())
        def stop_server():
            if cls.server.poll() is None:
                cls.server.terminate()
                try:
                    cls.server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    cls.server.kill()
                    cls.server.wait(timeout=5)
            cls.server.stdout.close()
        cls.addClassCleanup(stop_server)
        if not select.select([cls.server.stdout], [], [], 15)[0]:
            raise RuntimeError('Local acceptance server did not start within 15 seconds')
        config = json.loads(cls.server.stdout.readline())
        cls.origin, cls.token = config['origin'], config['controlToken']
        cls.playwright = sync_playwright().start()
        cls.addClassCleanup(cls.playwright.stop)
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
        if executable:
            options['executable_path'] = executable
        cls.browser = cls.playwright.chromium.launch(**options)
        cls.addClassCleanup(cls.browser.close)
        cls.measurements['browser'] = cls.browser.version
        preflight = cls.browser.new_page()
        try:
            preflight.goto(cls.origin + '/control.html', wait_until='domcontentloaded', timeout=7000)
            cls.measurements['preflightPassed'] = True
        except Exception as error:
            cls.measurements['preflightError'] = str(error)
            raise RuntimeError('Native browser preflight failed. No alternate-host or policy bypass is attempted.') from error
        finally:
            preflight.close()

    def control(self, value=None):
        request = urllib.request.Request(self.origin + ('/__test/state' if value is None else '/__test/control'),
                    data=None if value is None else json.dumps(value).encode(),
                    headers={'X-Test-Control': self.token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    def setUp(self):
        self.control({'resetDatabase': True, 'clearFaults': True, 'resetTraffic': True})
        self.contexts, self.errors, self.remote = [], [], []
        self.addCleanup(self.close_contexts)
        self.context = self.new_context()
        self.page = self.new_page(self.context)

    def new_context(self, **kwargs):
        context = self.browser.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce', **kwargs)
        self.contexts.append(context)
        def external(route):
            url = route.request.url
            if url.startswith(('https://fonts.googleapis.com/', 'https://fonts.gstatic.com/')):
                route.fulfill(status=200, content_type='text/css', body='')
            else:
                self.remote.append(url)
                route.abort()
        context.route('https://**/*', external)
        return context

    def new_page(self, context):
        page = context.new_page()
        page.set_default_timeout(7000)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.goto(self.origin + '/', wait_until='domcontentloaded')
        page.wait_for_function('window.__qa && __qa.account.status !== "loading"')
        return page

    def close_contexts(self):
        while self.contexts:
            self.contexts.pop().close()

    def tearDown(self):
        self.close_contexts()
        self.control({'clearFaults': True})
        self.assertEqual(self.errors, [], 'uncaught page exceptions')
        self.assertEqual(self.remote, [], 'unexpected nonlocal network requests')

    def seed(self, page=None):
        page = page or self.page
        page.evaluate('''async user => __qa.account.mutateSession(() => __qa.api.register(user), r => __qa.account.signedIn(r.user))''', USER)

    def open(self, view='account', page=None):
        (page or self.page).evaluate('view => zevantAccount.open(view).then(() => true)', view)
        (page or self.page).wait_for_selector('.zva-root:not(.is-leaving)')

    def wait_user(self, page=None, login=USER['loginId']):
        (page or self.page).wait_for_function('(id) => __qa.account.user?.loginId === id', arg=login)

    def wait_guest(self, page=None):
        (page or self.page).wait_for_function('__qa.account.status === "guest" && !__qa.account.user')

    def close_panel(self, page=None):
        (page or self.page).evaluate('zevantAccount.close()')
        (page or self.page).wait_for_selector('.zva-root', state='detached')

    def test_01_complete_browser_user_journey(self):
        p = self.page
        self.open('register')
        p.locator('input[name=username]').fill(USER['loginId'])
        p.locator('input[name=nickname]').fill(USER['displayName'])
        p.locator('input[name=new-password]').fill(USER['password'])
        p.locator('input[name=confirm-password]').fill(USER['password'])
        p.locator('form button[type=submit]').click()
        self.wait_user()
        p.wait_for_selector('.zva-root', state='detached')
        cookies = [c for c in self.context.cookies() if c['name'].endswith('zv_session')]
        self.assertEqual(len(cookies), 1)
        self.assertTrue(cookies[0]['httpOnly'])
        self.assertEqual(cookies[0]['sameSite'], 'Lax')
        self.assertNotIn('zv_session', p.evaluate('document.cookie'))
        tab = self.new_page(self.context)
        self.wait_user(tab)
        self.open('rename')
        p.locator('input[name=nickname]').fill('同期確認')
        p.locator('form button[type=submit]').click()
        p.wait_for_selector('.zva-root[data-view=account]')
        tab.wait_for_function('__qa.account.user?.displayName === "同期確認"')
        self.close_panel()
        self.open('icon')
        p.locator('button[data-v=star]').click()
        p.locator('form button[type=submit]').click()
        p.wait_for_function('__qa.account.user.avatarIcon === "star"')
        tab.wait_for_function('__qa.account.user.avatarIcon === "star"')
        self.close_panel()
        self.open('password')
        p.locator('input[name=current-password]').fill(USER['password'])
        p.locator('input[name=new-password]').fill(NEXT_PASSWORD)
        p.locator('input[name=confirm-password]').fill(NEXT_PASSWORD)
        p.locator('form button[type=submit]').click()
        p.wait_for_selector('.zva-root[data-view=account]')
        self.close_panel()
        self.open()
        p.locator('.zva-row').filter(has_text='ログアウト').click()
        self.wait_guest()
        self.wait_guest(tab)
        p.wait_for_selector('.zva-root', state='detached')
        self.open('login')
        p.locator('input[name=username]').fill(USER['loginId'])
        p.locator('input[name=password]').fill(USER['password'])
        p.locator('form button[type=submit]').click()
        p.get_by_text('ユーザーIDかパスワードがちがいます', exact=True).wait_for()
        p.locator('input[name=password]').fill(NEXT_PASSWORD)
        p.locator('form button[type=submit]').click()
        self.wait_user()
        p.wait_for_selector('.zva-root', state='detached')
        self.open('delete')
        p.locator('input[name=confirm-id]').fill(USER['loginId'])
        p.locator('input[name=current-password]').fill(NEXT_PASSWORD)
        p.locator('form button[type=submit]').click()
        self.wait_guest()
        self.wait_guest(tab)
        p.wait_for_selector('.zva-root', state='detached')
        self.measurements['journey'] = ['UI registration', 'HttpOnly cookie', 'cross-tab rename', 'cross-tab icon',
                                        'password rotation', 'UI logout', 'old password rejected', 'new login', 'UI deletion']

    def test_02_native_locks_serialize_tabs_through_body(self):
        self.assertTrue(self.page.evaluate('isSecureContext && typeof navigator.locks?.request === "function"'))
        tab = self.new_page(self.context)
        for page in [self.page, tab]:
            page.evaluate('__qa.account.watch()()')
        self.control({'resetTraffic': True, 'fault': {'path': '/api/account/session', 'bodyDelay': 400, 'once': True}})
        self.page.evaluate('window.__held = __qa.api.session(); true')
        self.page.wait_for_function('navigator.locks.query().then(r => r.held.length > 0)')
        tab.evaluate('window.__write = __qa.api.logout(); true')
        tab.wait_for_function('navigator.locks.query().then(r => r.pending.length > 0)')
        self.page.evaluate('window.__held')
        tab.evaluate('window.__write')
        state = self.control()
        calls = [r['path'] for r in state['traffic']]
        self.assertEqual(calls, ['/api/account/session', '/api/account/logout'])
        self.assertEqual(state['maxActiveApi'], 1)
        self.measurements['nativeLockMaxConcurrentRequests'] = state['maxActiveApi']

    def test_03_two_cookie_jars_and_revoke_other_device(self):
        self.seed()
        other_context = self.new_context()
        other = self.new_page(other_context)
        other.evaluate('''async user => __qa.account.mutateSession(() => __qa.api.login(user), r => __qa.account.signedIn(r.user))''', USER)
        self.open('devices')
        self.page.wait_for_function('document.querySelectorAll(".zva-device:not(.is-empty)").length === 2')
        self.page.get_by_role('button', name='ほかの端末をすべてログアウト', exact=True).click()
        self.page.get_by_text('ほかにログイン中の端末はありません。', exact=True).wait_for()
        other.evaluate('__qa.account.refresh()')
        self.wait_guest(other)
        self.wait_user()

    def test_04_failed_logout_is_not_false_success(self):
        self.seed()
        self.open()
        self.control({'fault': {'path': '/api/account/logout', 'mode': 'before'}})
        self.page.locator('.zva-row').filter(has_text='ログアウト').click()
        self.page.locator('.zva-toast__item.is-error').wait_for()
        self.page.wait_for_function('!document.querySelector(".zva-row.is-busy")')
        self.wait_user()
        self.assertEqual(self.page.locator('.zva-root').get_attribute('data-view'), 'account')
        self.control({'clearFaults': True})
        self.page.locator('.zva-row').filter(has_text='ログアウト').click()
        self.wait_guest()
        self.page.wait_for_selector('.zva-root', state='detached')

    def test_05_ambiguous_logout_reconciles_without_replay(self):
        self.seed()
        self.open()
        self.control({'resetTraffic': True, 'fault': {'path': '/api/account/logout', 'mode': 'after'}})
        self.page.locator('.zva-row').filter(has_text='ログアウト').click()
        self.wait_guest()
        self.assertEqual(self.page.locator('.zva-root').get_attribute('data-view'), 'login')
        count = sum(r['path'] == '/api/account/logout' for r in self.control()['traffic'])
        self.assertEqual(count, 1)

    def test_06_late_form_does_not_replace_new_view(self):
        self.seed()
        self.open('rename')
        self.control({'fault': {'path': '/api/account/profile', 'delay': 250, 'once': True}})
        self.page.locator('input[name=nickname]').fill('後着結果')
        self.page.locator('form button[type=submit]').click()
        self.page.evaluate('zevantAccount.open().then(p => p.show("devices"))')
        self.page.wait_for_function('__qa.account.user?.displayName === "後着結果"')
        self.page.wait_for_selector('.zva-device.is-current')
        self.assertEqual(self.page.locator('.zva-root').get_attribute('data-view'), 'devices')

    def test_07_closed_form_does_not_reopen_or_restore_focus(self):
        self.seed()
        self.open('rename')
        self.control({'fault': {'path': '/api/account/profile', 'delay': 250, 'once': True}})
        self.page.locator('input[name=nickname]').fill('閉じた後')
        self.page.locator('form button[type=submit]').click()
        self.close_panel()
        self.page.wait_for_function('__qa.account.user?.displayName === "閉じた後"')
        self.assertEqual(self.page.locator('.zva-root').count(), 0)
        self.assertFalse(self.page.evaluate('document.activeElement?.closest(".zva-root") != null'))

    def test_08_watch_and_panel_lifecycle_are_bounded(self):
        self.seed()
        before = self.page.evaluate('({subs:__qa.account._subs.size, styles:document.querySelectorAll("#zva-panel-style").length})')
        result = self.page.evaluate('''async () => {
          const stop=__qa.account.watch(); if(stop!==__qa.account.watch())throw Error('duplicate watcher');
          for(let i=0;i<80;i++){await zevantAccount.open('account');zevantAccount.close();}
          return {subs:__qa.account._subs.size, roots:document.querySelectorAll('.zva-root').length,
            styles:document.querySelectorAll('#zva-panel-style').length};
        }''')
        self.assertEqual(result['subs'], before['subs'])
        self.assertEqual(result['roots'], 0)
        self.assertEqual(result['styles'], 1)
        self.measurements['panelCycles'] = {'cycles': 80, 'subscribersBefore': before['subs'], 'subscribersAfter': result['subs'], 'remainingDialogs': 0}

    def test_09_responsive_viewports_and_keyboard_focus(self):
        self.seed()
        self.open('register')
        measurements = []
        for width, height in [(320,640), (744,1133), (1133,744), (844,390)]:
            self.page.set_viewport_size({'width':width, 'height':height})
            self.page.locator('input[name=confirm-password]').focus()
            self.page.locator('form button[type=submit]').scroll_into_view_if_needed()
            box = self.page.locator('.zva-dialog').bounding_box()
            self.assertGreaterEqual(box['x'], -1)
            self.assertGreaterEqual(box['y'], -1)
            self.assertLessEqual(box['x']+box['width'], width+1)
            self.assertLessEqual(box['y']+box['height'], height+1)
            measurements.append({'width':width,'height':height,'dialog':box})
        self.page.screenshot(path=str(OUT/'account-landscape.png'))
        self.page.set_viewport_size({'width':744,'height':1133})
        self.page.screenshot(path=str(OUT/'account-tablet-viewport.png'))
        self.page.keyboard.press('Tab')
        self.assertTrue(self.page.evaluate('document.activeElement.closest(".zva-root") != null'))
        self.page.keyboard.press('Escape')
        self.page.wait_for_selector('.zva-root', state='detached')
        self.measurements['emulatedViewportsNotDevices'] = measurements

    def test_10_stale_device_error_cannot_sign_out_new_identity_legacy(self):
        self.context.close();self.contexts.remove(self.context)
        self.context=self.new_context()
        self.context.add_init_script("Object.defineProperty(navigator, 'locks', {value:undefined});")
        self.page=self.new_page(self.context)
        self.seed()
        tab=self.new_page(self.context)
        self.control({'fault':{'path':'/api/account/sessions','mode':'unauthorized','bodyDelay':350,'once':True}})
        self.open('devices')
        self.page.wait_for_function('__qa.account.user != null')
        tab.evaluate('''async user => __qa.account.mutateSession(() => __qa.api.login(user), r => __qa.account.signedIn(r.user))''', USER)
        self.page.wait_for_selector('.zva-device.is-current')
        self.wait_user()
        self.assertEqual(self.page.locator('.zva-root').get_attribute('data-view'),'devices')

    def sw_open(self, name):
        self.page.goto(self.origin+'/swcheck/'+name+'/', wait_until='domcontentloaded')
        self.page.evaluate('Promise.race([registrationPromise, new Promise((_,reject)=>setTimeout(()=>reject(Error(\"SW registration deadline\")),35000))])')
        self.page.wait_for_function('navigator.serviceWorker.controller != null')
        return self.sw_status(self.page)

    def sw_status(self, page):
        return page.evaluate('''async () => {
          const r=await navigator.serviceWorker.getRegistration();
          const target=navigator.serviceWorker.controller || r.active;
          return await new Promise((resolve,reject)=>{const p=new MessageChannel();const t=setTimeout(()=>reject(Error('status timeout')),5000);
            p.port1.onmessage=e=>{clearTimeout(t);p.port1.close();resolve(e.data)};
            target.postMessage({type:'INKWAVE_CACHE_STATUS'},[p.port2]);});
        }''')

    def test_11_native_sw_install_warm_fetch_and_offline_reload(self):
        status=self.sw_open('warm-offline')
        self.assertTrue(status['offlineReady'])
        revision=status['revision']
        first=self.page.evaluate('(r)=>fetch("./_versions/"+r+"/lazy.json").then(r=>r.json())',revision)
        self.assertEqual(first,{'version':'A','lazy':True})
        self.context.set_offline(True)
        self.page.reload(wait_until='domcontentloaded')
        self.page.wait_for_function('window.fixtureVersion === "A"')
        second=self.page.evaluate('(r)=>fetch("./_versions/"+r+"/lazy.json").then(r=>r.json())',revision)
        self.assertEqual(second,first)
        self.assertTrue(self.sw_status(self.page)['offlineReady'])
        self.context.set_offline(False)

    def test_12_native_sw_corrupt_candidate_preserves_active_revision(self):
        status=self.sw_open('bad-update')
        self.control({'sw':{'name':'bad-update','version':'B','corrupt':True}})
        self.page.evaluate('''async()=>{const r=await navigator.serviceWorker.getRegistration();window.__candidateDone=new Promise(resolve=>r.addEventListener('updatefound',()=>{
          const w=r.installing;w.addEventListener('statechange',()=>{if(w.state==='redundant')resolve(w.state);});},{once:true}));await r.update();}''')
        self.assertEqual(self.page.evaluate('Promise.race([window.__candidateDone, new Promise((_,reject)=>setTimeout(()=>reject(Error(\"SW candidate deadline\")),35000))])'),'redundant')
        self.assertEqual(self.sw_status(self.page)['revision'],status['revision'])
        self.context.set_offline(True)
        self.page.reload(wait_until='domcontentloaded')
        self.page.wait_for_function('window.fixtureVersion === "A"')
        self.context.set_offline(False)

    def test_13_native_sw_upgrade_waits_for_old_client_then_activates(self):
        old=self.sw_open('good-update')
        self.page.evaluate('caches.open("neighbor-app-test").then(c=>c.put("/neighbor",new Response("keep")))')
        self.control({'sw':{'name':'good-update','version':'B'}})
        self.page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
        self.page.wait_for_function('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)')
        self.assertEqual(self.sw_status(self.page)['revision'],old['revision'])
        self.assertEqual(self.page.evaluate('window.fixtureVersion'),'A')
        control=self.context.new_page();control.set_default_timeout(7000)
        control.goto(self.origin+'/control.html')
        self.page.close()
        scope=self.origin+'/swcheck/good-update/'
        control.wait_for_function('(scope)=>navigator.serviceWorker.getRegistration(scope).then(r=>!!r.active&&!r.waiting&&!r.installing)',arg=scope)
        self.page=self.context.new_page();self.page.set_default_timeout(7000)
        self.page.goto(scope,wait_until='domcontentloaded')
        self.page.wait_for_function('window.fixtureVersion === "B"')
        current=self.sw_status(self.page)
        self.assertNotEqual(current['revision'],old['revision'])
        self.assertEqual(self.page.evaluate('caches.open("neighbor-app-test").then(c=>c.match("/neighbor")).then(r=>r.text())'),'keep')
        names=self.page.evaluate('caches.keys()')
        self.assertEqual(sum(n.startswith('inkwave-startup-v2:/swcheck/good-update/:') and not n.endswith(':state') for n in names),2)

    def test_14_native_sw_rejects_oversized_stream_and_cancels_transport(self):
        status=self.sw_open('oversize')
        self.control({'sw':{'name':'oversize','oversize':True}})
        failed=self.page.evaluate('''async rev=>{try{const r=await fetch('./_versions/'+rev+'/large.bin');await r.arrayBuffer();return false;}catch{return true;}}''',status['revision'])
        self.assertTrue(failed)
        # The fixture emits at most 100 chunks per attempt. Rejection should
        # cancel both attempts well before the full body, not just ignore it.
        state=self.control()['sw']['oversize']
        self.assertLess(state['sentChunks'],20)
        self.assertEqual(state['cancelledStreams'],2)
        self.measurements['nativeOversize'] = state
        self.assertTrue(self.sw_status(self.page)['offlineReady'])

    def test_15_native_sw_excludes_account_api_and_recovers_after_eviction(self):
        self.sw_open('evict')
        response=self.page.evaluate('fetch("/api/account/session").then(async r=>({status:r.status,cache:r.headers.get("cache-control"),body:await r.json()}))')
        self.assertEqual(response['status'],200)
        self.assertEqual(response['cache'],'no-store')
        urls=self.page.evaluate('''async()=>{let urls=[];for(const name of await caches.keys()){const c=await caches.open(name);urls.push(...(await c.keys()).map(r=>r.url));}return urls;}''')
        self.assertFalse(any('/api/account' in url for url in urls))
        self.page.evaluate('''async()=>{for(const name of await caches.keys())if(name.startsWith('inkwave-startup-v2:/swcheck/evict/:'))await caches.delete(name);}''')
        self.context.set_offline(True)
        response=self.page.reload(wait_until='domcontentloaded')
        self.assertEqual(response.status,503)
        self.assertIn('オフライン',self.page.locator('body').inner_text())
        self.context.set_offline(False)

class JsonResult(unittest.TextTestResult):
    def startTest(self,test):
        self.started=time.monotonic();super().startTest(test)
    def addSuccess(self,test):
        super().addSuccess(test);self.records.append({'test':test.id(),'status':'passed','seconds':round(time.monotonic()-self.started,3)})
    def addFailure(self,test,err):
        super().addFailure(test,err);self.records.append({'test':test.id(),'status':'failed','detail':self._exc_info_to_string(err,test)})
    def addError(self,test,err):
        super().addError(test,err);self.records.append({'test':test.id(),'status':'error','detail':self._exc_info_to_string(err,test)})
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs);self.records=[]

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Acceptance)
    result=unittest.TextTestRunner(verbosity=2,resultclass=JsonResult).run(suite)
    (OUT/'results.json').write_text(json.dumps({'testsRun':result.testsRun,'success':result.wasSuccessful(),'results':result.records},ensure_ascii=False,indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful() else 1)
