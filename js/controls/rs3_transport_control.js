'use strict';

import { loadRS3TransportData } from '../data/sheets_loader.js';

// Group categories for cleaner UI
const RS3_CATEGORY_GROUPS = {
    agility: {
        label: 'Agility',
        color: '#2ecc71',
        patterns: [
            'Agility shortcuts',
            'Agility Pyramid',
            'Agility Course',
            'Agility Arena',
            'Runespan obstacles',
            'Gully',
        ],
    },
    doors: {
        label: 'Doors & Gates',
        color: '#e67e22',
        patterns: [
            'Door',
            'Gate',
            'Large door',
            'Combat barrier',
            'Wilderness wall',
        ],
    },
    stairs_ladders: {
        label: 'Stairs & Ladders',
        color: '#9b59b6',
        patterns: [
            'Stairs',
            'Ladder',
            'Staircase',
        ],
    },
    transport: {
        label: 'Transport',
        color: '#3498db',
        patterns: [
            'Boats',
            'Charter ship',
            'Balloons',
            'Gnome gliders',
            'Magic carpet',
            'Spirit tree',
            'Portmaster Kags',
        ],
    },
    fairy_rings: {
        label: 'Fairy Rings',
        color: '#ff6ad5',
        patterns: [
            'Fairy ring',
            'fairy ring',
        ],
    },
    dungeons: {
        label: 'Dungeons',
        color: '#e74c3c',
        patterns: [
            'Dungeon entrances',
            'Resource Dungeons',
            'Underground Pass',
            'Abyss',
        ],
    },
    portals: {
        label: 'Portals',
        color: '#f1c40f',
        patterns: [
            'portal',
            'Portal',
            'obelisks',
            'Jennica',
        ],
    },
    interactive: {
        label: 'Interactive',
        color: '#1abc9c',
        patterns: [
            'NPCs',
            'Interactive scenery',
            'Misc items',
            'Prifddinas',
            'Player owned',
            'Temple of Light',
            'Poison Waste',
        ],
    },
};

const ARROW_ICON_SIZE = 12;

function getCategoryForGroup(groupName) {
    for (const [category, config] of Object.entries(RS3_CATEGORY_GROUPS)) {
        if (config.patterns.some(pattern => groupName.includes(pattern))) {
            return category;
        }
    }
    return 'interactive'; // default fallback
}

function makeLocationKey(x, y) {
    return `${Math.floor(x)},${Math.floor(y)}`;
}

