'use strict';

const DEST_ZOOM = 1;

function tileCenter(point) {
    return [point.y + 0.5, point.x + 0.5];
}

export const DungeonLinksControl = L.Control.extend({
    options: {
        position: 'topleft',
        dataUrl: 'resources/dungeon_links.json',
    },

    onAdd: function (map) {
        map.createPane('dungeon-links');
        map.getPane('dungeon-links').style.zIndex = 460;

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._layerGroup = L.layerGroup();
        map.addLayer(this._layerGroup);

        this._endpointsByPlane = new Map();
        this._loadPromise = null;
        this._enabled = true;

        map.on('moveend planechange mapidchange zoomend', this._refresh, this);

        this._ensureData().then(() => this._refresh());

        return this._container;
    },

    isEnabled: function () {
        return this._enabled;
    },

    setEnabled: function (enabled) {
        if (this._enabled === enabled) {
            return;
        }
        this._enabled = enabled;
        const pane = this._map.getPane('dungeon-links');
        if (enabled) {
            if (pane) pane.style.display = '';
            this._refresh();
        } else {
            if (pane) pane.style.display = 'none';
            this._layerGroup.clearLayers();
        }
    },

    _ensureData: function () {
        if (this._endpointsByPlane.size) {
            return Promise.resolve();
        }
        if (this._loadPromise) {
            return this._loadPromise;
        }

        this._loadPromise = fetch(this.options.dataUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load dungeon links (${response.status})`);
                }
                return response.json();
            })
            .then((links) => {
                links.forEach((link) => {
                    if (!link.entrance || !link.destination) {
                        return;
                    }
                    const name = link.name || 'Dungeon';
                    this._addEndpoint(link.entrance, link.destination, name, 'entrance');
                    if (!link.oneway) {
                        this._addEndpoint(link.destination, link.entrance, name, 'exit');
                    }
                });
            })
            .catch((error) => {
                console.error('Failed to load dungeon links', error);
                this._loadPromise = null;
            });

        return this._loadPromise;
    },

    _addEndpoint: function (self, other, name, role) {
        const plane = self.plane || 0;
        if (!this._endpointsByPlane.has(plane)) {
            this._endpointsByPlane.set(plane, []);
        }
        this._endpointsByPlane.get(plane).push({ self, other, name, role });
    },

    _refresh: function () {
        if (!this._enabled) {
            this._layerGroup.clearLayers();
            return;
        }
        if (!this._endpointsByPlane.size) {
            return;
        }

        const map = this._map;
        const plane = map.getPlane();
        const bounds = map.getBounds();
        const minX = Math.floor(bounds.getWest());
        const maxX = Math.ceil(bounds.getEast());
        const minY = Math.floor(bounds.getSouth());
        const maxY = Math.ceil(bounds.getNorth());

        this._layerGroup.clearLayers();

        const endpoints = this._endpointsByPlane.get(plane) || [];
        endpoints.forEach((endpoint) => {
            const self = endpoint.self;
            if (self.x < minX || self.x > maxX || self.y < minY || self.y > maxY) {
                return;
            }
            this._addMarker(endpoint);
        });
    },

    _addMarker: function (endpoint) {
        const self = endpoint.self;
        const other = endpoint.other;
        const otherPlane = other.plane || 0;

        const marker = L.circleMarker(tileCenter(self), {
            radius: 11,
            color: '#5ad17a',
            weight: 2,
            opacity: 0.9,
            fillColor: '#2ecc71',
            fillOpacity: 0.15,
            className: 'dungeon-link-marker',
            pane: 'dungeon-links',
        });

        const actionLabel = endpoint.role === 'entrance' ? 'Enter' : 'Exit';
        marker.bindTooltip(`
<div class="transport-tooltip-body">
  <div class="transport-tooltip-title">${endpoint.name}</div>
  <div class="transport-tooltip-line">${actionLabel} <span class="transport-tooltip-arrow">&rarr;</span> (${other.x}, ${other.y}, ${otherPlane})</div>
  <div class="transport-tooltip-line dungeon-link-hint">Click to travel</div>
</div>`, {
            direction: 'top',
            offset: [0, -8],
            className: 'transport-tooltip',
            opacity: 0.95,
        });

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._travelTo(other);
        });

        this._layerGroup.addLayer(marker);
    },

    _travelTo: function (point) {
        const map = this._map;
        if (map.setPlane) {
            map.setPlane(point.plane || 0);
        }
        map.setView(tileCenter(point), Math.max(map.getZoom(), DEST_ZOOM));
    },
});
