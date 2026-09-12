'use strict';

import { Region } from '../model/Region.js';
import {
    isValidKey, maskKey, generateKey, roomColor, normalizeRelayUrl, fetchPlayers,
} from '../services/live_players_service.js';

const KEYS_STORAGE = 'livePlayers.keys';
const RELAY_STORAGE = 'livePlayers.relayUrl';
const POLL_INTERVAL = 4000;
const ERROR_INTERVAL = 10000;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

function playerId(player) {
    return `${player.room}:${player.name}`;
}

function percent(value, max) {
    if (!max) return 0;
    return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function readStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
}

export const LivePlayersControl = L.Control.extend({
    options: {
        position: 'topleft',
    },

    onAdd: function (map) {
        this._map = map;
        map.createPane('live-players');
        map.getPane('live-players').style.display = 'none';
        map.getPane('live-players').style.zIndex = 460;

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._layerGroup = L.layerGroup();
        map.addLayer(this._layerGroup);

        this._enabled = false;
        this._players = [];
        this._markers = new Map();
        this._pollTimer = null;
        this._followed = null;
        const storedKeys = readStorage(KEYS_STORAGE, []);
        this._keys = (Array.isArray(storedKeys) ? storedKeys : []).filter(isValidKey);
        this._relayUrl = normalizeRelayUrl(readStorage(RELAY_STORAGE, ''));

        map.on('planechange', this._renderMarkers, this);
        map.on('dragstart', this.unfollow, this);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this._restartPolling();
            }
        });

        return this._container;
    },

    onStatusChange: null,
    onPlayersChange: null,

    _setStatus: function (message) {
        this._status = message || '';
        if (this.onStatusChange) {
            this.onStatusChange(this._status);
        }
    },

    _emitPlayers: function () {
        if (this.onPlayersChange) {
            this.onPlayersChange(this._players, this._followed);
        }
    },

    isEnabled: function () {
        return this._enabled;
    },

    setEnabled: function (enabled) {
        if (this._enabled === enabled) return;
        this._enabled = enabled;
        const pane = this._map.getPane('live-players');

        if (enabled) {
            pane.style.display = '';
            this._restartPolling();
        } else {
            pane.style.display = 'none';
            this._stopPolling();
            this._players = [];
            this._followed = null;
            this._clearMarkers();
            this._setStatus('');
            this._emitPlayers();
        }
    },

    toggle: function () {
        this.setEnabled(!this._enabled);
    },

    getRelayUrl: function () {
        return this._relayUrl;
    },

    setRelayUrl: function (input) {
        const url = normalizeRelayUrl(input);
        if (!url) return false;
        this._relayUrl = url;
        writeStorage(RELAY_STORAGE, url);
        this._restartPolling();
        return true;
    },

    getKeys: function () {
        return this._keys.slice();
    },

    addKey: function (key) {
        const trimmed = String(key || '').trim().toLowerCase();
        if (!isValidKey(trimmed) || this._keys.includes(trimmed)) return false;
        this._keys.push(trimmed);
        writeStorage(KEYS_STORAGE, this._keys);
        this._restartPolling();
        return true;
    },

    removeKey: function (key) {
        this._keys = this._keys.filter(k => k !== key);
        writeStorage(KEYS_STORAGE, this._keys);
        const room = maskKey(key);
        this._players = this._players.filter(p => p.room !== room);
        if (this._followed && this._followed.startsWith(`${room}:`)) {
            this._followed = null;
        }
        this._renderMarkers();
        this._emitPlayers();
        this._restartPolling();
    },

    generateKey: function () {
        const key = generateKey();
        this.addKey(key);
        return key;
    },

    getPlayers: function () {
        return this._players.slice();
    },

    getFollowed: function () {
        return this._followed;
    },

    _findPlayer: function (room, name) {
        return this._players.find(p => p.room === room && p.name === name) || null;
    },

    focusPlayer: function (room, name) {
        const player = this._findPlayer(room, name);
        if (!player) return;
        if (this._map.getPlane() !== player.plane) {
            this._map.setPlane(player.plane);
        }
        this._map.panTo(L.latLng(player.y + 0.5, player.x + 0.5));
    },

    follow: function (room, name) {
        if (!this._findPlayer(room, name)) return;
        this._followed = `${room}:${name}`;
        this.focusPlayer(room, name);
        this._emitPlayers();
    },

    unfollow: function () {
        if (!this._followed) return;
        this._followed = null;
        this._emitPlayers();
    },

    _restartPolling: function () {
        this._stopPolling();
        if (this._enabled) {
            this._poll();
        }
    },

    _stopPolling: function () {
        if (this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
    },

    _schedulePoll: function (delay) {
        this._stopPolling();
        this._pollTimer = setTimeout(() => this._poll(), delay);
    },

    _poll: function () {
        if (!this._enabled || document.visibilityState !== 'visible') return;
        if (!this._relayUrl) {
            this._setStatus('Set relay URL');
            return;
        }
        if (!this._keys.length) {
            this._setStatus('Add a key');
            return;
        }

        fetchPlayers(this._relayUrl, this._keys)
            .then(players => {
                if (!this._enabled) return;
                this._players = players;
                this._renderMarkers();
                this._applyFollow();
                this._emitPlayers();
                const count = players.length;
                this._setStatus(`${count} player${count !== 1 ? 's' : ''}`);
                this._schedulePoll(POLL_INTERVAL);
            })
            .catch(() => {
                if (!this._enabled) return;
                this._setStatus('Disconnected');
                this._schedulePoll(ERROR_INTERVAL);
            });
    },

    _applyFollow: function () {
        if (!this._followed) return;
        const [room, name] = this._followed.split(/:(.*)/);
        const player = this._findPlayer(room, name);
        if (!player) {
            this._followed = null;
            return;
        }
        if (this._map.getPlane() !== player.plane) {
            this._map.setPlane(player.plane);
        }
        this._map.panTo(L.latLng(player.y + 0.5, player.x + 0.5));
    },

    _clearMarkers: function () {
        this._layerGroup.clearLayers();
        this._markers.clear();
    },

    _renderMarkers: function () {
        if (!this._enabled) return;
        const plane = this._map.getPlane();
        const seen = new Set();

        this._players.forEach(player => {
            if (player.plane !== plane) return;
            const id = playerId(player);
            seen.add(id);
            const latLng = L.latLng(player.y + 0.5, player.x + 0.5);
            let marker = this._markers.get(id);

            if (!marker) {
                marker = L.circleMarker(latLng, {
                    radius: 6,
                    color: '#fff',
                    fillColor: roomColor(player.room),
                    fillOpacity: 1,
                    weight: 2,
                    pane: 'live-players',
                });
                marker.bindTooltip(escapeHtml(player.name), {
                    className: 'live-player-label',
                    direction: 'top',
                    offset: [0, -8],
                    permanent: true,
                });
                marker.on('click', () => this._showPopup(id));
                this._layerGroup.addLayer(marker);
                this._markers.set(id, marker);
            } else {
                marker.setLatLng(latLng);
            }
        });

        for (const [id, marker] of this._markers) {
            if (!seen.has(id)) {
                this._layerGroup.removeLayer(marker);
                this._markers.delete(id);
            }
        }
    },

    _showPopup: function (id) {
        const player = this._players.find(p => playerId(p) === id);
        if (!player) return;

        const region = Region.fromCoordinates(player.x, player.y);
        const following = this._followed === id;
        const bar = (label, value, max, cls) => `
<div class="live-player-bar">
    <span class="live-player-bar-label">${label}</span>
    <span class="live-player-bar-track"><span class="live-player-bar-fill ${cls}" style="width:${percent(value, max)}%"></span></span>
    <span class="live-player-bar-value">${value ?? '-'}${max ? ` / ${max}` : ''}</span>
</div>`;

        const html = `
<div class="live-player-popup">
    <div class="live-player-popup-header">
        <span class="live-player-popup-name">${escapeHtml(player.name)}</span>
        <span class="live-player-popup-room" style="color:${roomColor(player.room)}">${escapeHtml(player.room)}</span>
    </div>
    ${player.hp !== undefined ? bar('HP', player.hp, player.maxHp, 'hp') : ''}
    ${player.prayer !== undefined ? bar('Prayer', player.prayer, player.maxPrayer, 'prayer') : ''}
    ${player.adrenaline !== undefined ? bar('Adren', player.adrenaline, 100, 'adrenaline') : ''}
    <div class="live-player-popup-line">${player.x}, ${player.y}, ${player.plane} · Region ${region.id}</div>
    <div class="live-player-popup-line">${player.combatLevel !== undefined ? `Combat ${player.combatLevel}` : ''}${player.target ? ` · Target: ${escapeHtml(player.target)}` : ''}</div>
    <div class="live-player-popup-line live-player-popup-age">seen ${player.age}s ago</div>
    <button class="live-player-follow-btn${following ? ' active' : ''}">${following ? 'Unfollow' : 'Follow'}</button>
</div>`;

        const popup = L.popup({
            className: 'live-player-popup-container',
            maxWidth: 260,
            offset: [0, -8],
        })
            .setLatLng(L.latLng(player.y + 0.5, player.x + 0.5))
            .setContent(html)
            .openOn(this._map);

        const button = popup.getElement().querySelector('.live-player-follow-btn');
        L.DomEvent.on(button, 'click', () => {
            if (this._followed === id) {
                this.unfollow();
            } else {
                this.follow(player.room, player.name);
            }
            this._map.closePopup(popup);
        });
    },
});
