'use strict';

import { loadTransportData } from '../data/sheets_loader.js';

const KIND_COLORS = {
    door: '#e67e22',
    item: '#3498db',
    lodestone: '#f1c40f',
    npc: '#1abc9c',
    object: '#9b59b6',
    fairy_ring: '#ff6ad5',
};

const ARROW_ICON_SIZE = 12;

export const TransportNodesControl = L.Control.extend({
    options: {
        position: 'topleft',
    },

    onAdd: function (map) {
        map.createPane('transport-nodes');
        map.getPane('transport-nodes').style.display = 'none';

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._layerGroup = L.layerGroup();
        map.addLayer(this._layerGroup);

        this._enabled = false;
        this._nodesByPlane = new Map();
        this._itemNodeMap = new Map();
        this._npcNodeMap = new Map();
        this._objectNodeMap = new Map();
        this._doorNodeMap = new Map();
        this._lodestoneNodeMap = new Map();
        this._fairyRingNodeMap = new Map();
        this._kindVisibility = {};
        this._kinds = Object.keys(KIND_COLORS);

        this._kinds.forEach((kind) => {
            this._kindVisibility[kind] = false;
        });

        map.on('moveend planechange mapidchange', () => {
            if (this._enabled) {
                this._refreshNodes();
            }
        }, this);

        map.on('zoomend', () => {
            if (this._enabled) {
                this._refreshNodes();
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

    getKinds: function () {
        return this._kinds.slice();
    },

    isKindEnabled: function (kind) {
        return !!this._kindVisibility[kind];
    },

    setKindEnabled: function (kind, enabled) {
        if (this._kindVisibility[kind] !== enabled) {
            this._kindVisibility[kind] = enabled;
            this._updateVisibility();
        }
    },

    toggleKind: function (kind) {
        this.setKindEnabled(kind, !this._kindVisibility[kind]);
    },

    _updateVisibility: function () {
        const visibleKinds = this._kinds.filter((kind) => this._kindVisibility[kind]);
        if (visibleKinds.length) {
            if (!this._enabled) {
                this._enabled = true;
                this._map.getPane('transport-nodes').style.display = '';
            }
            this._refreshNodes();
        } else {
            this._enabled = false;
            this._map.getPane('transport-nodes').style.display = 'none';
            this._layerGroup.clearLayers();
            this._setStatus('');
        }
    },

    _refreshNodes: function () {
        const map = this._map;
        const bounds = map.getBounds();
        const plane = map.getPlane();

        const minX = Math.floor(bounds.getWest());
        const maxX = Math.ceil(bounds.getEast());
        const minY = Math.floor(bounds.getSouth());
        const maxY = Math.ceil(bounds.getNorth());

        this._ensureNodes()
            .then((nodesByPlane) => {
                const nodes = nodesByPlane.get(plane) || [];
                let visibleCount = 0;
                this._layerGroup.clearLayers();

                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    try {
                        if (!this._isNodeVisible(node, minX, maxX, minY, maxY)) {
                            continue;
                        }
                        if (!this._kindVisibility[node.kind]) {
                            continue;
                        }
                        this._addTransportArrow(node);
                        visibleCount += 1;
                    } catch (err) {
                        console.warn('Skipping transport node due to error', node, err);
                    }
                }
                this._setStatus(`${visibleCount} visible`);
            })
            .catch((error) => {
                console.error('Failed to load transport nodes', error);
                this._setStatus('Failed to load');
            });
    },

    _ensureNodes: function () {
        if (this._nodesByPlane.size) {
            return Promise.resolve(this._nodesByPlane);
        }

        return loadTransportData().then((data) => {
            this._nodesByPlane = data.nodesByPlane;
            this._itemNodeMap = data.itemNodeMap;
            this._npcNodeMap = data.npcNodeMap;
            this._objectNodeMap = data.objectNodeMap;
            this._doorNodeMap = data.doorNodeMap;
            this._lodestoneNodeMap = data.lodestoneNodeMap;
            this._fairyRingNodeMap = data.fairyRingNodeMap;
            return this._nodesByPlane;
        });
    },

    _isNodeVisible: function (node, minX, maxX, minY, maxY) {
        if (node.shadow) {
            const destPoint = this._getDestPoint(node);
            if (this._isValidPoint(destPoint) && destPoint.plane === node.plane) {
                if (this._pointInBounds(destPoint.x, destPoint.y, minX, maxX, minY, maxY)) {
                    return true;
                }
            }
            const destRect = this._getDestRect(node);
            if (destRect && destRect.dest_plane === node.plane) {
                if (this._rectIntersectsBounds(destRect, minX, maxX, minY, maxY)) {
                    return true;
                }
            }
            return false;
        }

        const srcPoint = this._makePoint(node.x, node.y, node.plane);
        if (this._isValidPoint(srcPoint) && this._pointInBounds(srcPoint.x, srcPoint.y, minX, maxX, minY, maxY)) {
            return true;
        }
        const destPoint = this._getDestPoint(node);
        if (this._isValidPoint(destPoint) && destPoint.plane === node.plane) {
            if (this._pointInBounds(destPoint.x, destPoint.y, minX, maxX, minY, maxY)) {
                return true;
            }
            if (this._isValidPoint(srcPoint) &&
                this._segmentIntersectsBounds(srcPoint.x, srcPoint.y, destPoint.x, destPoint.y, minX, maxX, minY, maxY)) {
                return true;
            }
        }
        const destRect = this._getDestRect(node);
        if (destRect && destRect.dest_plane === node.plane) {
            if (this._rectIntersectsBounds(destRect, minX, maxX, minY, maxY)) {
                return true;
            }
        }
        return false;
    },

    _pointInBounds: function (x, y, minX, maxX, minY, maxY) {
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    },

    _rectIntersectsBounds: function (rect, minX, maxX, minY, maxY) {
        return !(rect.dest_max_x < minX || rect.dest_min_x > maxX ||
            rect.dest_max_y < minY || rect.dest_min_y > maxY);
    },

    _detailHasRect: function (detail) {
        return detail && detail.dest_min_x !== undefined;
    },

    _getDestRect: function (node) {
        if (node.detail && this._detailHasRect(node.detail)) {
            return node.detail;
        }
        return null;
    },

    _getDestPoint: function (node) {
        if (node.detail) {
            if (this._detailHasRect(node.detail)) {
                const centerX = (node.detail.dest_min_x + node.detail.dest_max_x) / 2;
                const centerY = (node.detail.dest_min_y + node.detail.dest_max_y) / 2;
                return this._makePoint(centerX, centerY, node.detail.dest_plane);
            }
            if (node.kind === 'lodestone' && node.detail.dest_x !== undefined) {
                return this._makePoint(node.detail.dest_x, node.detail.dest_y, node.detail.dest_plane);
            }
        }
        return this._makePoint(node.dst_x, node.dst_y, node.dst_plane);
    },

    _makePoint: function (x, y, plane) {
        const nx = Number(x);
        const ny = Number(y);
        const np = Number(plane);
        if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(np)) {
            return null;
        }
        return { x: nx, y: ny, plane: np };
    },

    _isValidPoint: function (point) {
        return point !== null;
    },

    _segmentIntersectsBounds: function (x1, y1, x2, y2, minX, maxX, minY, maxY) {
        let t0 = 0;
        let t1 = 1;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const checks = [
            [-dx, x1 - minX],
            [dx, maxX - x1],
            [-dy, y1 - minY],
            [dy, maxY - y1],
        ];

        for (let i = 0; i < checks.length; i++) {
            const p = checks[i][0];
            const q = checks[i][1];
            if (p === 0 && q < 0) {
                return false;
            }
            if (p !== 0) {
                const r = q / p;
                if (p < 0) {
                    if (r > t1) {
                        return false;
                    }
                    if (r > t0) {
                        t0 = r;
                    }
                } else {
                    if (r < t0) {
                        return false;
                    }
                    if (r < t1) {
                        t1 = r;
                    }
                }
            }
        }

        return true;
    },

    _addTransportArrow: function (node) {
        const color = KIND_COLORS[node.kind] || '#ffffff';
        if (node.shadow) {
            this._addDestinationOnly(node, color);
            return;
        }
        const srcPoint = this._makePoint(node.x, node.y, node.plane);
        if (!this._isValidPoint(srcPoint)) {
            this._addDestinationOnly(node, color);
            return;
        }
        const srcLatLng = L.latLng(srcPoint.y, srcPoint.x);
        const destPoint = this._getDestPoint(node);
        if (!this._isValidPoint(destPoint)) {
            return;
        }
        const dstLatLng = L.latLng(destPoint.y, destPoint.x);
        const polyline = L.polyline([srcLatLng, dstLatLng], {
            color: color,
            weight: 2,
            opacity: 0.85,
            pane: 'transport-nodes',
        });

        const tooltipText = this._buildTooltip(node);
        this._bindHoverTooltip(polyline, tooltipText);
        this._bindClickNavigate(polyline, node, 'dst');
        this._layerGroup.addLayer(polyline);

        const srcMarker = L.circleMarker(srcLatLng, {
            radius: 4,
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.9,
            pane: 'transport-nodes',
        });
        this._bindHoverTooltip(srcMarker, tooltipText);
        this._bindClickNavigate(srcMarker, node, 'dst');
        this._layerGroup.addLayer(srcMarker);

        const angle = Math.atan2(destPoint.y - node.y, destPoint.x - node.x) * 180 / Math.PI;
        const arrowIcon = L.divIcon({
            className: 'transport-arrow-icon',
            html: `<span class="transport-arrow" style="border-left-color:${color}; transform: rotate(${angle}deg);"></span>`,
            iconSize: [ARROW_ICON_SIZE, ARROW_ICON_SIZE],
            iconAnchor: [ARROW_ICON_SIZE / 2, ARROW_ICON_SIZE / 2],
        });

        const arrowMarker = L.marker(dstLatLng, {
            icon: arrowIcon,
            interactive: true,
            pane: 'transport-nodes',
        });
        this._bindHoverTooltip(arrowMarker, tooltipText);
        this._bindClickNavigate(arrowMarker, node, 'src');
        this._layerGroup.addLayer(arrowMarker);

        const destRect = this._getDestRect(node);
        if (destRect && destRect.dest_plane === node.plane) {
            const destBounds = L.latLngBounds(
                [destRect.dest_min_y, destRect.dest_min_x],
                [destRect.dest_max_y, destRect.dest_max_x]
            );
            const rect = L.rectangle(destBounds, {
                color: color,
                weight: 1,
                fillOpacity: 0.15,
                pane: 'transport-nodes',
            });
            this._bindHoverTooltip(rect, tooltipText);
            this._bindClickNavigate(rect, node, 'src');
            this._layerGroup.addLayer(rect);

            const centerLatLng = destBounds.getCenter();
            const destMarker = L.circleMarker(centerLatLng, {
                radius: 4,
                color: color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.9,
                pane: 'transport-nodes',
            });
            this._bindHoverTooltip(destMarker, tooltipText);
            this._bindClickNavigate(destMarker, node, 'src');
            this._layerGroup.addLayer(destMarker);
        }
    },

    _buildTooltip: function (node) {
        const src = `(${node.x}, ${node.y}, ${node.plane})`;
        const destPoint = this._getDestPoint(node);
        const dst = this._isValidPoint(destPoint)
            ? `(${destPoint.x}, ${destPoint.y}, ${destPoint.plane})`
            : '(unknown)';
        const destRect = this._getDestRect(node);
        const dstLabel = destRect
            ? `[${destRect.dest_min_x},${destRect.dest_min_y}] -> [${destRect.dest_max_x},${destRect.dest_max_y}] (p${destRect.dest_plane})`
            : dst;

        const detailLine = this._detailLine(node);
        const detailHtml = detailLine ? `<div class="transport-tooltip-line">${detailLine}</div>` : '';
        return `
<div class="transport-tooltip-body">
  <div class="transport-tooltip-title">${node.kind} #${node.id}</div>
  <div class="transport-tooltip-line">${src} <span class="transport-tooltip-arrow">→</span> ${dstLabel}</div>
  ${detailHtml}
</div>`;
    },

    _addDestinationOnly: function (node, color) {
        const tooltipText = this._buildTooltip(node);
        const destPoint = this._getDestPoint(node);
        if (!this._isValidPoint(destPoint)) {
            return;
        }

        const destLatLng = L.latLng(destPoint.y, destPoint.x);
        const destMarker = L.circleMarker(destLatLng, {
            radius: 4,
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.9,
            pane: 'transport-nodes',
        });
        this._bindHoverTooltip(destMarker, tooltipText);
        const target = node.shadowFromZero ? 'dst' : 'src';
        this._bindClickNavigate(destMarker, node, target);
        this._layerGroup.addLayer(destMarker);

        const destRect = this._getDestRect(node);
        if (destRect && destRect.dest_plane === node.plane) {
            const destBounds = L.latLngBounds(
                [destRect.dest_min_y, destRect.dest_min_x],
                [destRect.dest_max_y, destRect.dest_max_x]
            );
            const rect = L.rectangle(destBounds, {
                color: color,
                weight: 1,
                fillOpacity: 0.15,
                pane: 'transport-nodes',
            });
            this._bindHoverTooltip(rect, tooltipText);
            this._bindClickNavigate(rect, node, target);
            this._layerGroup.addLayer(rect);
        }
    },

    _detailLine: function (node) {
        if (!node.detail) {
            return '';
        }
        if (node.kind === 'npc') {
            return `npc: ${node.detail.npc_name} (#${node.detail.npc_id}) action: ${node.detail.action}`;
        }
        if (node.kind === 'object') {
            return `object: ${node.detail.object_name} (#${node.detail.object_id}) action: ${node.detail.action}`;
        }
        if (node.kind === 'item') {
            return `item: ${node.detail.name} (#${node.detail.item_id}) action: ${node.detail.action}`;
        }
        if (node.kind === 'door') {
            return `door: ${node.detail.open_action || ''} dir: ${node.detail.direction || ''}` +
                ` ids: ${node.detail.real_id_open}/${node.detail.real_id_closed}`;
        }
        if (node.kind === 'lodestone') {
            return `lodestone: ${node.detail.lodestone}`;
        }
        if (node.kind === 'fairy_ring') {
            return `fairy ring: ${node.detail.code || ''} obj: ${node.detail.object_id || ''} action: ${node.detail.action || ''}`;
        }
        return '';
    },

    _bindHoverTooltip: function (layer, tooltipHtml) {
        layer.bindTooltip(tooltipHtml, {
            sticky: false,
            className: 'transport-tooltip',
            interactive: false,
            opacity: 0.95,
            direction: 'top',
            offset: [0, -6],
        });
    },

    _bindClickNavigate: function (layer, node, target) {
        layer.on('click', () => {
            this._focusLocation(node, target);
        });
    },

    _focusLocation: function (node, target) {
        if (!this._map) {
            return;
        }
        let point;
        if (target === 'dst') {
            point = this._getDestPoint(node);
        } else {
            point = { x: node.x, y: node.y, plane: node.plane };
        }
        if (point && this._map.setPlane) {
            this._map.setPlane(point.plane);
        }
        if (point) {
            this._map.setView([point.y, point.x], Math.max(this._map.getZoom(), 1));
        }
    },
});
