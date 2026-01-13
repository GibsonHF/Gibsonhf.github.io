'use strict';

import { Position } from '../model/Position.js';
import { REGION_WIDTH, REGION_HEIGHT } from '../model/Region.js';

// Direction offsets for 8-directional movement
const DIRECTIONS = [
    { dx: 0, dy: 1 },   // North
    { dx: 1, dy: 0 },   // East
    { dx: 0, dy: -1 },  // South
    { dx: -1, dy: 0 },  // West
    { dx: 1, dy: 1 },   // Northeast
    { dx: 1, dy: -1 },  // Southeast
    { dx: -1, dy: -1 }, // Southwest
    { dx: -1, dy: 1 },  // Northwest
];

// Build tile lookup Set from walkable control's plane cache
function buildTileSet(planeCache, minX, maxX, minY, maxY) {
    const tileSet = new Set();
    const regionStride = 256;

    const startRegionX = Math.floor(minX / REGION_WIDTH);
    const endRegionX = Math.floor(maxX / REGION_WIDTH);
    const startRegionY = Math.floor(minY / REGION_HEIGHT);
    const endRegionY = Math.floor(maxY / REGION_HEIGHT);

    console.log(`Building tile set: regions X[${startRegionX}-${endRegionX}] Y[${startRegionY}-${endRegionY}]`);
    console.log(`PlaneCache has ${planeCache.size} regions`);

    for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
        for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
            const regionId = (regionX * regionStride) + regionY;
            const entry = planeCache.get(regionId);
            if (!entry) continue;

            const xs = entry.xs;
            const ys = entry.ys;
            const count = entry.count;

            for (let i = 0; i < count; i++) {
                const x = xs[i];
                const y = ys[i];
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    tileSet.add(`${x},${y}`);
                }
            }
        }
    }
    console.log(`Tile set built with ${tileSet.size} tiles`);
    return tileSet;
}

// Simple A* pathfinding
function findPath(tileSet, startX, startY, endX, endY) {
    const startKey = `${startX},${startY}`;
    const endKey = `${endX},${endY}`;

    console.log(`Finding path from ${startKey} to ${endKey}`);

    if (!tileSet.has(startKey)) {
        console.log('Start not walkable:', startX, startY);
        return null;
    }
    if (!tileSet.has(endKey)) {
        console.log('End not walkable:', endX, endY);
        return null;
    }

    const openList = [{ x: startX, y: startY, g: 0, f: 0, key: startKey }];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(startKey, 0);

    const heuristic = (x, y) => Math.max(Math.abs(endX - x), Math.abs(endY - y));

    let iterations = 0;
    const maxIterations = 50000;

    while (openList.length > 0 && iterations < maxIterations) {
        iterations++;

        // Find lowest f score
        let bestIdx = 0;
        for (let i = 1; i < openList.length; i++) {
            if (openList[i].f < openList[bestIdx].f) bestIdx = i;
        }
        const current = openList.splice(bestIdx, 1)[0];

        if (current.key === endKey) {
            // Reconstruct path
            const path = [{ x: current.x, y: current.y }];
            let key = current.key;
            while (cameFrom.has(key)) {
                const prev = cameFrom.get(key);
                path.unshift(prev);
                key = `${prev.x},${prev.y}`;
            }
            console.log(`Path found: ${path.length} tiles in ${iterations} iterations`);
            return path;
        }

        if (closedSet.has(current.key)) continue;
        closedSet.add(current.key);

        for (const dir of DIRECTIONS) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;
            const nKey = `${nx},${ny}`;

            if (closedSet.has(nKey)) continue;
            if (!tileSet.has(nKey)) continue;

            // Diagonal movement requires adjacent tiles to be walkable
            if (dir.dx !== 0 && dir.dy !== 0) {
                if (!tileSet.has(`${current.x + dir.dx},${current.y}`)) continue;
                if (!tileSet.has(`${current.x},${current.y + dir.dy}`)) continue;
            }

            const tentativeG = current.g + 1;

            if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
                cameFrom.set(nKey, { x: current.x, y: current.y });
                gScore.set(nKey, tentativeG);
                openList.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + heuristic(nx, ny), key: nKey });
            }
        }
    }

    console.log(`No path found after ${iterations} iterations`);
    return null;
}

