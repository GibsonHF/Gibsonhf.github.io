'use strict';

import { Position } from '../model/Position.js';
import {
    REGION_WIDTH, REGION_HEIGHT,
    MIN_X, MAX_X,
    MIN_Y, MAX_Y
} from '../model/Region.js';

export const GridControl = L.Control.extend({
    options: {
        position: 'topleft'
    },

    onAdd: function (map) {
        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._gridFeatureGroup = this._createGridFeature();
        this._enabled = false;

        return this._container;
    },

    isEnabled: function () {
        return this._enabled;
    },

    setEnabled: function (enabled) {
        if (this._enabled === enabled) return;

        if (enabled) {
            this._map.addLayer(this._gridFeatureGroup);
            this._enabled = true;
        } else {
            this._map.removeLayer(this._gridFeatureGroup);
            this._enabled = false;
        }
    },

    toggle: function () {
        this.setEnabled(!this._enabled);
    },

    _createGridFeature: function () {
        const gridFeatureGroup = new L.FeatureGroup();

        for (let x = MIN_X; x <= MAX_X; x += REGION_WIDTH) {
            const startPos = new Position(x, MIN_Y, 0);
            const endPos = new Position(x, MAX_Y, 0);
            const line = L.polyline([startPos.toLatLng(), endPos.toLatLng()], {
                clickable: false,
                color: '#58a6ff',
                weight: 1,
                opacity: 0.4
            });
            gridFeatureGroup.addLayer(line);
        }

        for (let y = MIN_Y; y <= MAX_Y; y += REGION_HEIGHT) {
            const startPos = new Position(MIN_X, y, 0);
            const endPos = new Position(MAX_X, y, 0);
            const line = L.polyline([startPos.toLatLng(), endPos.toLatLng()], {
                clickable: false,
                color: '#58a6ff',
                weight: 1,
                opacity: 0.4
            });
            gridFeatureGroup.addLayer(line);
        }

        return gridFeatureGroup;
    }
});
