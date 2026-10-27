import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-fake.mjs';
test('D1 adapter binds numbered, repeated and out-of-order parameters without positional coercion',async t=>{
 const db=createD1(fileURLToPath(new URL('../migrations',import.meta.url)));t.after(()=>db.raw.close());
 const row=await db.prepare('SELECT ?2 AS second, ?1 AS first, ?2 AS repeated, ?3 AS absent').bind('one',42,null).first();
 assert.deepEqual({...row},{second:42,first:'one',repeated:42,absent:null});
});
test('D1 adapter rolls back every statement after a batch constraint failure',async t=>{
 const db=createD1(fileURLToPath(new URL('../migrations',import.meta.url)));t.after(()=>db.raw.close());
 db.raw.exec('CREATE TABLE fixture_items (id TEXT PRIMARY KEY, value INTEGER)');
 await assert.rejects(db.batch([db.prepare('INSERT INTO fixture_items VALUES (?1, ?2)').bind('a',1),db.prepare('INSERT INTO fixture_items VALUES (?1, ?2)').bind('a',2)]));
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM fixture_items').first()).n,0);
});
