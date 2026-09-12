export class RoomState {
    constructor() {
        this.players = new Map();
    }

    upsert(player, now) {
        this.players.set(player.name, { player, lastSeen: now });
    }

    list(now, maxAgeMs) {
        const result = [];
        for (const [name, entry] of this.players) {
            const ageMs = now - entry.lastSeen;
            if (ageMs > maxAgeMs) {
                this.players.delete(name);
                continue;
            }
            result.push({ ...entry.player, age: Math.round(ageMs / 1000) });
        }
        return result;
    }
}
