import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomState } from '../src/room.js';

const player = (name, x = 0) => ({ name, x, y: 0, plane: 0 });

test('list returns pushed players with age in seconds', () => {
    const room = new RoomState();
    room.upsert(player('A'), 1000);
    const listed = room.list(4000, 30000);
    assert.deepEqual(listed, [{ name: 'A', x: 0, y: 0, plane: 0, age: 3 }]);
});

test('upsert replaces state for the same name', () => {
    const room = new RoomState();
    room.upsert(player('A', 1), 1000);
    room.upsert(player('A', 2), 2000);
    const listed = room.list(2000, 30000);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].x, 2);
    assert.equal(listed[0].age, 0);
});

test('list drops players older than maxAge', () => {
    const room = new RoomState();
    room.upsert(player('old'), 0);
    room.upsert(player('new'), 20000);
    const listed = room.list(31000, 30000);
    assert.deepEqual(listed.map(p => p.name), ['new']);
    assert.equal(room.list(60000, 30000).length, 0);
});
