'use strict';

const NPC_MARKER_COLOR = '#e74c3c';

export const NPCPositionsControl = L.Control.extend({
    options: {
        position: 'topleft',
    },

    onAdd: function (map) {
        map.createPane('npc-positions');
        map.getPane('npc-positions').style.display = 'none';
        map.getPane('npc-positions').style.zIndex = 450;

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._layerGroup = L.layerGroup();
        map.addLayer(this._layerGroup);

        this._enabled = false;
        this._npcData = [];
        this._loadedFiles = new Set();

        map.on('moveend planechange mapidchange zoomend', () => {
            if (this._enabled) {
                this._refreshMarkers();
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
        const pane = this._map.getPane('npc-positions');

        if (enabled) {
            pane.style.display = '';
            this._refreshMarkers();
        } else {
            pane.style.display = 'none';
            this._layerGroup.clearLayers();
            this._setStatus('');
        }
    },

    toggle: function () {
        this.setEnabled(!this._enabled);
    },

    loadNPCFile: async function (file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            this._processNPCData(data, true);
            return true;
        } catch (e) {
            console.error('Failed to load NPC file:', file.name, e);
            return false;
        }
    },

    finishBulkLoad: function () {
        if (this._enabled) {
            this._refreshMarkers();
        }
    },

    loadFromURL: async function (url) {
        if (this._loadedFiles.has(url)) {
            return true;
        }

        try {
            this._setStatus('Loading...');
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this._processNPCData(data);
            this._loadedFiles.add(url);
            return true;
        } catch (e) {
            console.error('Failed to load NPC data from URL:', e);
            this._setStatus('Failed to load');
            return false;
        }
    },

    loadFromJSON: function (data) {
        this._processNPCData(data);
        if (this._enabled) {
            this._refreshMarkers();
        }
    },

    _processNPCData: function (data, skipRefresh) {
        if (!data.locations || !Array.isArray(data.locations)) {
            return;
        }

        const pageName = data.page_name || 'Unknown NPC';

        data.locations.forEach(loc => {
            if (loc.x && loc.y && loc.npc_id) {
                this._npcData.push({
                    npc_id: loc.npc_id,
                    npc_name: loc.npc_name || pageName,
                    x: loc.x,
                    y: loc.y,
                    plane: loc.plane || 0,
                    map_id: loc.map_id,
                    section: loc.section || loc.group || pageName,
                    source: pageName,
                });
            }
        });

        if (this._enabled && !skipRefresh) {
            this._refreshMarkers();
        }
    },

    clearData: function () {
        this._npcData = [];
        this._loadedFiles.clear();
        this._layerGroup.clearLayers();
        this._setStatus('');
    },

    getNPCCount: function () {
        return this._npcData.length;
    },

    _refreshMarkers: function () {
        const map = this._map;
        const bounds = map.getBounds();
        const plane = map.getPlane();
        const mapId = map.getMapId ? map.getMapId() : -1;

        const minX = Math.floor(bounds.getWest());
        const maxX = Math.ceil(bounds.getEast());
        const minY = Math.floor(bounds.getSouth());
        const maxY = Math.ceil(bounds.getNorth());

        this._layerGroup.clearLayers();

        let visibleCount = 0;

        const locationGroups = new Map();

        this._npcData.forEach(npc => {
            if (npc.plane !== plane) return;

            if (npc.map_id !== undefined && npc.map_id !== null && npc.map_id !== -1) {
                if (mapId !== -1 && npc.map_id !== mapId) return;
            }

            if (npc.x < minX || npc.x > maxX || npc.y < minY || npc.y > maxY) return;

            const key = `${npc.x},${npc.y}`;
            if (!locationGroups.has(key)) {
                locationGroups.set(key, []);
            }
            locationGroups.get(key).push(npc);
        });

        locationGroups.forEach((npcs, key) => {
            const [x, y] = key.split(',').map(Number);
            const latLng = L.latLng(y - 1, x);

            const hasMultiple = npcs.length > 1;
            const marker = L.circleMarker(latLng, {
                radius: hasMultiple ? 7 : 5,
                color: hasMultiple ? '#ffffff' : NPC_MARKER_COLOR,
                weight: 2,
                fillColor: NPC_MARKER_COLOR,
                fillOpacity: 0.9,
                pane: 'npc-positions',
            });

            if (hasMultiple) {
                const badgeIcon = L.divIcon({
                    className: 'npc-badge',
                    html: `<span class="npc-badge-count">${npcs.length}</span>`,
                    iconSize: [16, 16],
                    iconAnchor: [-2, 18],
                });
                const badge = L.marker(latLng, {
                    icon: badgeIcon,
                    interactive: false,
                    pane: 'npc-positions',
                });
                this._layerGroup.addLayer(badge);
            }

            const tooltipHtml = this._buildTooltip(npcs);
            marker.bindTooltip(tooltipHtml, {
                sticky: false,
                className: 'npc-tooltip',
                interactive: false,
                opacity: 0.95,
                direction: 'top',
                offset: [0, -6],
            });

            marker.on('click', () => {
                this._showNPCPopup(latLng, npcs);
            });

            this._layerGroup.addLayer(marker);
            visibleCount += npcs.length;
        });

        this._setStatus(`${visibleCount} NPC position${visibleCount !== 1 ? 's' : ''}`);
    },

    _buildTooltip: function (npcs) {
        if (npcs.length === 1) {
            const npc = npcs[0];
            return `
<div class="npc-tooltip-body">
    <div class="npc-tooltip-title">${npc.npc_name}</div>
    <div class="npc-tooltip-line">ID: ${npc.npc_id}</div>
    <div class="npc-tooltip-line">(${npc.x}, ${npc.y}, ${npc.plane})</div>
    ${npc.section !== npc.npc_name ? `<div class="npc-tooltip-line" style="color:#8b949e;">${npc.section}</div>` : ''}
</div>`;
        }

        return `
<div class="npc-tooltip-body">
    <div class="npc-tooltip-title">${npcs.length} NPCs at this location</div>
    <div class="npc-tooltip-line" style="color:#8b949e;">Click to see details</div>
</div>`;
    },

    _showNPCPopup: function (latLng, npcs) {
        const listItems = npcs.map((npc, index) => `
<div class="npc-popup-item" data-index="${index}">
    <span class="npc-color-dot" style="background-color:${NPC_MARKER_COLOR};"></span>
    <div class="npc-popup-item-content">
        <div class="npc-popup-item-title">${npc.npc_name}</div>
        <div class="npc-popup-item-detail">ID: ${npc.npc_id}</div>
        ${npc.section !== npc.npc_name ? `<div class="npc-popup-item-section">${npc.section}</div>` : ''}
    </div>
</div>`).join('');

        const npc = npcs[0];
        const popupContent = `
<div class="npc-positions-popup">
    <div class="npc-popup-header">
        <span class="npc-popup-title">${npcs.length} NPC${npcs.length > 1 ? 's' : ''}</span>
        <span class="npc-popup-coords">(${npc.x}, ${npc.y}, ${npc.plane})</span>
    </div>
    <div class="npc-popup-list">
        ${listItems}
    </div>
</div>`;

        L.popup({
            className: 'npc-popup-container',
            maxWidth: 320,
            minWidth: 200,
            autoPan: true,
        })
            .setLatLng(latLng)
            .setContent(popupContent)
            .openOn(this._map);
    },
});
