'use strict';

import { Position } from '../model/Position.js';
import { CanvasLayer } from '../external/L.CanvasLayer.js';
import {
    Region,
    MIN_X, MAX_X,
    MIN_Y, MAX_Y,
    REGION_WIDTH, REGION_HEIGHT
} from '../model/Region.js';

const RegionLabelsCanvas = CanvasLayer.extend({
    setData: function (data) {
        this.needRedraw();
    },

    onDrawLayer: function (info) {
        const zoom = this._map.getZoom();
        const fontSize = 10 * Math.pow(2, zoom);

        const ctx = info.canvas.getContext('2d');
        ctx.clearRect(0, 0, info.canvas.width, info.canvas.height);

        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctx.fillStyle = 'rgba(230, 237, 243, 0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let x = MIN_X; x < MAX_X; x += REGION_WIDTH) {
            for (let y = MIN_Y; y < MAX_Y; y += REGION_HEIGHT) {
                const position = new Position(x + (REGION_WIDTH / 2), y + (REGION_HEIGHT / 2), 0);
                const region = Region.fromPosition(position);

                const canvasPoint = info.layer._map.latLngToContainerPoint(position.toCentreLatLng());
                ctx.fillText(region.id.toString(), canvasPoint.x, canvasPoint.y);
            }
        }
    }
});

export const RegionLabelsControl = L.Control.extend({
    options: {
        position: 'topleft'
    },

    onAdd: function (map) {
        map.createPane('region-labels');
        map.getPane('region-labels').style.display = 'none';

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._canvas = new RegionLabelsCanvas({ pane: 'region-labels' });
        map.addLayer(this._canvas);

        this._enabled = false;

        return this._container;
    },

    isEnabled: function () {
        return this._enabled;
    },

    setEnabled: function (enabled) {
        if (this._enabled === enabled) return;

        this._enabled = enabled;
        this._map.getPane('region-labels').style.display = enabled ? '' : 'none';

        if (enabled) {
            this._canvas.needRedraw();
        }
    },

    toggle: function () {
        this.setEnabled(!this._enabled);
    },
});
