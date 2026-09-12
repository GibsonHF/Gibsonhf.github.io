const [relayUrl, key] = process.argv.slice(2);

if (!relayUrl || !key) {
    console.error('usage: node fake_players.mjs <relay-url> <key>');
    process.exit(1);
}

const START = Date.now();

function tick() {
    return (Date.now() - START) / 1000;
}

const players = [
    () => {
        const angle = tick() / 6;
        return {
            name: 'Alpha', plane: 0,
            x: Math.round(3200 + Math.cos(angle) * 12),
            y: Math.round(3200 + Math.sin(angle) * 12),
            hp: 990, maxHp: 990, prayer: 800, maxPrayer: 990, adrenaline: Math.round(tick() * 5) % 101,
            summoning: 600, combatLevel: 138,
        };
    },
    () => ({
        name: 'Bravo', plane: 0,
        x: 3220 + (Math.round(tick()) % 40), y: 3180,
        hp: Math.max(0, 990 - Math.round(tick() * 10) % 1000), maxHp: 990,
        prayer: 100, maxPrayer: 990, adrenaline: 100, summoning: 0, combatLevel: 120,
        target: 'Goblin',
    }),
    () => ({
        name: 'Charlie', plane: 1, x: 3210, y: 3210,
        hp: 500, maxHp: 800, prayer: 0, maxPrayer: 500, adrenaline: 0, summoning: 300, combatLevel: 90,
    }),
];

async function push(player) {
    const res = await fetch(`${relayUrl.replace(/\/$/, '')}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, ...player }),
    });
    if (res.status !== 204) {
        console.error(player.name, res.status, await res.text());
    }
}

setInterval(() => {
    Promise.all(players.map(build => push(build()))).catch(err => console.error(err.message));
}, 2000);

console.log(`pushing ${players.length} players to ${relayUrl}`);
