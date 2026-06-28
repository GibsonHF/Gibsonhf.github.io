'use strict';

import { REGION_WIDTH, REGION_HEIGHT } from '../model/Region.js';

const MIN_ZOOM = 1;
const MAX_RENDERED = 5000;
const RESULT_LIMIT = 500;

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
        this._filterActive = false;
        this._filter = { field: 'all', query: '', locType: null };
        this._defs = new Map();
        this._transforms = new Map();
        this._doorStates = new Map();
        this._doorInstances = new Map();
        this._planeCache = new Map();
        this._defsLoaded = false;
        this._dbAvailable = null;
        this._refreshTimeout = null;
        this._onObjectClick = null;

        map.on('moveend planechange mapidchange zoomend', () => {
            if (this._enabled && this._filterActive) {
                this._debouncedRefresh();
            }
        }, this);

        return this._container;
    },

    onStatusChange: null,
    onResults: null,

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
            if (!this._filterActive) {
                this._setStatus('Pick a filter');
            } else {
                this._refreshObjects();
                this._refreshResults();
            }
        } else {
            pane.style.display = 'none';
            this._layerGroup.clearLayers();
            this._setStatus('');
            if (this.onResults) {
                this.onResults([], false);
            }
        }
    },

    setFilter: function (filter) {
        this._filter = filter;
        this._filterActive = true;

        if (this._enabled) {
            this._refreshObjects();
            this._refreshResults();
        }
    },

    clearFilter: function () {
        this._filter = { field: 'all', query: '', locType: null };
        this._filterActive = false;

        if (this._enabled) {
            this._layerGroup.clearLayers();
            this._setStatus('Pick a filter');
        }
        if (this.onResults) {
            this.onResults([], false);
        }
    },

    gotoInstance: function (x, y, plane) {
        const map = this._map;
        if (map.getPlane() !== plane) {
            map.setPlane(plane);
        }
        const targetZoom = Math.max(map.getZoom(), 4);
        map.setView([y + 0.5, x + 0.5], targetZoom);
    },

    _refreshResults: function () {
        if (!this.onResults) return;
        if (!this._enabled || !this._filterActive) {
            this.onResults([], false);
            return;
        }

        this._ensureDefsLoaded()
            .then(() => this._ensureAllLocations())
            .then((all) => {
                const results = [];
                let capped = false;
                for (const loc of all) {
                    const def = this._defs.get(loc.object_id);
                    if (!def) continue;
                    if (!this._matchesFilter(def, loc)) continue;
                    results.push({
                        id: def.id,
                        name: this._displayName(def),
                        x: loc.x,
                        y: loc.y,
                        plane: loc.plane,
                    });
                    if (results.length >= RESULT_LIMIT) {
                        capped = true;
                        break;
                    }
                }
                results.sort((a, b) => a.name.localeCompare(b.name) || a.plane - b.plane);
                this.onResults(results, capped);
            })
            .catch(() => {
                this.onResults([], false);
            });
    },

    _ensureAllLocations: function () {
        if (this._allLocations) {
            return Promise.resolve(this._allLocations);
        }
        return loadObjectsDb(this.options.dbPath, this.options.sqlJsBaseUrl).then((db) => {
            const all = [];
            const stmt = db.prepare('SELECT object_id, x, y, plane, type, rotation FROM locations');
            while (stmt.step()) {
                const row = stmt.getAsObject();
                all.push({
                    object_id: row.object_id,
                    x: row.x,
                    y: row.y,
                    plane: row.plane,
                    type: row.type,
                    rotation: row.rotation,
                });
            }
            stmt.free();
            this._allLocations = all;
            return all;
        });
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
        if (!this._enabled || !this._filterActive) {
            this._layerGroup.clearLayers();
            this._setStatus('Pick a filter');
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

        this._ensureDefsLoaded()
            .then(() => this._ensurePlaneCache(plane))
            .then((planeCache) => {
                this._layerGroup.clearLayers();

                const regionIds = this._getRegionIdsInBounds(minX, maxX, minY, maxY);
                let count = 0;
                let capped = false;

                for (const regionId of regionIds) {
                    if (capped) break;
                    const locations = planeCache.get(regionId);
                    if (!locations) continue;

                    for (const loc of locations) {
                        if (capped) break;
                        if (loc.x < minX || loc.x > maxX || loc.y < minY || loc.y > maxY) continue;

                        const def = this._defs.get(loc.object_id);
                        if (!def) continue;

                        if (!this._matchesFilter(def, loc)) continue;

                        const marker = L.circleMarker([loc.y + 0.5, loc.x + 0.5], {
                            radius: 4,
                            color: '#38d3cf',
                            fillColor: '#38d3cf',
                            fillOpacity: 0.7,
                            weight: 1,
                            pane: 'object-explorer',
                        });

                        marker.bindTooltip(`${this._displayName(def)} (${def.id})`, {
                            direction: 'top',
                            offset: [0, -6],
                        });

                        marker.on('click', () => {
                            if (this._onObjectClick) {
                                this._onObjectClick(this._buildClickInfo(def, loc));
                            }
                        });

                        this._layerGroup.addLayer(marker);
                        count++;

                        if (count >= MAX_RENDERED) {
                            capped = true;
                        }
                    }
                }

                if (capped) {
                    this._setStatus(`showing ${count.toLocaleString()} (capped)`);
                } else {
                    this._setStatus(`${count.toLocaleString()} object${count !== 1 ? 's' : ''}`);
                }
            })
            .catch((error) => {
                console.error('Failed to load objects', error);
                this._dbAvailable = false;
                this._setStatus('Database unavailable');
            });
    },

    _displayName: function (def) {
        if (def.name && def.name.length > 0) {
            return def.name;
        }
        const targets = this._transforms.get(def.id);
        if (targets) {
            for (const target of targets) {
                if (target.target_name && target.target_name.length > 0) {
                    return `${target.target_name} (variant)`;
                }
            }
        }
        return `Object ${def.id}`;
    },

    _matchesFilter: function (def, location) {
        const field = this._filter.field;
        const query = this._filter.query;
        const locType = this._filter.locType;

        if (locType !== null && location.type !== locType) {
            return false;
        }

        if (field === 'type') {
            return true;
        }

        if (!query || query.length === 0) {
            return field === 'all';
        }

        const queryLower = query.toLowerCase();
        const matchesName = () => {
            if (def.name.toLowerCase().includes(queryLower)) return true;
            const targets = this._transforms.get(def.id);
            if (targets) {
                for (const target of targets) {
                    if (target.target_name && target.target_name.toLowerCase().includes(queryLower)) return true;
                }
            }
            return false;
        };
        const matchesAction = () => def.actions.some(action => action.toLowerCase().includes(queryLower));
        const matchesId = () => {
            const queryNum = parseInt(query, 10);
            return !isNaN(queryNum) && def.id === queryNum;
        };

        if (field === 'name') return matchesName();
        if (field === 'action') return matchesAction();
        if (field === 'id') return matchesId();
        return matchesName() || matchesAction() || matchesId();
    },

    _buildClickInfo: function (def, location) {
        const info = {
            id: def.id,
            name: this._displayName(def),
            actions: def.actions.join(','),
            x: location.x,
            y: location.y,
            plane: location.plane,
            type: location.type,
            rotation: location.rotation,
            width: def.width,
            length: def.length,
            members: def.members,
            varbit: def.varbit,
            varp: def.varp,
        };

        const targetList = this._transforms.get(def.id);
        if (targetList && targetList.length > 0) {
            info.transforms = targetList.map(t => ({
                slot: t.slot,
                target_id: t.target_id,
                target_name: t.target_name,
            }));
        }

        const doorState = this._doorStates.get(def.id);
        if (doorState) {
            const instance = this._doorInstances.get(`${def.id}:${location.x}:${location.y}:${location.plane}`);
            info.doorState = {
                open_id: doorState.open_id,
                name: doorState.name,
                source: doorState.source,
                cache_open_id: doorState.cache_open_id,
                instance: instance ? {
                    open_x: instance.open_x,
                    open_y: instance.open_y,
                    inside_x: instance.inside_x,
                    inside_y: instance.inside_y,
                    outside_x: instance.outside_x,
                    outside_y: instance.outside_y,
                } : null,
            };
        }

        return info;
    },

    _ensureDefsLoaded: function () {
        if (this._defsLoaded) {
            return Promise.resolve();
        }

        return loadObjectsDb(this.options.dbPath, this.options.sqlJsBaseUrl).then((db) => {
            this._dbAvailable = true;

            const defStmt = db.prepare('SELECT id, name, actions, width, length, members, varbit, varp, transforms, transform_default, category FROM object_defs');
            while (defStmt.step()) {
                const row = defStmt.getAsObject();
                const transforms = row.transforms ? JSON.parse(row.transforms) : [];
                this._defs.set(row.id, {
                    id: row.id,
                    name: row.name || '',
                    actions: (row.actions || '').split(',').filter(a => a.length > 0),
                    width: row.width,
                    length: row.length,
                    members: row.members,
                    varbit: row.varbit,
                    varp: row.varp,
                    transforms: transforms,
                    transform_default: row.transform_default,
                    category: row.category
                });
            }
            defStmt.free();

            const targetStmt = db.prepare('SELECT base_id, slot, target_id, target_name FROM transform_targets');
            while (targetStmt.step()) {
                const row = targetStmt.getAsObject();
                if (!this._transforms.has(row.base_id)) {
                    this._transforms.set(row.base_id, []);
                }
                this._transforms.get(row.base_id).push({
                    slot: row.slot,
                    target_id: row.target_id,
                    target_name: row.target_name || ''
                });
            }
            targetStmt.free();

            this._doorStates = new Map();
            const doorStmt = db.prepare('SELECT closed_id, open_id, name, source, cache_open_id FROM door_open_states');
            while (doorStmt.step()) {
                const row = doorStmt.getAsObject();
                this._doorStates.set(row.closed_id, {
                    open_id: row.open_id,
                    name: row.name || '',
                    source: row.source || '',
                    cache_open_id: row.cache_open_id
                });
            }
            doorStmt.free();

            this._doorInstances = new Map();
            const linkStmt = db.prepare('SELECT closed_id, open_id, closed_x, closed_y, closed_plane, open_x, open_y, inside_x, inside_y, outside_x, outside_y, open_action FROM door_links');
            while (linkStmt.step()) {
                const row = linkStmt.getAsObject();
                const key = `${row.closed_id}:${row.closed_x}:${row.closed_y}:${row.closed_plane}`;
                this._doorInstances.set(key, row);
            }
            linkStmt.free();

            this._defsLoaded = true;
        });
    },

    _ensurePlaneCache: function (plane) {
        if (this._planeCache.has(plane)) {
            return Promise.resolve(this._planeCache.get(plane));
        }

        return loadObjectsDb(this.options.dbPath, this.options.sqlJsBaseUrl).then((db) => {
            const regionMap = new Map();
            const stmt = db.prepare('SELECT object_id, x, y, plane, type, rotation FROM locations WHERE plane = ?');
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
                    object_id: row.object_id,
                    x: row.x,
                    y: row.y,
                    plane: row.plane,
                    type: row.type,
                    rotation: row.rotation
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
