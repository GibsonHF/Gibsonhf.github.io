'use strict';

import {Position} from './Position.js';

export class PolyArea {
    constructor() {
        this.positions = [];
        this.polygon = undefined;
        this.featureGroup = new L.FeatureGroup();
    }

    add(position) {
        this.positions.push(position);
        this.featureGroup.removeLayer(this.polygon);
        this.polygon = this.toLeaflet();
        this.featureGroup.addLayer(this.polygon);
    }

    addAll(positions) {
        for (let i = 0; i < positions.length; i ++) {
            this.positions.push(positions[i]);
        }
        this.featureGroup.removeLayer(this.polygon);
        this.polygon = this.toLeaflet();
        this.featureGroup.addLayer(this.polygon);
    }

    removeLast() {
        if (this.positions.length > 0) {
            this.positions.pop();
            this.featureGroup.removeLayer(this.polygon);
        }

        if (this.positions.length === 0) {
            this.polygon = undefined;
        } else {
            this.polygon = this.toLeaflet();
            this.featureGroup.addLayer(this.polygon);
        }
    }

    removeAll() {
        this.positions = [];
        this.featureGroup.removeLayer(this.polygon);
        this.polygon = undefined;
    }

    isEmpty() {
        return this.positions.length === 0;
    }

    toLeaflet() {
        const rings = this.toTileOutlines();
        const latLngs = [];

        for (let i = 0; i < rings.length; i++) {
            const ring = [];
            for (let j = 0; j < rings[i].length; j++) {
                ring.push(Position.toLatLng(rings[i][j][0], rings[i][j][1]));
            }
            latLngs.push(ring);
        }

        return L.polygon(
            latLngs, {
                color: "#33b5e5",
                weight: 1,
                interactive: false
            }
        );
    }

    toTileOutlines() {
        return traceOutlines(this.coveredTiles());
    }

    coveredTiles() {
        const tiles = new Set();

        if (this.positions.length === 0) {
            return tiles;
        }

        if (this.positions.length === 1) {
            tiles.add(tileKey(this.positions[0].x, this.positions[0].y));
            return tiles;
        }

        for (let i = 0; i < this.positions.length; i++) {
            addEdgeTiles(tiles, this.positions[i], this.positions[(i + 1) % this.positions.length]);
        }

        if (this.positions.length > 2) {
            addInteriorTiles(tiles, this.positions);
        }

        return tiles;
    }

    getName() {
        return "Area";
    }
}

const KEY_ORIGIN = 100000;
const KEY_STRIDE = 1000000;

function tileKey(x, y) {
    return (x + KEY_ORIGIN) * KEY_STRIDE + (y + KEY_ORIGIN);
}

function keyX(key) {
    return Math.floor(key / KEY_STRIDE) - KEY_ORIGIN;
}

function keyY(key) {
    return (key % KEY_STRIDE) - KEY_ORIGIN;
}

function addEdgeTiles(tiles, from, to) {
    const stepX = Math.sign(to.x - from.x);
    const stepY = Math.sign(to.y - from.y);
    const spanX = stepX === 0 ? Infinity : 1 / Math.abs(to.x - from.x);
    const spanY = stepY === 0 ? Infinity : 1 / Math.abs(to.y - from.y);

    let x = from.x;
    let y = from.y;
    let nextX = spanX / 2;
    let nextY = spanY / 2;

    tiles.add(tileKey(x, y));

    while (x !== to.x || y !== to.y) {
        if (nextX < nextY) {
            nextX += spanX;
            x += stepX;
        } else if (nextY < nextX) {
            nextY += spanY;
            y += stepY;
        } else {
            nextX += spanX;
            nextY += spanY;
            x += stepX;
            y += stepY;
        }
        tiles.add(tileKey(x, y));
    }
}

