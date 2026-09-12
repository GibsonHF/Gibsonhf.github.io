const KEY_PATTERN = /^[0-9a-f]{32}$/;
const MAX_KEYS = 10;
const MAX_NAME = 20;
const MAX_TARGET = 40;

const REQUIRED_INTS = {
    x: [0, 16384],
    y: [0, 16384],
    plane: [0, 3],
};

const OPTIONAL_INTS = {
    hp: [0, 100000],
    maxHp: [0, 100000],
    prayer: [0, 10000],
    maxPrayer: [0, 10000],
    adrenaline: [0, 100],
    summoning: [0, 10000],
    combatLevel: [0, 200],
};

export function isValidKey(key) {
    return typeof key === 'string' && KEY_PATTERN.test(key);
}

export function maskKey(key) {
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function parseKeys(param) {
    if (typeof param !== 'string') return [];
    const keys = [];
    for (const raw of param.split(',')) {
        const key = raw.trim();
        if (isValidKey(key) && !keys.includes(key)) {
            keys.push(key);
        }
    }
    return keys.slice(0, MAX_KEYS);
}

function intInRange(value, [min, max]) {
    return Number.isInteger(value) && value >= min && value <= max;
}

export function validatePush(body) {
    if (!body || typeof body !== 'object') {
        return { ok: false, error: 'Body must be a JSON object' };
    }
    if (!isValidKey(body.key)) {
        return { ok: false, error: 'Invalid key' };
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > MAX_NAME) {
        return { ok: false, error: 'Invalid name' };
    }

    const player = { name };

    for (const [field, range] of Object.entries(REQUIRED_INTS)) {
        if (!intInRange(body[field], range)) {
            return { ok: false, error: `Invalid ${field}` };
        }
        player[field] = body[field];
    }

    for (const [field, range] of Object.entries(OPTIONAL_INTS)) {
        if (body[field] === undefined) continue;
        if (!intInRange(body[field], range)) {
            return { ok: false, error: `Invalid ${field}` };
        }
        player[field] = body[field];
    }

    if (body.target !== undefined) {
        if (typeof body.target !== 'string' || body.target.length > MAX_TARGET) {
            return { ok: false, error: 'Invalid target' };
        }
        player.target = body.target;
    }

    return { ok: true, key: body.key, player };
}
