'use strict';

import { Region } from '../model/Region.js';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

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

        const headerActions = L.DomUtil.create('div', 'pin-drop-header-actions', header);

        const loadBtn = L.DomUtil.create('button', 'pin-drop-clear-btn', headerActions);
        loadBtn.textContent = 'Load JSON';
        loadBtn.title = 'Load pins from an exported JSON file';

        const fileInput = L.DomUtil.create('input', 'pin-drop-file-input', headerActions);
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';

        const clearBtn = L.DomUtil.create('button', 'pin-drop-clear-btn', headerActions);
        clearBtn.textContent = 'Clear All';
        clearBtn.title = 'Remove all pins';

        this._loadStatus = L.DomUtil.create('div', 'pin-drop-status', panel);
        this._loadStatus.style.display = 'none';

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

        L.DomEvent.on(loadBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            fileInput.value = '';
            fileInput.click();
        });

        L.DomEvent.on(fileInput, 'change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) this.loadFromFile(file);
        });

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        this._panel = panel;
        return container;
    },

    addPin: function (position, skipRefresh) {
        this._pinCounter++;
        const region = Region.fromCoordinates(position.x, position.y);

        const pin = {
            id: this._pinCounter,
            x: position.x,
            y: position.y,
            plane: position.plane,
            regionId: region.id,
            label: position.label || '',
        };

        const marker = L.marker(L.latLng(position.y + 0.5, position.x + 0.5), {
            icon: L.divIcon({
                className: 'pin-marker-icon',
                html: `<svg viewBox="0 0 24 24" width="28" height="28"><path fill="var(--accent-magenta)" stroke="var(--bg-primary)" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
            }),
        });

        marker.bindTooltip(
            `<div class="pin-tooltip-body">` +
            (pin.label ? `<div class="pin-tooltip-label">${escapeHtml(pin.label)}</div>` : '') +
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

        if (skipRefresh) return;

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
        this._setLoadStatus('');
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

            if (pin.label) {
                const label = L.DomUtil.create('div', 'pin-drop-item-label', info);
                label.textContent = pin.label;
            }

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
                this._map.panTo(L.latLng(pin.y + 0.5, pin.x + 0.5));
                this._map.setPlane(pin.plane);
            });

            L.DomEvent.on(removeBtn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                this.removePin(pin.id);
            });

            L.DomEvent.on(item, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                this._map.panTo(L.latLng(pin.y + 0.5, pin.x + 0.5));
                this._map.setPlane(pin.plane);
            });
        });
    },

    loadFromFile: async function (file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const pins = this._extractPins(data);
            if (pins.length === 0) {
                this._setLoadStatus('No pins found in that file');
                return;
            }
            pins.forEach(pin => this.addPin(pin, true));
            this._renderList();
            this._updateBadge();
            if (!this._panel.classList.contains('visible')) {
                this._toggleBtn.click();
            }
            this._setLoadStatus(`Loaded ${pins.length} pin${pins.length === 1 ? '' : 's'} from ${file.name}`);
        } catch (e) {
            console.error('Failed to load pins from JSON:', file.name, e);
            this._setLoadStatus('Failed to load: invalid JSON');
        }
    },

    _extractPins: function (data) {
        const pins = [];
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.pins) ? data.pins : []);
        list.forEach(entry => {
            if (!entry) return;
            if (Array.isArray(entry.spawns)) {
                const label = (entry.name || '').split(' / ')[0];
                entry.spawns.forEach(spawn => {
                    const x = Number(spawn.x);
                    const y = Number(spawn.y);
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                        pins.push({ x, y, plane: Number(spawn.z) || 0, label });
                    }
                });
            } else {
                const x = Number(entry.x);
                const y = Number(entry.y);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    const plane = Number(entry.plane !== undefined ? entry.plane : entry.z) || 0;
                    const label = entry.label || (entry.name ? entry.name.split(' / ')[0] : '');
                    pins.push({ x, y, plane, label });
                }
            }
        });
        return pins;
    },

    _setLoadStatus: function (message) {
        if (!this._loadStatus) return;
        if (message) {
            this._loadStatus.textContent = message;
            this._loadStatus.style.display = '';
        } else {
            this._loadStatus.textContent = '';
            this._loadStatus.style.display = 'none';
        }
    },
});
