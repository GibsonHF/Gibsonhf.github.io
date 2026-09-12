import http from 'node:http';
import { createHash } from 'node:crypto';
import { validatePush, parseKeys, maskKey } from './src/validate.js';
import { RoomState } from './src/room.js';

const PORT = Number(process.argv[2] || 8787);
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

const rooms = new Map();

function roomFor(key) {
    const id = createHash('sha256').update(key).digest('hex');
    if (!rooms.has(id)) {
        rooms.set(id, new RoomState());
    }
    return rooms.get(id);
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

function sendJson(res, body, status, headers) {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > limit) {
                tooLarge = true;
                chunks.length = 0;
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (tooLarge) {
                reject(Object.assign(new Error('Body too large'), { status: 413 }));
                return;
            }
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', reject);
    });
}

async function handlePush(req, res, headers) {
    let text;
    try {
        text = await readBody(req, MAX_BODY_BYTES);
    } catch (err) {
        return sendJson(res, { error: err.status === 413 ? 'Body too large' : 'Invalid body' }, err.status || 400, headers);
    }

    let body;
    try {
        body = JSON.parse(text);
    } catch {
        return sendJson(res, { error: 'Invalid JSON' }, 400, headers);
    }

    const result = validatePush(body);
    if (!result.ok) {
        return sendJson(res, { error: result.error }, 400, headers);
    }

    roomFor(result.key).upsert(result.player, Date.now());
    res.writeHead(204, headers);
    res.end();
}

function handlePlayers(url, res, headers) {
    const players = parseKeys(url.searchParams.get('keys')).flatMap(key =>
        roomFor(key).list(Date.now(), MAX_AGE_MS).map(player => ({ room: maskKey(key), ...player }))
    );
    sendJson(res, { players }, 200, headers);
}

const server = http.createServer((req, res) => {
    const headers = corsHeaders(req.headers.origin);
    try {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (url.pathname === '/push' && req.method === 'POST') {
            handlePush(req, res, headers).catch(() => sendJson(res, { error: 'Relay error' }, 500, headers));
            return;
        }
        if (url.pathname === '/players' && req.method === 'GET') {
            handlePlayers(url, res, headers);
            return;
        }
        sendJson(res, { error: 'Not found' }, 404, headers);
    } catch {
        sendJson(res, { error: 'Relay error' }, 500, headers);
    }
});

server.listen(PORT, () => {
    console.log(`Live players relay listening on http://0.0.0.0:${PORT}`);
});
