import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-fake.mjs';
import worker from '../worker/index.js';
const origin='https://zevant.example';
const user={loginId:'RacePlayer',displayName:'Race',password:'old-surfing-42!',remember:true};
const next='new-surfing-73!';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function setup(){
 const DB=createD1(fileURLToPath(new URL('../migrations',import.meta.url)));
 const env={DB,PBKDF2_ITERATIONS:'1000'};
 const call=async(method,path,body,cookie)=>{
  const headers={'Content-Type':'application/json','X-Zevant-Request':'1',Origin:origin,...(cookie?{Cookie:cookie}:{})};
  const res=await worker.fetch(new Request(origin+'/api/account'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
  return{status:res.status,data:res.status===204?null:await res.json(),cookie:res.headers.get('Set-Cookie')?.split(';')[0]};
 };
 const registered=await call('POST','/register',user);assert.equal(registered.status,201);
 return{DB,env,call,cookie:registered.cookie};
}
function pauseFirstRead(env,pattern){
 const original=env.DB,entered=deferred(),release=deferred();let armed=true;
 env.DB={...original,prepare(sql){
  const wrap=st=>({bind(...args){return wrap(st.bind(...args));},async first(){const row=await st.first();if(armed&&pattern.test(sql)){armed=false;entered.resolve();await release.promise;}return row;},all:()=>st.all(),run:()=>st.run()});
  // Preserve native Statement instances except the one first() we intercept;
  // batch consumes native statements, not these read wrappers.
  return pattern.test(sql)?wrap(original.prepare(sql)):original.prepare(sql);
 }};
 return{entered:entered.promise,release:()=>release.resolve()};
}
for(const rehash of [false,true])test(`stale verified login cannot recreate a session after password change (rehash=${rehash})`,async()=>{
 const f=await setup();try{
  if(rehash)f.env.PBKDF2_ITERATIONS='2000';
  const gate=pauseFirstRead(f.env,/SELECT \* FROM users WHERE login_id_norm/);
  const stale=f.call('POST','/login',user);await gate.entered;
  const changed=await f.call('POST','/password',{currentPassword:user.password,newPassword:next},f.cookie);assert.equal(changed.status,200);
  gate.release();const rejected=await stale;assert.equal(rejected.status,401);assert.equal(rejected.data.error.code,'invalid_credentials');assert.equal(rejected.cookie,undefined);
  const fresh=await f.call('POST','/login',{loginId:user.loginId,password:next});assert.equal(fresh.status,200);
  assert.equal((await f.call('GET','/session',undefined,changed.cookie)).data.user.loginId,user.loginId);
 }finally{f.DB.raw.close();}
});
test('concurrent password changes cannot overwrite the winning password or revoke its replacement session',async()=>{
 const f=await setup();try{
  const gate=pauseFirstRead(f.env,/SELECT s.id AS session_id/);
  const stale=f.call('POST','/password',{currentPassword:user.password,newPassword:'losing-password-88!'},f.cookie);await gate.entered;
  const winner=await f.call('POST','/password',{currentPassword:user.password,newPassword:next},f.cookie);assert.equal(winner.status,200);
  gate.release();const rejected=await stale;assert.equal(rejected.status,401);assert.equal(rejected.data.error.code,'not_signed_in');assert.equal(rejected.cookie,undefined);
  assert.equal((await f.call('GET','/session',undefined,winner.cookie)).data.user.loginId,user.loginId);
  assert.equal((await f.call('POST','/login',{loginId:user.loginId,password:next})).status,200);
 }finally{f.DB.raw.close();}
});
test('stale delete authorization cannot delete an account after its password/session changed',async()=>{
 const f=await setup();try{
  const gate=pauseFirstRead(f.env,/SELECT s.id AS session_id/);
  const stale=f.call('POST','/delete',{password:user.password,confirm:user.loginId},f.cookie);await gate.entered;
  const winner=await f.call('POST','/password',{currentPassword:user.password,newPassword:next},f.cookie);assert.equal(winner.status,200);
  gate.release();assert.equal((await stale).status,401);
  assert.equal((await f.call('GET','/session',undefined,winner.cookie)).data.user.loginId,user.loginId);
 }finally{f.DB.raw.close();}
});
test('password rotation rolls back password and sessions together when a batch statement fails',async()=>{
 const f=await setup();try{
  const hash=f.DB.raw.prepare('SELECT password_hash FROM users').get().password_hash;
  const sessions=f.DB.raw.prepare('SELECT * FROM sessions ORDER BY id').all();
  f.env.DB={...f.DB,async batch(stmts){
   if(stmts.some(s=>/INSERT INTO sessions/.test(s.sql)))return f.DB.batch([...stmts,f.DB.prepare('INSERT INTO missing_rotation_test_table VALUES (1)')]);
   return f.DB.batch(stmts);
  }};
  const result=await f.call('POST','/password',{currentPassword:user.password,newPassword:next},f.cookie);assert.equal(result.status,500);
  assert.equal(f.DB.raw.prepare('SELECT password_hash FROM users').get().password_hash,hash);
  assert.deepEqual(f.DB.raw.prepare('SELECT * FROM sessions ORDER BY id').all(),sessions);
  assert.equal((await f.call('GET','/session',undefined,f.cookie)).data.user.loginId,user.loginId);
 }finally{f.DB.raw.close();}
});

test('concurrent valid logins upgrading the same hash both receive working sessions',async()=>{
 const f=await setup();try{
  f.env.PBKDF2_ITERATIONS='2000';
  const gate=pauseFirstRead(f.env,/SELECT \* FROM users WHERE login_id_norm/);
  const first=f.call('POST','/login',user);await gate.entered;
  const second=await f.call('POST','/login',user);assert.equal(second.status,200);
  gate.release();const result=await first;assert.equal(result.status,200);
  for(const cookie of [result.cookie,second.cookie])assert.equal((await f.call('GET','/session',undefined,cookie)).data.user.loginId,user.loginId);
 }finally{f.DB.raw.close();}
});
for(const [method,path,body]of [
 ['PATCH','/profile',{displayName:'Stale update'}],
 ['POST','/sessions/revoke',{scope:'others'}],
 ['GET','/sessions',undefined],
])test(`a revoked caller cannot complete a delayed ${method} ${path}`,async()=>{
 const f=await setup();try{
  const survivor=await f.call('POST','/login',user);assert.equal(survivor.status,200);
  const oldName=(await f.call('GET','/session',undefined,survivor.cookie)).data.user.displayName;
  const gate=pauseFirstRead(f.env,/SELECT s.id AS session_id/);
  const stale=f.call(method,path,body,f.cookie);await gate.entered;
  assert.equal((await f.call('POST','/logout',{},f.cookie)).status,204);
  gate.release();const result=await stale;assert.equal(result.status,401);
  const state=await f.call('GET','/session',undefined,survivor.cookie);assert.equal(state.data.user.displayName,oldName);
 }finally{f.DB.raw.close();}
});
test('a failed login-session commit does not advance the last-login timestamp',async()=>{
 const f=await setup();try{
  const sentinel=123456;f.DB.raw.prepare('UPDATE users SET last_login_at = ?').run(sentinel);
  f.env.DB={...f.DB,async batch(stmts){
   if(stmts.some(s=>/INSERT INTO sessions/.test(s.sql)))return f.DB.batch([...stmts,f.DB.prepare('INSERT INTO missing_login_test_table VALUES (1)')]);
   return f.DB.batch(stmts);
  }};
  const result=await f.call('POST','/login',user);assert.equal(result.status,500);
  assert.equal(f.DB.raw.prepare('SELECT last_login_at FROM users').get().last_login_at,sentinel);
  assert.equal(f.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
 }finally{f.DB.raw.close();}
});

for(const [method,path,body]of [
 ['PATCH','/profile',{displayName:'Wrong account'}],
 ['POST','/password',{currentPassword:user.password,newPassword:next}],
 ['POST','/delete',{password:user.password,confirm:'OtherTester'}],
 ['POST','/sessions/revoke',{scope:'others'}],
 ['GET','/sessions',undefined],
])test(`a form belonging to a different account cannot perform ${method} ${path}`,async()=>{
 const f=await setup();try{
  const first=(await f.call('GET','/session',undefined,f.cookie)).data.user;
  const other=await f.call('POST','/register',{...user,loginId:'OtherTester',displayName:'Other'});assert.equal(other.status,201);
  const result=await f.call(method,path+(method==='GET'?'?expectedUserId='+first.id:''),body?{...body,expectedUserId:first.id}:undefined,other.cookie);
  assert.equal(result.status,409);assert.equal(result.data.error.code,'account_changed');
  const unchanged=await f.call('GET','/session',undefined,other.cookie);assert.equal(unchanged.data.user.displayName,'Other');
 }finally{f.DB.raw.close();}
});
