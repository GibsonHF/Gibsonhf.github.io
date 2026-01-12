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

const KIND_LABELS = {
    door: 'Door',
    item: 'Item',
    lodestone: 'Lodestone',
    npc: 'NPC',
    object: 'Object',
    fairy_ring: 'Fairy Ring',
};

const ARROW_ICON_SIZE = 12;

function makeLocationKey(x, y) {
    return `${Math.floor(x)},${Math.floor(y)}`;
}

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
                this._layerGroup.clearLayers();

                // Group nodes by source location
                const sourceGroups = new Map();
                // Group nodes by destination location (for shadows)
                const destGroups = new Map();

                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    if (!this._kindVisibility[node.kind]) {
                        continue;
                    }

                    if (node.shadow) {
                        // Shadow nodes show at destination
                        const destPoint = this._getDestPoint(node);
                        if (this._isValidPoint(destPoint) && destPoint.plane === node.plane) {
                            if (this._pointInBounds(destPoint.x, destPoint.y, minX, maxX, minY, maxY)) {
                                const key = makeLocationKey(destPoint.x, destPoint.y);
                                if (!destGroups.has(key)) {
                                    destGroups.set(key, { x: destPoint.x, y: destPoint.y, nodes: [] });
                                }
                                destGroups.get(key).nodes.push(node);
                            }
                        }
                    } else {
                        // Regular nodes - group by source
                        const srcPoint = this._makePoint(node.x, node.y, node.plane);
                        if (this._isValidPoint(srcPoint) &&
                            this._pointInBounds(srcPoint.x, srcPoint.y, minX, maxX, minY, maxY)) {
                            const key = makeLocationKey(srcPoint.x, srcPoint.y);
                            if (!sourceGroups.has(key)) {
                                sourceGroups.set(key, { x: srcPoint.x, y: srcPoint.y, nodes: [] });
                            }
                            sourceGroups.get(key).nodes.push(node);
                        }
                    }
                }

                let visibleCount = 0;

                // Render source groups
                sourceGroups.forEach((group) => {
                    this._addGroupedMarker(group, 'source');
                    visibleCount += group.nodes.length;
                });

                // Render destination-only groups (shadows)
                destGroups.forEach((group) => {
                    this._addGroupedMarker(group, 'destination');
                    visibleCount += group.nodes.length;
                });

                this._setStatus(`${visibleCount} nodes at ${sourceGroups.size + destGroups.size} locations`);
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

    _addGroupedMarker: function (group, type) {
        const nodes = group.nodes;
        const x = group.x;
        const y = group.y;
        const latLng = L.latLng(y, x);

        const primaryColor = KIND_COLORS[nodes[0].kind] || '#ffffff';
        const hasMultiple = nodes.length > 1;

        // Create the marker
        const marker = L.circleMarker(latLng, {
            radius: hasMultiple ? 6 : 4,
            color: hasMultiple ? '#ffffff' : primaryColor,
            weight: hasMultiple ? 2 : 2,
            fillColor: primaryColor,
            fillOpacity: 0.9,
            pane: 'transport-nodes',
        });

        // Add count badge for multiple nodes
        if (hasMultiple) {
            const badgeIcon = L.divIcon({
                className: 'transport-badge',
                html: `<span class="transport-badge-count">${nodes.length}</span>`,
                iconSize: [16, 16],
                iconAnchor: [-2, 18],
            });
            const badge = L.marker(latLng, {
                icon: badgeIcon,
                interactive: false,
                pane: 'transport-nodes',
            });
            this._layerGroup.addLayer(badge);
        }

        // Build hover tooltip
        if (hasMultiple) {
            const tooltipHtml = `
<div class="transport-tooltip-body">
  <div class="transport-tooltip-title">${nodes.length} transports at (${Math.floor(x)}, ${Math.floor(y)})</div>
  <div class="transport-tooltip-line" style="color:#8b949e;">Click to see all options</div>
</div>`;
            marker.bindTooltip(tooltipHtml, {
                sticky: false,
                className: 'transport-tooltip',
                interactive: false,
                opacity: 0.95,
                direction: 'top',
                offset: [0, -6],
            });
        } else {
            this._bindHoverTooltip(marker, this._buildTooltip(nodes[0]));
        }

        // Click handler - show popup with list
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._showNodeListPopup(latLng, nodes, type);
        });

        this._layerGroup.addLayer(marker);

        // Draw lines to destinations for source markers
        if (type === 'source') {
            nodes.forEach(node => {
                this._addTransportLine(node);
            });
        }
    },

    _addTransportLine: function (node) {
        const color = KIND_COLORS[node.kind] || '#ffffff';
        const srcPoint = this._makePoint(node.x, node.y, node.plane);
        const destPoint = this._getDestPoint(node);

        if (!this._isValidPoint(srcPoint) || !this._isValidPoint(destPoint)) {
            return;
        }

        const srcLatLng = L.latLng(srcPoint.y, srcPoint.x);
        const dstLatLng = L.latLng(destPoint.y, destPoint.x);

        // Draw line with lower opacity
        const polyline = L.polyline([srcLatLng, dstLatLng], {
            color: color,
            weight: 1.5,
            opacity: 0.5,
            pane: 'transport-nodes',
        });
        this._layerGroup.addLayer(polyline);

        // Arrow at destination
        const angle = Math.atan2(destPoint.y - srcPoint.y, destPoint.x - srcPoint.x) * 180 / Math.PI;
        const arrowIcon = L.divIcon({
            className: 'transport-arrow-icon',
            html: `<span class="transport-arrow" style="border-left-color:${color}; transform: rotate(${angle}deg); opacity: 0.7;"></span>`,
            iconSize: [ARROW_ICON_SIZE, ARROW_ICON_SIZE],
            iconAnchor: [ARROW_ICON_SIZE / 2, ARROW_ICON_SIZE / 2],
        });

        const arrowMarker = L.marker(dstLatLng, {
            icon: arrowIcon,
            interactive: false,
            pane: 'transport-nodes',
        });
        this._layerGroup.addLayer(arrowMarker);

        // Draw destination rectangle if applicable
        const destRect = this._getDestRect(node);
        if (destRect && destRect.dest_plane === node.plane) {
            const destBounds = L.latLngBounds(
                [destRect.dest_min_y, destRect.dest_min_x],
                [destRect.dest_max_y, destRect.dest_max_x]
            );
            const rect = L.rectangle(destBounds, {
                color: color,
                weight: 1,
                fillOpacity: 0.1,
                pane: 'transport-nodes',
            });
            this._layerGroup.addLayer(rect);
        }
    },

    _showNodeListPopup: function (latLng, nodes, type) {
        const listItems = nodes.map((node, index) => {
            const destPoint = this._getDestPoint(node);
            const dst = this._isValidPoint(destPoint)
                ? `→ (${destPoint.x}, ${destPoint.y}, ${destPoint.plane})`
                : '';
            const colorDot = `<span class="rs3-color-dot" style="background-color:${KIND_COLORS[node.kind] || '#fff'};"></span>`;
            const kindLabel = KIND_LABELS[node.kind] || node.kind;
            const detailText = this._getDetailText(node);

            return `
<div class="rs3-popup-item" data-index="${index}">
  ${colorDot}
  <div class="rs3-popup-item-content">
    <div class="rs3-popup-item-title">${kindLabel} #${node.id}</div>
    ${detailText ? `<div class="rs3-popup-item-detail">${detailText}</div>` : ''}
    <div class="rs3-popup-item-dest">${dst}</div>
  </div>
  <div class="rs3-popup-item-actions">
    ${this._isValidPoint(destPoint) ? `<button class="rs3-goto-btn" data-action="goto-dst" title="Go to destination">→</button>` : ''}
    <button class="rs3-goto-btn" data-action="goto-src" title="Go to source">◎</button>
  </div>
</div>`;
        }).join('');

        const popupContent = `
<div class="rs3-transport-popup">
  <div class="rs3-popup-header">
    <span class="rs3-popup-title">${nodes.length} Transport${nodes.length > 1 ? 's' : ''}</span>
    <span class="rs3-popup-coords">(${Math.floor(nodes[0].x)}, ${Math.floor(nodes[0].y)})</span>
  </div>
  <div class="rs3-popup-list">
    ${listItems}
  </div>
</div>`;

        const popup = L.popup({
            className: 'rs3-transport-popup-container',
            maxWidth: 350,
            minWidth: 280,
            autoPan: true,
        })
            .setLatLng(latLng)
            .setContent(popupContent)
            .openOn(this._map);

        // Attach click handlers after popup opens
        setTimeout(() => {
            const container = popup.getElement();
            if (!container) return;

            container.querySelectorAll('.rs3-popup-item').forEach((item) => {
                const index = parseInt(item.dataset.index);
                const node = nodes[index];

                // Click on item row to highlight
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.rs3-goto-btn')) return;
                    item.classList.toggle('selected');
                });

                // Go to destination button
                const gotoDstBtn = item.querySelector('[data-action="goto-dst"]');
                if (gotoDstBtn) {
                    gotoDstBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._map.closePopup();
                        this._focusLocation(node, 'dst');
                    });
                }

                // Go to source button
                const gotoSrcBtn = item.querySelector('[data-action="goto-src"]');
                if (gotoSrcBtn) {
                    gotoSrcBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._map.closePopup();
                        this._focusLocation(node, 'src');
                    });
                }
            });
        }, 10);
    },

    _getDetailText: function (node) {
        if (!node.detail) return '';

        if (node.kind === 'npc') {
            return `${node.detail.npc_name} - ${node.detail.action}`;
        }
        if (node.kind === 'object') {
            return `${node.detail.object_name} - ${node.detail.action}`;
        }
        if (node.kind === 'item') {
            return `${node.detail.name} - ${node.detail.action}`;
        }
        if (node.kind === 'door') {
            return `${node.detail.open_action || 'Open'} (${node.detail.direction || ''})`;
        }
        if (node.kind === 'lodestone') {
            return node.detail.lodestone;
        }
        if (node.kind === 'fairy_ring') {
            return node.detail.code || '';
        }
        return '';
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

    _buildTooltip: function (node) {
        const src = `(${node.x}, ${node.y}, ${node.plane})`;
        const destPoint = this._getDestPoint(node);
        const dst = this._isValidPoint(destPoint)
            ? `(${destPoint.x}, ${destPoint.y}, ${destPoint.plane})`
            : '(unknown)';
        const destRect = this._getDestRect(node);
        const dstLabel = destRect
            ? `[${destRect.dest_min_x},${destRect.dest_min_y}] → [${destRect.dest_max_x},${destRect.dest_max_y}]`
            : dst;

        const detailLine = this._detailLine(node);
        const detailHtml = detailLine ? `<div class="transport-tooltip-line">${detailLine}</div>` : '';
        const kindLabel = KIND_LABELS[node.kind] || node.kind;

        return `
<div class="transport-tooltip-body">
  <div class="transport-tooltip-title">${kindLabel} #${node.id}</div>
  <div class="transport-tooltip-line">${src} <span class="transport-tooltip-arrow">→</span> ${dstLabel}</div>
  ${detailHtml}
</div>`;
    },

    _detailLine: function (node) {
        if (!node.detail) {
            return '';
        }
        if (node.kind === 'npc') {
            return `${node.detail.npc_name} (#${node.detail.npc_id}) - ${node.detail.action}`;
        }
        if (node.kind === 'object') {
            return `${node.detail.object_name} (#${node.detail.object_id}) - ${node.detail.action}`;
        }
        if (node.kind === 'item') {
            return `${node.detail.name} (#${node.detail.item_id}) - ${node.detail.action}`;
        }
        if (node.kind === 'door') {
            return `${node.detail.open_action || 'Open'} ${node.detail.direction || ''}`;
        }
        if (node.kind === 'lodestone') {
            return node.detail.lodestone;
        }
        if (node.kind === 'fairy_ring') {
            return `Code: ${node.detail.code || 'N/A'}`;
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
