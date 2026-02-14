'use strict';

import { Region } from '../model/Region.js';

export const LocationTrackerControl = L.Control.extend({
    options: {
        position: 'topright',
        pollInterval: 600,
        endpoint: 'http://127.0.0.1:25570/position',
    },

    initialize: function (options) {
        L.setOptions(this, options);
        this._marker = null;
        this._pulseMarker = null;
        this._polling = false;
        this._pollTimer = null;
        this._connected = false;
    },

    onAdd: function (map) {
        this._map = map;

        const container = L.DomUtil.create('div', 'location-tracker-panel');

        const toggleBtn = L.DomUtil.create('button', 'location-tracker-toggle', container);
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
        </svg>`;
        toggleBtn.title = 'Live Location Tracker';
        this._toggleBtn = toggleBtn;

        this._statusDot = L.DomUtil.create('span', 'location-tracker-status-dot', toggleBtn);

        let active = false;
        L.DomEvent.on(toggleBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            active = !active;
            toggleBtn.classList.toggle('active', active);
            if (active) {
                this._startPolling();
            } else {
                this._stopPolling();
            }
        });

        L.DomEvent.disableClickPropagation(container);

        return container;
    },

    onRemove: function () {
        this._stopPolling();
    },

    _startPolling: function () {
        if (this._polling) return;
        this._polling = true;
        this._poll();
    },

    _stopPolling: function () {
        this._polling = false;
        if (this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
        this._removeMarkers();
        this._setConnected(false);
    },

    _poll: function () {
        if (!this._polling) return;

        fetch(this.options.endpoint)
            .then(res => res.json())
            .then(data => {
                if (!this._polling) return;
                this._setConnected(true);
                this._updatePosition(data);
                this._pollTimer = setTimeout(() => this._poll(), this.options.pollInterval);
            })
            .catch(() => {
                if (!this._polling) return;
                this._setConnected(false);
                this._removeMarkers();
                this._pollTimer = setTimeout(() => this._poll(), 2000);
            });
    },

    _setConnected: function (connected) {
        if (this._connected === connected) return;
        this._connected = connected;
        this._statusDot.classList.toggle('connected', connected);
    },

    _updatePosition: function (data) {
        const latLng = L.latLng(data.y - 0.5, data.x + 0.5);
        const region = Region.fromCoordinates(data.x, data.y);
        const name = data.name || 'Player';

        const tooltipContent =
            `<div class="location-tracker-tooltip-body">` +
            `<div class="location-tracker-tooltip-name">${name}</div>` +
            `<div class="location-tracker-tooltip-coords">${data.x}, ${data.y}, ${data.plane}</div>` +
            `<div class="location-tracker-tooltip-region">Region ${region.id}</div>` +
            `</div>`;

        if (!this._marker) {
            this._pulseMarker = L.circleMarker(latLng, {
                radius: 16,
                color: 'var(--accent-cyan)',
                fillColor: 'var(--accent-cyan)',
                fillOpacity: 0.15,
                weight: 1,
                opacity: 0.4,
                className: 'location-pulse',
            }).addTo(this._map);

            this._marker = L.circleMarker(latLng, {
                radius: 6,
                color: '#fff',
                fillColor: 'var(--accent-cyan)',
                fillOpacity: 1,
                weight: 2,
            }).addTo(this._map);

            this._marker.bindTooltip(tooltipContent, {
                className: 'location-tracker-tooltip',
                direction: 'top',
                offset: [0, -10],
                permanent: true,
            });
        } else {
            this._marker.setLatLng(latLng);
            this._pulseMarker.setLatLng(latLng);
            this._marker.setTooltipContent(tooltipContent);
        }

        this._map.panTo(latLng);
    },

    _removeMarkers: function () {
        if (this._marker) {
            this._map.removeLayer(this._marker);
            this._marker = null;
        }
        if (this._pulseMarker) {
            this._map.removeLayer(this._pulseMarker);
            this._pulseMarker = null;
        }
    },
});