export const RS3TransportControl = L.Control.extend({
    options: {
        position: 'topleft',
    },

    onAdd: function (map) {
        map.createPane('rs3-transport');
        map.getPane('rs3-transport').style.display = 'none';
        map.getPane('rs3-transport').style.zIndex = 450;

        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        this._layerGroup = L.layerGroup();
        map.addLayer(this._layerGroup);

        this._enabled = false;
        this._nodesByPlane = new Map();
        this._categoryVisibility = {};
        this._categories = Object.keys(RS3_CATEGORY_GROUPS);

        this._categories.forEach((category) => {
            this._categoryVisibility[category] = false;
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

    getCategories: function () {
        return this._categories.slice();
    },

    getCategoryConfig: function (category) {
        return RS3_CATEGORY_GROUPS[category];
    },

    isCategoryEnabled: function (category) {
        return !!this._categoryVisibility[category];
    },

    setCategoryEnabled: function (category, enabled) {
        if (this._categoryVisibility[category] !== enabled) {
            this._categoryVisibility[category] = enabled;
            this._updateVisibility();
        }
    },

    toggleCategory: function (category) {
        this.setCategoryEnabled(category, !this._categoryVisibility[category]);
    },

    _updateVisibility: function () {
        const visibleCategories = this._categories.filter((cat) => this._categoryVisibility[cat]);
        if (visibleCategories.length) {
            if (!this._enabled) {
                this._enabled = true;
                this._map.getPane('rs3-transport').style.display = '';
            }
            this._refreshNodes();
        } else {
            this._enabled = false;
            this._map.getPane('rs3-transport').style.display = 'none';
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
                // Group nodes by destination location (for arrows)
                const destGroups = new Map();

                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    if (!this._categoryVisibility[node.category]) {
                        continue;
                    }

                    if (node.shadow) {
                        // Shadow nodes only show at destination
                        const dstX = node.dst_x;
                        const dstY = node.dst_y;
                        if (dstX !== undefined && dstY !== undefined &&
                            this._pointInBounds(dstX, dstY, minX, maxX, minY, maxY)) {
                            const key = makeLocationKey(dstX, dstY);
                            if (!destGroups.has(key)) {
                                destGroups.set(key, { x: dstX, y: dstY, nodes: [] });
                            }
                            destGroups.get(key).nodes.push(node);
                        }
                    } else {
                        // Regular nodes - group by source
                        const srcX = node.x;
                        const srcY = node.y;
                        if (srcX !== undefined && srcY !== undefined &&
                            this._pointInBounds(srcX, srcY, minX, maxX, minY, maxY)) {
                            const key = makeLocationKey(srcX, srcY);
                            if (!sourceGroups.has(key)) {
                                sourceGroups.set(key, { x: srcX, y: srcY, nodes: [] });
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
                console.error('Failed to load RS3 transport nodes', error);
                this._setStatus('Failed to load');
            });
    },

    _ensureNodes: function () {
        if (this._nodesByPlane.size) {
            return Promise.resolve(this._nodesByPlane);
        }

        return loadRS3TransportData().then((nodes) => {
            // Process and group nodes by plane
            nodes.forEach((node) => {
                const category = getCategoryForGroup(node.groupName);
                const color = RS3_CATEGORY_GROUPS[category]?.color || '#888888';

                const srcPlane = node.origin?.plane ?? 0;
                const dstPlane = node.destination?.plane ?? 0;

                const processedNode = {
                    id: node.rowNumber,
                    groupName: node.groupName,
                    category: category,
                    color: color,
                    oneway: node.oneway || false,
                    x: node.origin?.x,
                    y: node.origin?.y,
                    plane: srcPlane,
                    dst_x: node.destination?.x,
                    dst_y: node.destination?.y,
                    dst_plane: dstPlane,
                };

                if (processedNode.x !== undefined && processedNode.y !== undefined) {
                    if (!this._nodesByPlane.has(srcPlane)) {
                        this._nodesByPlane.set(srcPlane, []);
                    }
                    this._nodesByPlane.get(srcPlane).push(processedNode);
                }

                // Add shadow node if destination is on different plane
                if (dstPlane !== srcPlane && node.destination?.x !== undefined) {
                    if (!this._nodesByPlane.has(dstPlane)) {
                        this._nodesByPlane.set(dstPlane, []);
                    }
                    this._nodesByPlane.get(dstPlane).push({
                        ...processedNode,
                        plane: dstPlane,
                        shadow: true,
                    });
                }
            });

            return this._nodesByPlane;
        });
    },

    _addGroupedMarker: function (group, type) {
        const nodes = group.nodes;
        const x = group.x;
        const y = group.y;
        const latLng = L.latLng(y, x);

        // Determine marker color - use mixed color if multiple categories
        const categories = [...new Set(nodes.map(n => n.category))];
        const primaryColor = nodes[0].color;
        const hasMultiple = nodes.length > 1;

        // Create the marker
        const marker = L.circleMarker(latLng, {
            radius: hasMultiple ? 6 : 4,
            color: hasMultiple ? '#ffffff' : primaryColor,
            weight: hasMultiple ? 2 : 2,
            fillColor: primaryColor,
            fillOpacity: 0.9,
            pane: 'rs3-transport',
        });

        // Add count badge for multiple nodes
        if (hasMultiple) {
            const badgeIcon = L.divIcon({
                className: 'rs3-transport-badge',
                html: `<span class="rs3-badge-count">${nodes.length}</span>`,
                iconSize: [16, 16],
                iconAnchor: [-2, 18],
            });
            const badge = L.marker(latLng, {
                icon: badgeIcon,
                interactive: false,
                pane: 'rs3-transport',
            });
            this._layerGroup.addLayer(badge);
        }

        // Build hover tooltip showing count
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
                if (node.dst_x !== undefined && node.dst_y !== undefined) {
                    this._addTransportLine(node);
                }
            });
        }
    },

    _addTransportLine: function (node) {
        const srcLatLng = L.latLng(node.y, node.x);
        const dstLatLng = L.latLng(node.dst_y, node.dst_x);

        // Draw line with lower opacity
        const polyline = L.polyline([srcLatLng, dstLatLng], {
            color: node.color,
            weight: 1.5,
            opacity: 0.5,
            pane: 'rs3-transport',
        });
        this._layerGroup.addLayer(polyline);

        // Arrow at destination
        const angle = Math.atan2(node.dst_y - node.y, node.dst_x - node.x) * 180 / Math.PI;
        const arrowIcon = L.divIcon({
            className: 'transport-arrow-icon',
            html: `<span class="transport-arrow" style="border-left-color:${node.color}; transform: rotate(${angle}deg); opacity: 0.7;"></span>`,
            iconSize: [ARROW_ICON_SIZE, ARROW_ICON_SIZE],
            iconAnchor: [ARROW_ICON_SIZE / 2, ARROW_ICON_SIZE / 2],
        });

        const arrowMarker = L.marker(dstLatLng, {
            icon: arrowIcon,
            interactive: false,
            pane: 'rs3-transport',
        });
        this._layerGroup.addLayer(arrowMarker);
    },

    _showNodeListPopup: function (latLng, nodes, type) {
        const listItems = nodes.map((node, index) => {
            const dst = node.dst_x !== undefined
                ? `→ (${node.dst_x}, ${node.dst_y}, ${node.dst_plane})`
                : '';
            const onewayBadge = node.oneway
                ? '<span class="rs3-oneway-badge">one-way</span>'
                : '';
            const colorDot = `<span class="rs3-color-dot" style="background-color:${node.color};"></span>`;

            return `
<div class="rs3-popup-item" data-index="${index}">
  ${colorDot}
  <div class="rs3-popup-item-content">
    <div class="rs3-popup-item-title">${node.groupName} #${node.id} ${onewayBadge}</div>
    <div class="rs3-popup-item-dest">${dst}</div>
  </div>
  <div class="rs3-popup-item-actions">
    ${node.dst_x !== undefined ? `<button class="rs3-goto-btn" data-action="goto-dst" title="Go to destination">→</button>` : ''}
    <button class="rs3-goto-btn" data-action="goto-src" title="Go to source">◎</button>
  </div>
</div>`;
        }).join('');

        const popupContent = `
<div class="rs3-transport-popup">
  <div class="rs3-popup-header">
    <span class="rs3-popup-title">${nodes.length} Transport${nodes.length > 1 ? 's' : ''}</span>
    <span class="rs3-popup-coords">(${Math.floor(nodes[0].x || nodes[0].dst_x)}, ${Math.floor(nodes[0].y || nodes[0].dst_y)})</span>
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

                // Click on item row to highlight/show details
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.rs3-goto-btn')) return;
                    // Toggle selection
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

    _pointInBounds: function (x, y, minX, maxX, minY, maxY) {
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    },

    _buildTooltip: function (node) {
        const src = node.x !== undefined ? `(${node.x}, ${node.y}, ${node.plane})` : '(unknown)';
        const dst = node.dst_x !== undefined ? `(${node.dst_x}, ${node.dst_y}, ${node.dst_plane})` : '(unknown)';
        const onewayLabel = node.oneway ? ' <span style="color:#e74c3c;">(one-way)</span>' : '';

        return `
<div class="transport-tooltip-body">
  <div class="transport-tooltip-title">${node.groupName} #${node.id}</div>
  <div class="transport-tooltip-line">${src} <span class="transport-tooltip-arrow">→</span> ${dst}${onewayLabel}</div>
</div>`;
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
        if (!this._map) return;

        let point;
        if (target === 'dst' && node.dst_x !== undefined) {
            point = { x: node.dst_x, y: node.dst_y, plane: node.dst_plane };
        } else if (node.x !== undefined) {
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
