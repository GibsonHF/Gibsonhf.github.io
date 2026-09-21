'use strict';

import { CanvasLayer } from '../external/L.CanvasLayer.js';
import { REGION_WIDTH, REGION_HEIGHT } from '../model/Region.js';

const MIN_ZOOM_FOR_TILES = -1;
const DEFAULT_TILE_LIMIT = 100000;
const MIN_TILE_LIMIT = 10000;
const MAX_TILE_LIMIT = 500000;

// Database loading - only loads if SQL.js is available
let dbPromise = null;

export function loadReachableDb(dbPath, sqlJsBaseUrl) {
    if (dbPromise) {
        return dbPromise;
    }

    if (!window.initSqlJs) {
        return Promise.reject(new Error('SQL.js not loaded'));
    }

    dbPromise = window.initSqlJs({
        locateFile: (file) => `${sqlJsBaseUrl}${file}`,
    }).then((SQL) => {
        return fetch(dbPath)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Database not available (${response.status})`);
                }
                return response.arrayBuffer();
            })
            .then((buffer) => new SQL.Database(new Uint8Array(buffer)));
    });

    return dbPromise;
}

function packColor(cssColor) {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext('2d');
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

const WalkableTilesCanvas = CanvasLayer.extend({
    initialize: function (options) {
        CanvasLayer.prototype.initialize.call(this, options);
        this._tiles = null;
        this._tileCount = 0;
        this._walkableColor = packColor(options.walkableColor || 'rgba(46, 204, 113, 0.55)');
        this._visible = false;
    },

    setTiles: function (tilesFloat32, count) {
        this._tiles = tilesFloat32;
        this._tileCount = count;
        this.needRedraw();
    },

    setVisibility: function (visible) {
        this._visible = visible;
        this.needRedraw();
    },

    clear: function () {
        this._tiles = null;
        this._tileCount = 0;
        this.needRedraw();
    },

    onDrawLayer: function (info) {
        const ctx = info.canvas.getContext('2d');
        const width = info.canvas.width;
        const height = info.canvas.height;
        ctx.clearRect(0, 0, width, height);

        if (!this._visible || !this._tiles || this._tileCount === 0) {
            return;
        }

        const map = info.layer._map;
        const zoom = map.getZoom();

        if (zoom < MIN_ZOOM_FOR_TILES) {
            return;
        }

        const pixelOrigin = map.getPixelOrigin();
        const originPoint = map.layerPointToContainerPoint(map.project(L.latLng(0, 0)).subtract(pixelOrigin));
        const tilePoint = map.layerPointToContainerPoint(map.project(L.latLng(1, 1)).subtract(pixelOrigin));
        const tileWidth = Math.abs(tilePoint.x - originPoint.x);
        const tileHeight = Math.abs(tilePoint.y - originPoint.y);

        if (tileWidth < 0.5 || tileHeight < 0.5) {
            return;
        }

        const image = ctx.createImageData(width, height);
        const pixels = new Uint32Array(image.data.buffer);
        const color = this._walkableColor;
        const tiles = this._tiles;
        const count = this._tileCount;
        const originX = originPoint.x;
        const originY = originPoint.y;

        for (let i = 0; i < count; i++) {
            const x = tiles[i * 2];
            const y = tiles[i * 2 + 1];
            const left = originX + x * tileWidth;
            const top = originY - (y + 1) * tileHeight;
            const startX = Math.round(left);
            const startY = Math.round(top);
            const x0 = Math.max(0, startX);
            const x1 = Math.min(width, Math.max(startX + 1, Math.round(left + tileWidth)));
            const y0 = Math.max(0, startY);
            const y1 = Math.min(height, Math.max(startY + 1, Math.round(top + tileHeight)));

            for (let row = y0; row < y1; row++) {
                pixels.fill(color, row * width + x0, row * width + x1);
            }
        }

        ctx.putImageData(image, 0, 0);
    },
});

export const WalkableTilesControl = L.Control.extend({
    options: {
        position: 'topleft',
        dbPath: '/walkable_tiles.db',
        sqlJsBaseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/'
    },

    onAdd: function (map) {
        map.createPane('walkable-tiles');
        map.getPane('walkable-tiles').style.display = 'none';

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._canvasLayer = new WalkableTilesCanvas({ pane: 'walkable-tiles' });
        map.addLayer(this._canvasLayer);

        this._enabled = false;
        this._planeCache = new Map();
        this._planeLoading = new Map();
        this._walkableEnabled = false;
        this._refreshTimeout = null;
        this._tileLimit = DEFAULT_TILE_LIMIT;
        this._dbAvailable = null;

        map.on('moveend planechange mapidchange', () => {
            if (this._enabled) {
                this._debouncedRefresh();
            }
        }, this);

        return this._container;
    },

    isEnabled: function () {
        return this._walkableEnabled;
    },

    setEnabled: function (enabled) {
        this._walkableEnabled = enabled;
        this._updateVisibility();
    },

    toggle: function () {
        this.setEnabled(!this._walkableEnabled);
    },

    getTileLimit: function () {
        return this._tileLimit;
    },

    setTileLimit: function (limit) {
        const newLimit = Math.max(MIN_TILE_LIMIT, Math.min(MAX_TILE_LIMIT, limit));
        if (this._tileLimit !== newLimit) {
            this._tileLimit = newLimit;
            if (this._walkableEnabled) {
                this._refreshTiles();
            }
        }
    },

    getMinTileLimit: function () {
        return MIN_TILE_LIMIT;
    },

    getMaxTileLimit: function () {
        return MAX_TILE_LIMIT;
    },

    getDatabase: function () {
        return loadReachableDb(this.options.dbPath, this.options.sqlJsBaseUrl);
    },

    getPlaneCache: function (plane) {
        return this._ensurePlaneCache(plane);
    },

    getStatus: function () {
        return this._status || '';
    },

    onStatusChange: null,

    _setStatus: function (message) {
        this._status = message || '';
        if (this.onStatusChange) {
            this.onStatusChange(this._status);
        }
    },

    _debouncedRefresh: function () {
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
        }
        this._refreshTimeout = setTimeout(() => {
            this._refreshTiles();
            this._refreshTimeout = null;
        }, 50);
    },

    _updateVisibility: function () {
        if (this._walkableEnabled) {
            if (this._dbAvailable === false) {
                this._setStatus('Database unavailable');
                return;
            }

            if (!this._enabled) {
                this._enabled = true;
                this._map.getPane('walkable-tiles').style.display = '';
            }
            this._canvasLayer.setVisibility(true);
            this._refreshTiles();
        } else {
            this._enabled = false;
            this._map.getPane('walkable-tiles').style.display = 'none';
            this._canvasLayer.clear();
            this._canvasLayer.setVisibility(false);
            this._setStatus('');
        }
    },

    _refreshTiles: function () {
        if (!this._walkableEnabled) {
            this._canvasLayer.setTiles(null, 0);
            this._setStatus('');
            return;
        }

        const map = this._map;
        const zoom = map.getZoom();

        if (zoom < MIN_ZOOM_FOR_TILES) {
            this._canvasLayer.setTiles(null, 0);
            this._setStatus('Zoom in to see tiles');
            return;
        }

        const bounds = map.getBounds();
        const plane = map.getPlane();
        const center = bounds.getCenter();

        const minX = Math.floor(bounds.getWest());
        const maxX = Math.ceil(bounds.getEast());
        const minY = Math.floor(bounds.getSouth());
        const maxY = Math.ceil(bounds.getNorth());

        this._setStatus('Loading...');

        this._ensurePlaneCache(plane)
            .then((planeCache) => {
                const regionIds = this._getRegionIdsInBoundsSortedByCenter(minX, maxX, minY, maxY, center.lng, center.lat);
                const { tiles, count, total } = this._collectTilesCentered(planeCache, regionIds, minX, maxX, minY, maxY, center.lng, center.lat);
                this._canvasLayer.setTiles(tiles, count);
                if (count < total) {
                    this._setStatus(`${count.toLocaleString()} / ${total.toLocaleString()} tiles`);
                } else {
                    this._setStatus(`${count.toLocaleString()} tiles`);
                }
            })
            .catch((error) => {
                console.error('Failed to load reachable tiles', error);
                this._dbAvailable = false;
                this._setStatus('Database unavailable');
            });
    },

    _ensurePlaneCache: function (plane) {
        if (this._planeCache.has(plane)) {
            return Promise.resolve(this._planeCache.get(plane));
        }

        if (this._planeLoading.has(plane)) {
            return this._planeLoading.get(plane);
        }

        const loading = loadReachableDb(this.options.dbPath, this.options.sqlJsBaseUrl).then((db) => {
            this._dbAvailable = true;
            const regionMap = new Map();
            const stmt = db.prepare('SELECT x, y, RegionID FROM tiles WHERE plane = ?');
            stmt.bind([plane]);

            while (stmt.step()) {
                const row = stmt.get();
                const regionId = row[2];

                let entry = regionMap.get(regionId);
                if (!entry) {
                    entry = { xs: [], ys: [] };
                    regionMap.set(regionId, entry);
                }
                entry.xs.push(row[0]);
                entry.ys.push(row[1]);
            }
            stmt.free();

            for (const [regionId, entry] of regionMap) {
                regionMap.set(regionId, {
                    xs: new Int16Array(entry.xs),
                    ys: new Int16Array(entry.ys),
                    count: entry.xs.length,
                });
            }

            this._planeCache.set(plane, regionMap);
            return regionMap;
        }).finally(() => {
            this._planeLoading.delete(plane);
        });

        this._planeLoading.set(plane, loading);
        return loading;
    },

    _getRegionIdsInBoundsSortedByCenter: function (minX, maxX, minY, maxY, centerX, centerY) {
        const regions = [];
        const regionStride = 256;
        const startRegionX = Math.floor(minX / REGION_WIDTH);
        const endRegionX = Math.floor(maxX / REGION_WIDTH);
        const startRegionY = Math.floor(minY / REGION_HEIGHT);
        const endRegionY = Math.floor(maxY / REGION_HEIGHT);

        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                const regionCenterX = (regionX + 0.5) * REGION_WIDTH;
                const regionCenterY = (regionY + 0.5) * REGION_HEIGHT;
                const dx = regionCenterX - centerX;
                const dy = regionCenterY - centerY;
                const distSq = dx * dx + dy * dy;
                regions.push({
                    id: (regionX * regionStride) + regionY,
                    distSq: distSq
                });
            }
        }

        regions.sort((a, b) => a.distSq - b.distSq);
        return regions.map(r => r.id);
    },

    _collectTilesCentered: function (planeCache, regionIds, minX, maxX, minY, maxY, centerX, centerY) {
        let capacity = 0;
        for (let i = 0; i < regionIds.length; i++) {
            const entry = planeCache.get(regionIds[i]);
            if (entry) capacity += entry.count;
        }

        const xs = new Int16Array(capacity);
        const ys = new Int16Array(capacity);
        const dists = new Float64Array(capacity);
        let total = 0;

        for (let i = 0; i < regionIds.length; i++) {
            const entry = planeCache.get(regionIds[i]);
            if (!entry) continue;

            const regionXs = entry.xs;
            const regionYs = entry.ys;
            const count = entry.count;

            for (let j = 0; j < count; j++) {
                const x = regionXs[j];
                const y = regionYs[j];
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    const dx = x - centerX;
                    const dy = y - centerY;
                    xs[total] = x;
                    ys[total] = y;
                    dists[total] = dx * dx + dy * dy;
                    total++;
                }
            }
        }

        const maxTiles = Math.min(total, this._tileLimit);
        const tiles = new Float32Array(maxTiles * 2);

        if (maxTiles === total) {
            for (let i = 0; i < total; i++) {
                tiles[i * 2] = xs[i];
                tiles[i * 2 + 1] = ys[i];
            }
            return { tiles, count: total, total };
        }

        const threshold = dists.slice(0, total).sort()[maxTiles - 1];
        let n = 0;

        for (let i = 0; i < total; i++) {
            if (dists[i] < threshold) {
                tiles[n * 2] = xs[i];
                tiles[n * 2 + 1] = ys[i];
                n++;
            }
        }

        for (let i = 0; i < total && n < maxTiles; i++) {
            if (dists[i] === threshold) {
                tiles[n * 2] = xs[i];
                tiles[n * 2 + 1] = ys[i];
                n++;
            }
        }

        return { tiles, count: n, total };
    },
});
