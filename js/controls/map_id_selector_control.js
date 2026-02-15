'use strict';

import {Position} from '../model/Position.js';

export const MapIdSelectorControl = L.Control.extend({
    options: {
        position: 'topleft'
    },

    onAdd: function (map) {
        this._container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-id-selector');
        L.DomEvent.disableClickPropagation(this._container);
        L.DomEvent.disableScrollPropagation(this._container);

        const header = L.DomUtil.create('div', 'map-id-header', this._container);

        const label = L.DomUtil.create('span', 'map-id-label', header);
        label.textContent = 'MAP ID';

        this._mapIdInput = L.DomUtil.create('input', 'map-id-input', header);
        this._mapIdInput.type = 'number';
        this._mapIdInput.min = -1;
        this._mapIdInput.value = map.getMapId();
        this._mapIdInput.placeholder = '-1';

        L.DomEvent.on(this._mapIdInput, 'change', this._onMapIdChange, this);
        L.DomEvent.on(this._mapIdInput, 'keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._onMapIdChange();
                this._mapIdInput.blur();
            }
        }, this);

        const coordsWrapper = L.DomUtil.create('div', 'map-id-coords', this._container);

        const localRow = L.DomUtil.create('div', 'map-id-coord-row', coordsWrapper);
        const localLabel = L.DomUtil.create('span', 'map-id-coord-label', localRow);
        localLabel.textContent = 'LOCAL';
        this._localCoords = L.DomUtil.create('span', 'map-id-coord-value local', localRow);
        this._localCoords.textContent = '—';

        const globalRow = L.DomUtil.create('div', 'map-id-coord-row', coordsWrapper);
        const globalLabel = L.DomUtil.create('span', 'map-id-coord-label', globalRow);
        globalLabel.textContent = 'GLOBAL';
        this._globalCoords = L.DomUtil.create('span', 'map-id-coord-value global', globalRow);
        this._globalCoords.textContent = '—';

        map.on('mousemove', this._onMouseMove, this);
        map.on('mapidchange', this._onMapIdChanged, this);

        return this._container;
    },

    onRemove: function (map) {
        map.off('mousemove', this._onMouseMove, this);
        map.off('mapidchange', this._onMapIdChanged, this);
    },

    _onMapIdChange: function () {
        const val = parseInt(this._mapIdInput.value);
        if (isNaN(val)) return;
        this._map.setMapId(val);
    },

    _onMapIdChanged: function (e) {
        this._mapIdInput.value = e.newMapId;
    },

    _getMapBounds: function () {
        const map = this._map;
        const mapId = map.getMapId();
        if (!map._baseMaps || !map._baseMaps[mapId]) return null;
        const [[west, south]] = map._baseMaps[mapId].bounds;
        return { x: west, y: south };
    },

    _onMouseMove: function (e) {
        if (this._map.getContainer() !== document.activeElement) return;

        const pos = Position.fromLatLng(e.latlng, this._map.getPlane());
        this._globalCoords.textContent = pos.x + ', ' + pos.y + ', ' + pos.plane;

        const origin = this._getMapBounds();
        if (origin) {
            const lx = pos.x - origin.x;
            const ly = pos.y - origin.y;
            this._localCoords.textContent = lx + ', ' + ly + ', ' + pos.plane;
        } else {
            this._localCoords.textContent = '—';
        }
    }
});
