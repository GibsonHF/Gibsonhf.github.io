import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidKey, maskKey, parseKeys, validatePush } from '../src/validate.js';

const KEY = 'a3f9c0de12345678abcdef0123456789';

test('isValidKey accepts 32 lowercase hex', () => {
    assert.equal(isValidKey(KEY), true);
    assert.equal(isValidKey(KEY.toUpperCase()), false);
    assert.equal(isValidKey(KEY.slice(1)), false);
    assert.equal(isValidKey(undefined), false);
});

test('maskKey keeps first and last four chars', () => {
    assert.equal(maskKey(KEY), 'a3f9…6789');
});

test('parseKeys dedupes, drops invalid, caps at ten', () => {
    const extra = Array.from({ length: 12 }, (_, i) => i.toString(16).padStart(32, '0'));
    assert.deepEqual(parseKeys(`${KEY},${KEY},nope`), [KEY]);
    assert.equal(parseKeys(extra.join(',')).length, 10);
    assert.deepEqual(parseKeys(''), []);
    assert.deepEqual(parseKeys(null), []);
});

test('validatePush accepts a minimal body', () => {
    const result = validatePush({ key: KEY, name: ' Gibson ', x: 3200, y: 3200, plane: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.key, KEY);
    assert.deepEqual(result.player, { name: 'Gibson', x: 3200, y: 3200, plane: 0 });
});

test('validatePush keeps optional fields and drops unknown ones', () => {
    const result = validatePush({
        key: KEY, name: 'G', x: 1, y: 2, plane: 3,
        hp: 990, maxHp: 990, prayer: 900, maxPrayer: 990, adrenaline: 45,
        summoning: 600, combatLevel: 138, target: 'Vorkath', evil: 'x',
    });
    assert.equal(result.ok, true);
    assert.equal(result.player.evil, undefined);
    assert.equal(result.player.combatLevel, 138);
    assert.equal(result.player.target, 'Vorkath');
});

test('validatePush rejects bad key, name, and ranges', () => {
    assert.equal(validatePush({ key: 'x', name: 'G', x: 1, y: 1, plane: 0 }).ok, false);
    assert.equal(validatePush({ key: KEY, name: '', x: 1, y: 1, plane: 0 }).ok, false);
    assert.equal(validatePush({ key: KEY, name: 'a'.repeat(21), x: 1, y: 1, plane: 0 }).ok, false);
    assert.equal(validatePush({ key: KEY, name: 'G', x: -1, y: 1, plane: 0 }).ok, false);
    assert.equal(validatePush({ key: KEY, name: 'G', x: 1, y: 1, plane: 4 }).ok, false);
    assert.equal(validatePush({ key: KEY, name: 'G', x: 1, y: 1, plane: 0, adrenaline: 101 }).ok, false);
    assert.equal(validatePush({ key: KEY, name: 'G', x: 1, y: 1, plane: 0, target: 'a'.repeat(41) }).ok, false);
    assert.equal(validatePush({ key: KEY, name: 'G', x: '3', y: 1, plane: 0 }).ok, false);
    assert.equal(validatePush(null).ok, false);
});
