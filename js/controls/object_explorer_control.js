'use strict';

import { REGION_WIDTH, REGION_HEIGHT } from '../model/Region.js';

const MIN_ZOOM = 1;

let dbPromise = null;

function loadObjectsDb(dbPath, sqlJsBaseUrl) {
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

export const ObjectExplorerControl = L.Control.extend({
    options: {
        position: 'topleft',
        dbPath: '/objects.db',
        sqlJsBaseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/',
    },

    onAdd: function (map) {
        map.createPane('object-explorer');
        map.getPane('object-explorer').style.display = 'none';

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._layerGroup = L.layerGroup();
        map.addLayer(this._layerGroup);

        this._enabled = false;
        this._planeCache = new Map();
        this._dbAvailable = null;
        this._refreshTimeout = null;
        this._onObjectClick = null;

        map.on('moveend planechange mapidchange zoomend', () => {
            if (this._enabled) {
                this._debouncedRefresh();
            }
        }, this);

        return this._container;
    },

    onStatusChange: null,

    _setStatus: function (message) {
        this._status = message || '';
        if (this.onStatusChange) {
            this.onStatusChange(this._status);
        }
    },

    isEnabled: function () {
        return this._enabled;
    },

    setEnabled: function (enabled) {
        if (this._enabled === enabled) return;

        this._enabled = enabled;
        const pane = this._map.getPane('object-explorer');

        if (enabled) {
            pane.style.display = '';
            this._refreshObjects();
        } else {
            pane.style.display = 'none';
            this._layerGroup.clearLayers();
            this._setStatus('');
        }
    },

    _debouncedRefresh: function () {
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
        }
        this._refreshTimeout = setTimeout(() => {
            this._refreshObjects();
            this._refreshTimeout = null;
        }, 50);
    },

    _refreshObjects: function () {
        if (!this._enabled) {
            this._layerGroup.clearLayers();
            this._setStatus('');
            return;
        }

        const map = this._map;
        const zoom = map.getZoom();

        if (zoom < MIN_ZOOM) {
            this._layerGroup.clearLayers();
            this._setStatus('Zoom in to see objects');
            return;
        }

        const bounds = map.getBounds();
        const plane = map.getPlane();

        const minX = Math.floor(bounds.getWest());
        const maxX = Math.ceil(bounds.getEast());
        const minY = Math.floor(bounds.getSouth());
        const maxY = Math.ceil(bounds.getNorth());

        this._setStatus('Loading...');

        this._ensurePlaneCache(plane)
            .then((planeCache) => {
                this._layerGroup.clearLayers();

                const regionIds = this._getRegionIdsInBounds(minX, maxX, minY, maxY);
                let count = 0;

                for (const regionId of regionIds) {
                    const objects = planeCache.get(regionId);
                    if (!objects) continue;

                    for (const obj of objects) {
                        if (obj.x < minX || obj.x > maxX || obj.y < minY || obj.y > maxY) continue;

                        const marker = L.circleMarker([obj.y + 0.5, obj.x + 0.5], {
                            radius: 4,
                            color: '#38d3cf',
                            fillColor: '#38d3cf',
                            fillOpacity: 0.7,
                            weight: 1,
                            pane: 'object-explorer',
                        });

                        marker.bindTooltip(`${obj.name} (${obj.id})`, {
                            direction: 'top',
                            offset: [0, -6],
                        });

                        marker.on('click', () => {
                            if (this._onObjectClick) {
                                this._onObjectClick(obj);
                            }
                        });

                        this._layerGroup.addLayer(marker);
                        count++;
                    }
                }

                this._setStatus(`${count.toLocaleString()} object${count !== 1 ? 's' : ''}`);
            })
            .catch((error) => {
                console.error('Failed to load objects', error);
                this._dbAvailable = false;
                this._setStatus('Database unavailable');
            });
    },

    _ensurePlaneCache: function (plane) {
        if (this._planeCache.has(plane)) {
            return Promise.resolve(this._planeCache.get(plane));
        }

        return loadObjectsDb(this.options.dbPath, this.options.sqlJsBaseUrl).then((db) => {
            this._dbAvailable = true;
            const regionMap = new Map();
            const stmt = db.prepare('SELECT id, name, actions, x, y FROM objects WHERE plane = ?');
            stmt.bind([plane]);

            while (stmt.step()) {
                const row = stmt.getAsObject();
                const regionId = Math.floor(row.x / REGION_WIDTH) * 256 + Math.floor(row.y / REGION_HEIGHT);

                let entry = regionMap.get(regionId);
                if (!entry) {
                    entry = [];
                    regionMap.set(regionId, entry);
                }
                entry.push({
                    id: row.id,
                    name: row.name,
                    actions: row.actions,
                    x: row.x,
                    y: row.y,
                    plane: plane,
                });
            }
            stmt.free();

            this._planeCache.set(plane, regionMap);
            return regionMap;
        });
    },

    _getRegionIdsInBounds: function (minX, maxX, minY, maxY) {
        const regionIds = [];
        const startRegionX = Math.floor(minX / REGION_WIDTH);
        const endRegionX = Math.floor(maxX / REGION_WIDTH);
        const startRegionY = Math.floor(minY / REGION_HEIGHT);
        const endRegionY = Math.floor(maxY / REGION_HEIGHT);

        for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
            for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
                regionIds.push(regionX * 256 + regionY);
            }
        }

        return regionIds;
    },
});
