import { DurableObject } from 'cloudflare:workers';
import { validatePush, parseKeys, maskKey } from './validate.js';
import { RoomState } from './room.js';

const MAX_AGE_MS = 30000;
const MAX_BODY_BYTES = 1024;

const ALLOWED_ORIGINS = [
    'https://gibsonhf.github.io',
    'https://louis-dnb.github.io',
];

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin) {
    return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.state = new RoomState();
    }

    push(player) {
        this.state.upsert(player, Date.now());
    }

    list() {
        return this.state.list(Date.now(), MAX_AGE_MS);
    }
}

function corsHeaders(origin) {
    const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
    };
    if (origin && isAllowedOrigin(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
    }
    return headers;
}

function json(body, status, headers) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
    });
}

async function roomStub(env, key) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return env.ROOMS.get(env.ROOMS.idFromName(hex));
}

async function handlePush(request, env, headers) {
    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BODY_BYTES) {
        return json({ error: 'Body too large' }, 413, headers);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) {
        return json({ error: 'Body too large' }, 413, headers);
    }
    const text = new TextDecoder().decode(bytes);

    let body;
    try {
        body = JSON.parse(text);
    } catch {
        return json({ error: 'Invalid JSON' }, 400, headers);
    }

    const result = validatePush(body);
    if (!result.ok) {
        return json({ error: result.error }, 400, headers);
    }

    const room = await roomStub(env, result.key);
    await room.push(result.player);
    return new Response(null, { status: 204, headers });
}

async function handlePlayers(url, env, headers) {
    const keys = parseKeys(url.searchParams.get('keys'));
    const rooms = await Promise.all(keys.map(async key => {
        try {
            const room = await roomStub(env, key);
            const players = await room.list();
            return players.map(player => ({ room: maskKey(key), ...player }));
        } catch {
            return [];
        }
    }));
    return json({ players: rooms.flat() }, 200, headers);
}

export default {
    async fetch(request, env) {
        const headers = corsHeaders(request.headers.get('Origin'));
        try {
            if (request.method === 'OPTIONS') {
                return new Response(null, { status: 204, headers });
            }

            const url = new URL(request.url);
            if (url.pathname === '/push' && request.method === 'POST') {
                return await handlePush(request, env, headers);
            }
            if (url.pathname === '/players' && request.method === 'GET') {
                return await handlePlayers(url, env, headers);
            }
            return json({ error: 'Not found' }, 404, headers);
        } catch {
            return json({ error: 'Relay error' }, 500, headers);
        }
    },
};
