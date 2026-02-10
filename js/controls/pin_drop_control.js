'use strict';

import { Region } from '../model/Region.js';

export const PinDropControl = L.Control.extend({
    options: {
        position: 'topright',
    },

    initialize: function (options) {
        L.setOptions(this, options);
        this._pins = [];
        this._markers = L.layerGroup();
        this._pinCounter = 0;
    },

    onAdd: function (map) {
        this._map = map;
        this._markers.addTo(map);

        const container = L.DomUtil.create('div', 'pin-drop-panel');

        const toggleBtn = L.DomUtil.create('button', 'pin-drop-toggle', container);
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>`;
        toggleBtn.title = 'Dropped Pins';
        this._toggleBtn = toggleBtn;

        const panel = L.DomUtil.create('div', 'pin-drop-content', container);

        const header = L.DomUtil.create('div', 'pin-drop-header', panel);

        const title = L.DomUtil.create('span', 'pin-drop-title', header);
        title.textContent = 'Dropped Pins';

        const clearBtn = L.DomUtil.create('button', 'pin-drop-clear-btn', header);
        clearBtn.textContent = 'Clear All';
        clearBtn.title = 'Remove all pins';

        this._listContainer = L.DomUtil.create('div', 'pin-drop-list', panel);

        this._emptyState = L.DomUtil.create('div', 'pin-drop-empty', this._listContainer);
        this._emptyState.textContent = 'Right-click the map to drop a pin';

        let panelVisible = false;
        L.DomEvent.on(toggleBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            panelVisible = !panelVisible;
            panel.classList.toggle('visible', panelVisible);
            toggleBtn.classList.toggle('active', panelVisible);
        });

        L.DomEvent.on(clearBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this.clearAll();
        });

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        this._panel = panel;
        return container;
    },

    addPin: function (position) {
        this._pinCounter++;
        const region = Region.fromCoordinates(position.x, position.y);

        const pin = {
            id: this._pinCounter,
            x: position.x,
            y: position.y,
            plane: position.plane,
            regionId: region.id,
        };

        const marker = L.marker(L.latLng(position.y - 0.5, position.x + 0.5), {
            icon: L.divIcon({
                className: 'pin-marker-icon',
                html: `<svg viewBox="0 0 24 24" width="28" height="28"><path fill="var(--accent-magenta)" stroke="var(--bg-primary)" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
            }),
        });

        marker.bindTooltip(
            `<div class="pin-tooltip-body">` +
            `<div class="pin-tooltip-coords">${position.x}, ${position.y}, ${position.plane}</div>` +
            `<div class="pin-tooltip-region">Region: ${region.id}</div>` +
            `</div>`,
            {
                className: 'pin-tooltip',
                direction: 'top',
                offset: [0, -24],
            }
        );

        this._markers.addLayer(marker);
        pin.marker = marker;
        this._pins.push(pin);

        this._renderList();
        this._updateBadge();

        if (!this._panel.classList.contains('visible')) {
            this._toggleBtn.click();
        }
    },

    removePin: function (id) {
        const index = this._pins.findIndex(p => p.id === id);
        if (index === -1) return;

        const pin = this._pins[index];
        this._markers.removeLayer(pin.marker);
        this._pins.splice(index, 1);

        this._renderList();
        this._updateBadge();
    },

    clearAll: function () {
        this._markers.clearLayers();
        this._pins = [];
        this._renderList();
        this._updateBadge();
    },

    _updateBadge: function () {
        let badge = this._toggleBtn.querySelector('.pin-drop-badge');
        if (this._pins.length > 0) {
            if (!badge) {
                badge = L.DomUtil.create('span', 'pin-drop-badge', this._toggleBtn);
            }
            badge.textContent = this._pins.length;
        } else if (badge) {
            badge.remove();
        }
    },

    _renderList: function () {
        const items = this._listContainer.querySelectorAll('.pin-drop-item');
        items.forEach(el => el.remove());

        if (this._pins.length === 0) {
            this._emptyState.style.display = '';
            return;
        }

        this._emptyState.style.display = 'none';

        this._pins.forEach(pin => {
            const item = L.DomUtil.create('div', 'pin-drop-item', this._listContainer);

            const info = L.DomUtil.create('div', 'pin-drop-item-info', item);

            const coords = L.DomUtil.create('div', 'pin-drop-item-coords', info);
            coords.textContent = `${pin.x}, ${pin.y}, ${pin.plane}`;

            const region = L.DomUtil.create('div', 'pin-drop-item-region', info);
            region.textContent = `Region ${pin.regionId}`;

            const actions = L.DomUtil.create('div', 'pin-drop-item-actions', item);

            const goToBtn = L.DomUtil.create('button', 'pin-drop-action-btn', actions);
            goToBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>`;
            goToBtn.title = 'Go to pin';

            const removeBtn = L.DomUtil.create('button', 'pin-drop-action-btn pin-drop-remove-btn', actions);
            removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
            removeBtn.title = 'Remove pin';

            L.DomEvent.on(goToBtn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                this._map.panTo(L.latLng(pin.y - 0.5, pin.x + 0.5));
                this._map.setPlane(pin.plane);
            });

            L.DomEvent.on(removeBtn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                this.removePin(pin.id);
            });

            L.DomEvent.on(item, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                this._map.panTo(L.latLng(pin.y - 0.5, pin.x + 0.5));
                this._map.setPlane(pin.plane);
            });
        });
    },
});
