import test from 'node:test';
import assert from 'node:assert/strict';
import {monthCells, weekStartOf, weekdayOrder} from '../../src/overviews/calendar_month/model.js';

test('April 2026 on a Monday start: 30 31 | 1 .. 30 | 1 .. 10, today is the 1st', () => {
  const cells = monthCells({year: 2026, month: 4, day: 1}, 1);
  assert.equal(cells.length, 42);
  assert.deepEqual(
    cells.slice(0, 4).map((c) => c.day),
    [30, 31, 1, 2]
  );
  assert.deepEqual(cells.filter((c) => c.out).length, 12);
  assert.equal(cells[2].today, true);
  assert.equal(cells.filter((c) => c.today).length, 1);
  assert.equal(cells.at(-1).day, 10);
});

test('a Sunday start shifts the first row', () => {
  const cells = monthCells({year: 2026, month: 4, day: 15}, 0);
  assert.deepEqual(
    cells.slice(0, 4).map((c) => c.day),
    [29, 30, 31, 1]
  );
});

test('January and December neighbours wrap the year', () => {
  assert.equal(monthCells({year: 2026, month: 1, day: 1}, 1)[0].out, true);
  assert.equal(monthCells({year: 2026, month: 12, day: 31}, 1).at(-1).out, true);
});

test('week start resolution', () => {
  assert.equal(weekStartOf('auto', 'sunday'), 0);
  assert.equal(weekStartOf('auto', 'language'), 1);
  assert.equal(weekStartOf('saturday', 'monday'), 6);
  assert.deepEqual(weekdayOrder(1), [1, 2, 3, 4, 5, 6, 0]);
});
