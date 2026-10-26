import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserServer } from './local-browser-server.mjs';
import { runtimeClient, sharedLockFixture, until } from './client-runtime-fixture.mjs';
const user = { loginId: 'HttpTester', displayName: '試験', password: 'test-surfing-42!', remember: true };
const changedPassword = 'changed-surfing-73!';
async function fixture(t) {
  const server = await createBrowserServer(); const clients = [];
  t.after(async () => { for (const client of clients) client.close(); await server.close(); });
  const control = async value => {
    const response = await fetch(server.origin + (value === undefined ? '/__test/state' : '/__test/control'), {
      method: value === undefined ? 'GET' : 'POST', headers: { 'X-Test-Control': server.controlToken, 'Content-Type': 'application/json' },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
    assert.equal(response.status, 200); return response.json();
  };
  return { ...server, control, client(options) { const client = runtimeClient(server.origin, options); clients.push(client); return client; } };
}
const signUp = async client => client.account.mutateSession(() => client.api.register(user), r => client.account.signedIn(r.user));

test('real HTTP: register, rename, icon, password rotation, logout, login and deletion', { timeout: 10000 }, async t => {
  const f = await fixture(t), client = f.client();
  await signUp(client); assert.equal(client.account.user.loginId, user.loginId);
  await client.account.mutateSession(() => client.api.profile({ displayName: '変更確認', avatarIcon: 'star', avatarColor: '#2f5bff' }), r => client.account.signedIn(r.user));
  assert.equal(client.account.user.displayName, '変更確認'); assert.equal(client.account.user.avatarIcon, 'star');
  const oldCookie = client.jar.cookie;
  await client.account.mutateSession(() => client.api.password({ currentPassword: user.password, newPassword: changedPassword }), r => client.account.signedIn(r.user));
  assert.notEqual(client.jar.cookie, oldCookie);
  const old = f.client({ jar: { cookie: oldCookie } }); await old.account.refresh(); assert.equal(old.account.status, 'guest');
  await client.account.mutateSession(() => client.api.logout(), () => client.account.signedOut()); assert.equal(client.jar.cookie, '');
  await assert.rejects(client.api.login(user), e => e.code === 'invalid_credentials');
  await client.account.mutateSession(() => client.api.login({ ...user, password: changedPassword }), r => client.account.signedIn(r.user));
  await client.account.mutateSession(() => client.api.remove({ confirm: user.loginId, password: changedPassword }), () => client.account.signedOut());
  await client.account.refresh(); assert.equal(client.account.status, 'guest');
  await assert.rejects(client.api.login({ ...user, password: changedPassword }), e => e.code === 'invalid_credentials');
});

test('real HTTP: response cookies are HttpOnly and account responses forbid caching', async t => {
  const f = await fixture(t);
  const response = await fetch(f.origin + '/api/account/register', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Zevant-Request': '1', Origin: f.origin }, body: JSON.stringify(user) });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('Set-Cookie'); assert.match(cookie, /; HttpOnly(?:;|$)/); assert.match(cookie, /; SameSite=Lax(?:;|$)/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = JSON.stringify(await response.json()); assert(!/"(?:password|password_hash|passwordHash)"/.test(body)); assert(!body.includes(cookie.split(';')[0].split('=')[1]));
});

test('real HTTP: two cookie jars authenticate independently and revocation preserves the caller', async t => {
  const f = await fixture(t), a = f.client(), b = f.client(); await signUp(a);
  await b.account.mutateSession(() => b.api.login(user), r => b.account.signedIn(r.user));
  assert.notEqual(a.jar.cookie, b.jar.cookie);
  assert.equal((await a.api.sessions()).sessions.length, 2);
  const result = await a.account.mutateSession(() => a.api.revoke({ scope: 'others' }));
  assert.equal(result.sessions.length, 1); assert.equal(result.sessions[0].current, true);
  await Promise.all([a.account.refresh(), b.account.refresh()]); assert.equal(a.account.status, 'user'); assert.equal(b.account.status, 'guest');
});

test('real HTTP: independently loaded clients revalidate after Node BroadcastChannel invalidations', { timeout: 10000 }, async t => {
  const f = await fixture(t), jar = { cookie: '' }, locks = sharedLockFixture();
  const a = f.client({ jar, locks }), b = f.client({ jar, locks });
  a.account.watch(); b.account.watch(); await until(() => a.account.status === 'guest' && b.account.status === 'guest');
  await signUp(a); await until(() => b.account.user?.loginId === user.loginId);
  await a.account.mutateSession(() => a.api.rename('通知確認'), r => a.account.signedIn(r.user));
  await until(() => b.account.user?.displayName === '通知確認');
  await a.account.mutateSession(() => a.api.logout(), () => a.account.signedOut());
  await until(() => b.account.status === 'guest'); assert.equal(b.account.user, null);
});

test('real HTTP: account lock fixture remains held until a delayed response body completes', async t => {
  const f = await fixture(t), jar = { cookie: '' }, locks = sharedLockFixture();
  const a = f.client({ jar, locks, broadcast: false }), b = f.client({ jar, locks, broadcast: false });
  await signUp(a);
  await f.control({ resetTraffic: true, fault: { path: '/api/account/session', bodyDelay: 120, once: true } });
  const read = a.api.session();
  await new Promise(resolve => setTimeout(resolve, 15));
  const write = b.api.logout(); await Promise.all([read, write]);
  const state = await f.control(); assert.equal(state.maxActiveApi, 1);
  assert.deepEqual(state.traffic.map(x => x.path), ['/api/account/session', '/api/account/logout']);
});

test('real HTTP: cancellation of a delayed JSON body releases the client queue', async t => {
  const f = await fixture(t), client = f.client({ broadcast: false });
  await f.control({ fault: { path: '/api/account/session', bodyDelay: 150, once: true } });
  const ctl = new AbortController(); const pending = client.api.session({ signal: ctl.signal });
  const rejected = assert.rejects(pending, e => e.code === 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 35)); ctl.abort(); await rejected;
  assert.equal((await client.api.session()).user, null);
});

test('real HTTP: failed logout retains identity and permits an explicit successful retry', async t => {
  const f = await fixture(t), client = f.client(); await signUp(client);
  await f.control({ fault: { path: '/api/account/logout', mode: 'before' } });
  await assert.rejects(client.account.mutateSession(() => client.api.logout(), () => client.account.signedOut()), e => e.code === 'network');
  assert.equal(client.account.status, 'user'); await client.account.invalidateSession(); assert.equal(client.account.status, 'user');
  await f.control({ clearFaults: true });
  await client.account.mutateSession(() => client.api.logout(), () => client.account.signedOut()); assert.equal(client.account.status, 'guest');
});

test('real HTTP: lost logout response reconciles committed state without replaying the mutation', async t => {
  const f = await fixture(t), client = f.client(); await signUp(client);
  await f.control({ resetTraffic: true, fault: { path: '/api/account/logout', mode: 'after' } });
  await assert.rejects(client.account.mutateSession(() => client.api.logout(), () => client.account.signedOut()), e => e.code === 'network');
  await client.account.invalidateSession(); assert.equal(client.account.status, 'guest');
  assert.equal((await f.control()).traffic.filter(x => x.path === '/api/account/logout').length, 1);
});

test('real HTTP: untrusted origins and oversized UTF-8 JSON cannot create accounts', async t => {
  const f = await fixture(t);
  for (const [origin, body, expected] of [[ 'https://untrusted.example', user, 403 ], [f.origin, { extra: 'あ'.repeat(3000) }, 413]]) {
    const response = await fetch(f.origin + '/api/account/register', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zevant-Request': '1', Origin: origin }, body: JSON.stringify(body) });
    assert.equal(response.status, expected); await response.arrayBuffer();
  }
  const client = f.client(); await signUp(client); assert.equal(client.account.status, 'user');
});

test('real HTTP: a stale form cannot update the account selected in another client', async t => {
  const f=await fixture(t), jar={cookie:''}, locks=sharedLockFixture();
  const a=f.client({jar,locks}),b=f.client({jar,locks});await signUp(a);
  const expectedUserId=a.account.user.id,firstCookie=jar.cookie;
  await b.account.mutateSession(()=>b.api.register({...user,loginId:'OtherHttpUser',displayName:'Other'}),r=>b.account.signedIn(r.user));
  await assert.rejects(a.account.mutateSession(()=>a.api.rename('Wrong target',expectedUserId),r=>a.account.signedIn(r.user)),e=>e.code==='account_changed');
  await until(()=>a.account.user?.loginId==='OtherHttpUser');assert.equal(a.account.user.displayName,'Other');
  const first=f.client({jar:{cookie:firstCookie}});await first.account.refresh();assert.equal(first.account.user.displayName,user.displayName);
});
test('local integration fixture denies unauthenticated controls and encoded path escape',async t=>{
 const f=await fixture(t);
 for(const [path,status]of [['/__test/state',403],['/account/client/src/a%2F..%2F..%2F..%2F..%2Fpackage.json',403]]){
  const response=await fetch(f.origin+path);assert.equal(response.status,status);await response.arrayBuffer();
 }
});