export const DistanceToolControl = L.Control.extend({
    options: {
        position: 'topleft',
    },

    initialize: function (options) {
        L.setOptions(this, options);
        this._walkableControl = options.walkableControl;
        this._measuring = false;
        this._startPoint = null;
        this._endPoint = null;
        this._pathLayer = null;
        this._markersLayer = null;
        this._button = null;
    },

    onAdd: function (map) {
        this._map = map;

        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

        const button = L.DomUtil.create('a', 'leaflet-control-custom distance-tool-btn', container);
        button.innerHTML = '<i class="fa fa-arrows-h" aria-hidden="true"></i>';
        button.title = 'Distance Tool (M)';
        button.href = '#';
        this._button = button;

        L.DomEvent.on(button, 'click', (e) => {
            L.DomEvent.preventDefault(e);
            this.toggle();
        });

        L.DomEvent.disableClickPropagation(container);

        this._pathLayer = L.layerGroup().addTo(map);
        this._markersLayer = L.layerGroup().addTo(map);

        return container;
    },

    toggle: function () {
        if (this._measuring) {
            this._stopMeasuring();
        } else {
            this._startMeasuring();
        }
    },

    isEnabled: function () {
        return this._measuring;
    },

    _startMeasuring: function () {
        this._measuring = true;
        this._clearPath();
        this._button.classList.add('active');
        this._map.getContainer().style.cursor = 'crosshair';
        this._map.on('click', this._onMapClick, this);
        this._showToast('Click to set start point');
    },

    _stopMeasuring: function () {
        this._measuring = false;
        this._button.classList.remove('active');
        this._map.getContainer().style.cursor = '';
        this._map.off('click', this._onMapClick, this);
        this._startPoint = null;
        this._endPoint = null;
    },

    _onMapClick: function (e) {
        const pos = Position.fromLatLng(e.latlng, this._map.getPlane());

        if (!this._startPoint) {
            this._startPoint = pos;
            this._addMarker(pos, 'start');
            this._showToast('Click to set end point');
        } else {
            this._endPoint = pos;
            this._addMarker(pos, 'end');
            this._calculatePath();
        }
    },

    _calculatePath: function () {
        // Save points before stopping (stopMeasuring clears them)
        const startPoint = this._startPoint;
        const endPoint = this._endPoint;
        const plane = this._map.getPlane();

        this._stopMeasuring();

        // Use already-loaded walkable tiles cache
        const planeCache = this._walkableControl?._planeCache?.get(plane);

        if (!planeCache || planeCache.size === 0) {
            this._showToast('Enable "Show Walkable" first', 3000);
            this._drawStraightLineFromPoints(startPoint, endPoint);
            return;
        }

        const margin = 100;
        const minX = Math.min(startPoint.x, endPoint.x) - margin;
        const maxX = Math.max(startPoint.x, endPoint.x) + margin;
        const minY = Math.min(startPoint.y, endPoint.y) - margin;
        const maxY = Math.max(startPoint.y, endPoint.y) + margin;

        // Build tile set from cached data
        const tileSet = buildTileSet(planeCache, minX, maxX, minY, maxY);

        if (tileSet.size === 0) {
            this._showToast('No walkable tiles in range', 3000);
            this._drawStraightLineFromPoints(startPoint, endPoint);
            return;
        }

        // Find path
        const path = findPath(
            tileSet,
            startPoint.x, startPoint.y,
            endPoint.x, endPoint.y
        );

        if (path) {
            this._drawPath(path);
            const distance = path.length - 1;
            this._showToast(`Distance: ${distance} tiles`, 5000);
            this._showDistancePopup(path, distance);
        } else {
            this._showToast('No walkable path found', 3000);
            this._drawStraightLineFromPoints(startPoint, endPoint);
        }
    },

    _drawStraightLineFromPoints: function (startPoint, endPoint) {
        const latLngs = [
            L.latLng(startPoint.y + 0.5, startPoint.x + 0.5),
            L.latLng(endPoint.y + 0.5, endPoint.x + 0.5),
        ];
        const polyline = L.polyline(latLngs, {
            color: '#e74c3c',
            weight: 2,
            opacity: 0.7,
            dashArray: '5, 10',
        });
        this._pathLayer.addLayer(polyline);

        // Show straight-line Chebyshev distance
        const distance = Math.max(
            Math.abs(endPoint.x - startPoint.x),
            Math.abs(endPoint.y - startPoint.y)
        );
        this._showDistancePopup([startPoint, endPoint], distance);
    },

    _drawPath: function (path) {
        const latLngs = path.map(p => L.latLng(p.y + 0.5, p.x + 0.5));

        const polyline = L.polyline(latLngs, {
            color: '#39c5cf',
            weight: 3,
            opacity: 0.9,
            dashArray: null,
        });

        this._pathLayer.addLayer(polyline);
    },

    _showDistancePopup: function (path, distance) {
        const midIndex = Math.floor(path.length / 2);
        const midPoint = path[midIndex];

        const popup = L.popup({
            closeButton: true,
            autoClose: false,
            closeOnEscapeKey: true,
            className: 'distance-popup-container',
        })
            .setLatLng(L.latLng(midPoint.y + 0.5, midPoint.x + 0.5))
            .setContent(`
                <div class="distance-popup">
                    <div class="distance-popup-value">${distance}</div>
                    <div class="distance-popup-label">tiles</div>
                </div>
            `)
            .openOn(this._map);

        // Close popup when clearing
        this._distancePopup = popup;
    },

    _addMarker: function (pos, type) {
        const color = type === 'start' ? '#2ecc71' : '#e74c3c';
        const marker = L.circleMarker(L.latLng(pos.y + 0.5, pos.x + 0.5), {
            radius: 8,
            color: color,
            fillColor: color,
            fillOpacity: 0.8,
            weight: 2,
        });
        this._markersLayer.addLayer(marker);
    },

    _clearPath: function () {
        this._pathLayer.clearLayers();
        this._markersLayer.clearLayers();
        if (this._distancePopup) {
            this._map.closePopup(this._distancePopup);
            this._distancePopup = null;
        }
    },

    _showToast: function (message, duration = 2000) {
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-notification success';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 200);
        }, duration);
    },
});
