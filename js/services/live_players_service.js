'use strict';

const KEY_PATTERN = /^[0-9a-f]{32}$/;

export function isValidKey(key) {
    return typeof key === 'string' && KEY_PATTERN.test(key);
}

export function maskKey(key) {
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function generateKey() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function roomColor(room) {
    let hash = 5381;
    for (let i = 0; i < room.length; i++) {
        hash = ((hash << 5) + hash + room.charCodeAt(i)) >>> 0;
    }
    return `hsl(${hash % 360}, 75%, 60%)`;
}

export function normalizeRelayUrl(input) {
    let url;
    try {
        url = new URL(String(input || '').trim());
    } catch {
        return null;
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
        return null;
    }
    if (!url.hostname) {
        return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export async function fetchPlayers(relayUrl, keys) {
    const res = await fetch(`${relayUrl}/players?keys=${keys.join(',')}`);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data.players) ? data.players : [];
}
