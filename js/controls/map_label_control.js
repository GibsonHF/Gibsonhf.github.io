'use strict';

import { CanvasLayer } from '../external/L.CanvasLayer.js';
import Locations from "../model/Locations.js";
import { Position } from "../model/Position.js";

var MapLabelsCanvas = CanvasLayer.extend({
    setData: function (data) {
        this.needRedraw();
    },

    onDrawLayer: function (info) {
        var zoom = info.layer._map.getZoom();
        var ctx = info.canvas.getContext('2d');
        ctx.clearRect(0, 0, info.canvas.width, info.canvas.height);
        ctx.textAlign = "center";

        const sizePriority = { large: 0, medium: 1, default: 2 };
        const sizeProps = {
            large:   { baseSize: 11, fontColour: '#ffaa00', minZoom: -4 },
            medium:  { baseSize: 7,  fontColour: 'white',   minZoom: -1 },
            default: { baseSize: 5,  fontColour: 'white',   minZoom: 1  },
        };
        const PAD = 4;

        Locations.getLocations(function (locations) {
            const plane = info.layer._map.getPlane();

            // Filter to visible, then sort large→medium→default
            const visible = locations.filter(loc => loc.position.plane === plane);
            visible.sort((a, b) => (sizePriority[a.size] ?? 2) - (sizePriority[b.size] ?? 2));

            const drawn = []; // bounding boxes of already-drawn labels

            for (var i = 0; i < visible.length; i++) {
                const loc = visible[i];
                const props = sizeProps[loc.size] || sizeProps.default;

                if (zoom < props.minZoom) continue;

                const fontSizeScaled = props.baseSize * Math.pow(2, zoom);
                if (fontSizeScaled < 6) continue;

                ctx.font = `bold ${fontSizeScaled}px Verdana`;

                const latLng = loc.position.toCentreLatLng();
                const pt = info.layer._map.latLngToContainerPoint(latLng);

                // Word-wrap
                const words = loc.name.split(' ');
                const lines = [];
                let line = '';
                words.forEach(word => {
                    if (line === '') {
                        line = word;
                    } else if ((line + ' ' + word).length <= 12) {
                        line += ' ' + word;
                    } else {
                        lines.push(line);
                        line = word;
                    }
                });
                if (line !== '') lines.push(line);

                const lineHeight = fontSizeScaled * 1.2;
                const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
                const totalH = lines.length * lineHeight;
                const top    = pt.y - (lines.length - 1) * lineHeight / 2 - fontSizeScaled * 0.8;
                const box = {
                    x: pt.x - maxW / 2 - PAD,
                    y: top - PAD,
                    w: maxW + PAD * 2,
                    h: totalH + PAD * 2
                };

                // Collision check
                let collides = false;
                for (var j = 0; j < drawn.length; j++) {
                    const b = drawn[j];
                    if (box.x < b.x + b.w && box.x + box.w > b.x &&
                        box.y < b.y + b.h && box.y + box.h > b.y) {
                        collides = true;
                        break;
                    }
                }
                if (collides) continue;
                drawn.push(box);

                ctx.fillStyle = props.fontColour;
                ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                ctx.lineWidth = fontSizeScaled * 0.18;
                ctx.lineJoin = 'round';

                let y = pt.y - (lines.length - 1) * lineHeight / 2;
                lines.forEach(l => {
                    ctx.strokeText(l, pt.x, y);
                    ctx.fillText(l, pt.x, y);
                    y += lineHeight;
                });
            }
        });
    }
});


export var MapLabelControl = L.Control.extend({
    options: {
        position: 'topleft'
    },

    onAdd: function (map) {
        map.createPane("map-labels");

        this._enabled = false;
        this._map.getPane("map-labels").style.display = "none";

        var container = L.DomUtil.create('div');
        container.style.display = 'none';

        this._mapLabelsCanvas = new MapLabelsCanvas({ pane: "map-labels" });
        this._map.addLayer(this._mapLabelsCanvas);

        map.on('planeChanged', function () {
            this._mapLabelsCanvas.needRedraw();
        }, this);

        return container;
    },

    isEnabled: function () {
        return this._enabled;
    },

    setEnabled: function (enabled) {
        this._enabled = enabled;
        if (this._map) {
            const pane = this._map.getPane("map-labels");
            if (pane) {
                pane.style.display = enabled ? "" : "none";
            }
            if (enabled) {
                this._mapLabelsCanvas.needRedraw();
            }
        }
    },

    toggle: function () {
        this.setEnabled(!this._enabled);
    },
});