function addInteriorTiles(tiles, positions) {
    let minX = positions[0].x;
    let maxX = positions[0].x;
    let minY = positions[0].y;
    let maxY = positions[0].y;

    for (let i = 1; i < positions.length; i++) {
        minX = Math.min(minX, positions[i].x);
        maxX = Math.max(maxX, positions[i].x);
        minY = Math.min(minY, positions[i].y);
        maxY = Math.max(maxY, positions[i].y);
    }

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (containsTileCentre(positions, x, y)) {
                tiles.add(tileKey(x, y));
            }
        }
    }
}

function containsTileCentre(positions, x, y) {
    const pointX = x + 0.5;
    const pointY = y + 0.5;
    let inside = false;

    for (let i = 0, j = positions.length - 1; i < positions.length; j = i++) {
        const startX = positions[j].x + 0.5;
        const startY = positions[j].y + 0.5;
        const endX = positions[i].x + 0.5;
        const endY = positions[i].y + 0.5;

        if ((endY > pointY) !== (startY > pointY) &&
            pointX < ((startX - endX) * (pointY - endY)) / (startY - endY) + endX) {
            inside = !inside;
        }
    }

    return inside;
}

function traceOutlines(tiles) {
    const borders = new Map();

    for (const key of tiles) {
        const x = keyX(key);
        const y = keyY(key);

        if (!tiles.has(tileKey(x, y - 1))) {
            addBorder(borders, x, y, x + 1, y);
        }
        if (!tiles.has(tileKey(x + 1, y))) {
            addBorder(borders, x + 1, y, x + 1, y + 1);
        }
        if (!tiles.has(tileKey(x, y + 1))) {
            addBorder(borders, x + 1, y + 1, x, y + 1);
        }
        if (!tiles.has(tileKey(x - 1, y))) {
            addBorder(borders, x, y + 1, x, y);
        }
    }

    const rings = [];

    for (const [key, corners] of borders) {
        while (corners.length > 0) {
            rings.push(removeCollinear(followRing(borders, key)));
        }
    }

    return rings;
}

function addBorder(borders, fromX, fromY, toX, toY) {
    const key = tileKey(fromX, fromY);

    if (!borders.has(key)) {
        borders.set(key, []);
    }

    borders.get(key).push([toX, toY]);
}

function followRing(borders, startKey) {
    const ring = [];
    let key = startKey;
    let heading = undefined;

    while (true) {
        const corners = borders.get(key);

        if (corners === undefined || corners.length === 0) {
            break;
        }

        const x = keyX(key);
        const y = keyY(key);
        const next = corners.splice(pickCorner(corners, x, y, heading), 1)[0];

        ring.push([x, y]);
        heading = [next[0] - x, next[1] - y];
        key = tileKey(next[0], next[1]);

        if (key === startKey) {
            break;
        }
    }

    return ring;
}

function pickCorner(corners, x, y, heading) {
    if (heading === undefined || corners.length === 1) {
        return 0;
    }

    let pick = 0;
    let bestTurn = -Infinity;

    for (let i = 0; i < corners.length; i++) {
        const turn = rankTurn(heading, corners[i][0] - x, corners[i][1] - y);

        if (turn > bestTurn) {
            pick = i;
            bestTurn = turn;
        }
    }

    return pick;
}

function rankTurn(heading, dx, dy) {
    const cross = heading[0] * dy - heading[1] * dx;

    if (cross > 0) {
        return 2;
    }
    if (cross < 0) {
        return 0;
    }

    return heading[0] * dx + heading[1] * dy > 0 ? 1 : -1;
}

function removeCollinear(ring) {
    const corners = [];

    for (let i = 0; i < ring.length; i++) {
        const previous = ring[(i + ring.length - 1) % ring.length];
        const current = ring[i];
        const next = ring[(i + 1) % ring.length];
        const cross = (current[0] - previous[0]) * (next[1] - current[1]) -
            (current[1] - previous[1]) * (next[0] - current[0]);

        if (cross !== 0) {
            corners.push(current);
        }
    }

    return corners;
}
