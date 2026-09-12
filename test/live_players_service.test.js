import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isValidKey, maskKey, generateKey, roomColor, normalizeRelayUrl, fetchPlayers,
} from '../js/services/live_players_service.js';

const KEY = 'a3f9c0de12345678abcdef0123456789';

test('isValidKey and maskKey', () => {
    assert.equal(isValidKey(KEY), true);
    assert.equal(isValidKey('A3F9c0de12345678abcdef0123456789'), false);
    assert.equal(isValidKey(''), false);
    assert.equal(maskKey(KEY), 'a3f9…6789');
});

test('generateKey produces distinct valid keys', () => {
    const a = generateKey();
    const b = generateKey();
    assert.equal(isValidKey(a), true);
    assert.equal(isValidKey(b), true);
    assert.notEqual(a, b);
});

test('roomColor is stable and differs between rooms', () => {
    assert.equal(roomColor('a3f9…6789'), roomColor('a3f9…6789'));
    assert.notEqual(roomColor('a3f9…6789'), roomColor('0000…0001'));
    assert.match(roomColor('x'), /^hsl\(\d+, 75%, 60%\)$/);
});

test('normalizeRelayUrl', () => {
    assert.equal(normalizeRelayUrl(' https://example.workers.dev/ '), 'https://example.workers.dev');
    assert.equal(normalizeRelayUrl('http://localhost:8787'), 'http://localhost:8787');
    assert.equal(normalizeRelayUrl('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787');
    assert.equal(normalizeRelayUrl('http://example.com'), null);
    assert.equal(normalizeRelayUrl('example.workers.dev'), null);
    assert.equal(normalizeRelayUrl(''), null);
    assert.equal(normalizeRelayUrl('https://@'), null);
    assert.equal(normalizeRelayUrl('https://:8080'), null);
    assert.equal(normalizeRelayUrl('https://example.workers.dev/relay/'), 'https://example.workers.dev/relay');
});

test('fetchPlayers builds the query and unwraps players', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
        calls.push(url);
        return { ok: true, json: async () => ({ players: [{ name: 'A' }] }) };
    };
    const players = await fetchPlayers('https://r.test', [KEY, KEY.replace('a', 'b')]);
    assert.deepEqual(players, [{ name: 'A' }]);
    assert.equal(calls[0], `https://r.test/players?keys=${KEY},${KEY.replace('a', 'b')}`);
});

test('fetchPlayers rejects on http error', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    await assert.rejects(fetchPlayers('https://r.test', [KEY]));
});
