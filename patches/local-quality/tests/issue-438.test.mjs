import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptResultOrder } from '../issue-438-adapter.mjs';
import { turfRankValue, compareTurfRows, orderTeamRows } from '../result-order.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const MENUS = read('inkwave-public/src/ui/menus.js');
const ADAPTED = adaptResultOrder('src/ui/menus.js', MENUS);

const turfRow = (name, team, turf, extra = {}) => ({ name, team, turf, ...extra });

test('issue-438 native path: team rows with authoritative turf sort 1100/900/700/450', () => {
  const players = [
    turfRow('A', 0, 450), turfRow('B', 0, 1100), turfRow('C', 0, 700), turfRow('D', 0, 900),
    turfRow('E', 1, 100), turfRow('F', 1, 900), turfRow('G', 1, 900), turfRow('H', 1, 0),
  ];
  const native = players.slice().sort((x, y) => (x.team - y.team) || (y.turf - x.turf));
  const ranked = players.slice().sort((x, y) => (x.team - y.team) || (turfRankValue(y) - turfRankValue(x)));
  const alpha = (rows) => rows.filter((p) => p.team === 0).map((p) => p.turf);
  assert.deepEqual(alpha(native), [1100, 900, 700, 450]);
  assert.deepEqual(alpha(ranked), [1100, 900, 700, 450]);
  assert.deepEqual(ranked.filter((p) => p.team === 1).map((p) => p.name), ['F', 'G', 'E', 'H']);
});

test('issue-438 negative main control: missing/NaN turf keeps deterministic finite order', () => {
  const rows = [turfRow('x', 0), turfRow('y', 0, NaN), turfRow('z', 0, 5), turfRow('w', 0, -3)];
  const native = rows.slice().sort((x, y) => (x.team - y.team) || (y.turf - x.turf));
  const ranked = orderTeamRows(rows);
  // Native NaN comparator cannot order: roster order is preserved (x stays first).
  assert.deepEqual(native.map((p) => p.name), ['x', 'y', 'z', 'w']);
  // Adapter coerces to finite ranks: 5 first, then stable ties at 0.
  assert.deepEqual(ranked.map((p) => p.name), ['z', 'x', 'y', 'w']);
  assert.equal(compareTurfRows({ turf: 5 }, { turf: NaN }), -5);
  assert.equal(turfRankValue({}), 0);
});

test('issue-438 owner/remote isolation: sorting copies, local pin and boss path untouched', () => {
  const rows = [turfRow('A', 0, 450, { isSelf: true }), turfRow('B', 0, 1100), turfRow('C', 0, 700)];
  const before = rows.map((p) => p.name);
  const ranked = orderTeamRows(rows);
  assert.deepEqual(rows.map((p) => p.name), before);
  assert.deepEqual(ranked.map((p) => p.name), ['B', 'C', 'A']);
  assert.equal(ranked.find((p) => p.isSelf).name, 'A');
  assert.notEqual(ranked, rows);
  // Same helper works for both teams independently; team grouping stays upstream.
  const mixed = [...rows, turfRow('D', 1, 50)];
  const teams = mixed.slice().sort((x, y) => (x.team - y.team) || (turfRankValue(y) - turfRankValue(x)));
  assert.deepEqual(teams.map((p) => p.name), ['B', 'C', 'A', 'D']);
});

test('issue-438 adapter rewrites only the turf branch with an exact single connection', () => {
  assert.match(ADAPTED, /turfRankValue\(y\) - turfRankValue\(x\)/);
  assert.match(ADAPTED, /import \{ turfRankValue \} from '..\/..\/patches\/local-quality\/result-order\.mjs'/);
  assert.ok(!ADAPTED.includes('(y.turf - x.turf)'));
  // Boss damage-ranked branch and podiums are untouched.
  assert.ok(ADAPTED.includes("((y.damage || 0) - (x.damage || 0)) || ((y.turf || 0) - (x.turf || 0))"));
  assert.equal(adaptResultOrder('src/main.js', MENUS), MENUS);
  assert.throws(() => adaptResultOrder('src/ui/menus.js', 'no anchor'), /issue-438 patch conflict/);
  assert.throws(() => adaptResultOrder('src/ui/menus.js', ADAPTED), /issue-438 patch conflict/);
  assert.throws(() => adaptResultOrder('src/ui/menus.js', MENUS.replace(
    '      : all.slice().sort((x, y) => (x.team - y.team) || (y.turf - x.turf));', 'changed upstream anchor')),
    /issue-438 patch conflict/);
});
